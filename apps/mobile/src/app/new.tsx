/**
 * Start a document in the selected workspace: blank, or from one of the
 * dashboard's samples (`apps/web/lib/samples`, saved verbatim as on the web).
 */

import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { format, parse } from "@archer/lang";
import { SAMPLES } from "@web/samples";
import { DiagramThumb } from "@/components/Diagram";
import { Icon } from "@/components/Icon";
import { Button, Input, Screen, Section, Txt } from "@/components/ui";
import { api, canEdit } from "@/lib/convex";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { useWorkspace } from "@/lib/workspace";
import { SignedInOnly } from "@/screens/sources";

export default function NewRoute() {
  return (
    <SignedInOnly>
      <NewDocument />
    </SignedInOnly>
  );
}

/** A source's header title replaced, the rest kept (the dashboard's `withTitle`). */
const withTitle = (source: string, title: string): string => format({ ...parse(source).doc, title });

function NewDocument() {
  const router = useRouter();
  const { palette } = useTheme();
  const { workspaceId, current, role } = useWorkspace();
  const create = useMutation(api.documents.create);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<string>("blank");
  const [busy, setBusy] = useState(false);
  const sample = SAMPLES.find((s) => s.slug === start);

  const submit = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const name = title.trim() || sample?.title || "Untitled";
      const source = sample
        ? title.trim() === "" ? sample.source : withTitle(sample.source, name)
        : format({ ...parse('arch "Untitled" v0.2\n').doc, title: name });
      const id = await create({ workspaceId, title: name, source });
      router.dismiss();
      router.push(`/documents/${id}` as Href);
    } catch (e) {
      Alert.alert("Couldn't create it", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit(role))
    return (
      <Screen>
        <Txt tone="ink2">You're a viewer in {current?.name ?? "this workspace"}, so you can't add documents to it.</Txt>
      </Screen>
    );

  const option = (key: string, label: string, body: string, preview?: string) => {
    const on = start === key;
    return (
      <Pressable
        key={key}
        onPress={() => setStart(key)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={{
          borderRadius: RADIUS.xl,
          borderWidth: on ? 2 : StyleSheet.hairlineWidth,
          borderColor: on ? palette.accent : palette.line,
          backgroundColor: palette.surface,
          overflow: "hidden",
        }}
      >
        {preview && (
          <View style={{ backgroundColor: palette.ground }}>
            <DiagramThumb source={preview} height={120} />
          </View>
        )}
        <View style={{ padding: 12, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="600">{label}</Txt>
            <Txt size="sm" tone="ink3">
              {body}
            </Txt>
          </View>
          {on && <Icon name="check" color={palette.accent} />}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Section title="Title" plain>
        <Input value={title} onChangeText={setTitle} placeholder={sample?.title ?? "Untitled"} autoFocus returnKeyType="done" />
      </Section>
      <Section title="Start from" plain>
        <View style={{ gap: 12 }}>
          {option("blank", "Blank", "An empty canvas.")}
          {SAMPLES.map((s) => option(s.slug, s.title, s.description, s.source))}
        </View>
      </Section>
      <Button title={`Create in ${current?.name ?? "workspace"}`} variant="primary" icon="plus" loading={busy} onPress={() => void submit()} />
    </Screen>
  );
}
