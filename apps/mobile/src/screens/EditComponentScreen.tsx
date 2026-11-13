/**
 * Edit a component's name, type and description on the phone. The change
 * goes through the language's own transform (`setComponentMeta`) and the
 * canonical formatter, exactly as an edit in the web inspector does.
 */

import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { lookupType } from "@archer/catalog";
import { findComponent, format, setComponentMeta } from "@archer/lang";
import { DocGate } from "@/components/DocGate";
import { Button, Empty, Input, Screen, Section, Txt } from "@/components/ui";
import { useDoc } from "@/lib/doc";
import { usePathParam } from "./ComponentScreen";

const TYPE_TAG = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

export function EditComponentScreen() {
  return (
    <DocGate>
      <EditComponent />
    </DocGate>
  );
}

function EditComponent() {
  const d = useDoc();
  const router = useRouter();
  const path = usePathParam();
  const node = useMemo(() => findComponent(d.doc, path), [d.doc, path]);
  const [name, setName] = useState(node?.name ?? "");
  const [type, setType] = useState(node?.type ? `@${node.type}` : "");
  const [desc, setDesc] = useState(node?.desc ?? "");
  const [saving, setSaving] = useState(false);

  if (!d.editable || !d.save) return <Empty icon="lock" title="Read only" body="You can view this document, but not change it." />;
  if (!node) return <Empty icon="squares-four" title="Not in this document" />;

  const tag = type.trim().replace(/^@/, "");
  const typeProblem = tag !== "" && !TYPE_TAG.test(tag) ? "Types look like @postgres or @aws.s3." : null;
  const known = tag !== "" && !typeProblem ? lookupType(tag) : undefined;

  const save = async () => {
    setSaving(true);
    try {
      const next = setComponentMeta(d.doc, path, {
        name: name.trim() === "" || name.trim() === node.id ? null : name.trim(),
        type: tag === "" ? null : tag,
        desc: desc.trim() === "" ? null : desc.trim(),
      });
      await d.save!(format(next));
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: "Edit component",
          headerRight: () => (
            <Button
              title="Save"
              variant="primary"
              loading={saving}
              disabled={typeProblem !== null}
              onPress={() => void save()}
              style={{ minHeight: 34, paddingHorizontal: 14 }}
            />
          ),
        }}
      />
      <Section title="Name" plain>
        <Input value={name} onChangeText={setName} placeholder={node.id} returnKeyType="done" />
        <Txt size="xs" tone="ink3" style={{ paddingHorizontal: 4 }}>
          Its id stays {path.join(".")}, so connections keep pointing at it.
        </Txt>
      </Section>
      <Section title="Type" plain>
        <Input value={type} onChangeText={setType} placeholder="@service" autoCapitalize="none" autoCorrect={false} mono />
        <Txt size="xs" tone={typeProblem ? "danger" : "ink3"} style={{ paddingHorizontal: 4 }}>
          {typeProblem ?? (tag === "" ? "No type: drawn as a plain box." : known ? known.name : "Not in the catalog: drawn as a custom type.")}
        </Txt>
      </Section>
      <Section title="Description" plain>
        <View>
          <Input
            value={desc}
            onChangeText={setDesc}
            placeholder="What it does, and why it's here"
            multiline
            textAlignVertical="top"
            style={{ minHeight: 140 }}
          />
        </View>
      </Section>
    </Screen>
  );
}
