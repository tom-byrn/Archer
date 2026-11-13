/**
 * One saved version of a document: who made it, what changed from the version
 * before (the language's semantic diff: layout moves aren't changes), and the
 * diagram as it was. Editors can restore it.
 */

import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { diffDocs, parse, type ChangeKind } from "@archer/lang";
import { CodeView } from "@/components/CodeView";
import { DiagramThumb } from "@/components/Diagram";
import { DocGate } from "@/components/DocGate";
import { authorIcon, authorLabel } from "@/components/HistoryList";
import { Icon } from "@/components/Icon";
import { Button, Card, Chip, Empty, Row, Screen, Section, Segmented, Txt } from "@/components/ui";
import { api, type Id } from "@/lib/convex";
import { useDoc } from "@/lib/doc";
import { relativeTime } from "@/lib/text";
import { useTheme } from "@/lib/theme";

export function RevisionScreen() {
  return (
    <DocGate>
      <Revision />
    </DocGate>
  );
}

const KIND: Record<ChangeKind, { label: string; tone: "accent" | "danger" | "warn" }> = {
  added: { label: "Added", tone: "accent" },
  removed: { label: "Removed", tone: "danger" },
  changed: { label: "Changed", tone: "warn" },
};

function Revision() {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const [view, setView] = useState<"diagram" | "code">("diagram");
  const [restoring, setRestoring] = useState(false);
  const all = useQuery(
    api.revisions.listFull,
    d.documentId && d.workspaceId ? { documentId: d.documentId, workspaceId: d.workspaceId, limit: 200 } : "skip",
  );

  const found = useMemo(() => {
    if (!all) return undefined;
    const i = all.findIndex((r) => r._id === (rev as Id<"revisions">));
    if (i < 0) return null;
    return { rev: all[i]!, before: all[i + 1] };
  }, [all, rev]);

  const diff = useMemo(() => {
    if (!found) return null;
    const next = parse(found.rev.source).doc;
    return found.before ? diffDocs(parse(found.before.source).doc, next) : null;
  }, [found]);

  if (found === undefined) return <Empty loading />;
  if (found === null) return <Empty icon="history" title="Version not found" body="It may be older than the history kept here." />;

  const r = found.rev;
  const current = r.source === d.source;
  const changes = diff
    ? [
        ...diff.components.map((c) => ({ key: `c:${c.path}`, kind: c.kind, what: c.path, detail: c.fields?.join(", ") })),
        ...diff.planes.map((p) => ({ key: `p:${p.path}`, kind: p.kind, what: `Plane ${p.path}`, detail: p.fields?.join(", ") })),
        ...diff.connections.map((c) => ({
          key: `x:${c.key}`,
          kind: c.kind,
          what: `${c.connection.source.join(".")} ${c.connection.arrow} ${c.connection.target.join(".")}`,
          detail: c.kind === "changed" ? "payloads" : [c.connection.type && `@${c.connection.type}`, c.connection.label].filter(Boolean).join(" · "),
        })),
      ]
    : [];

  const restore = () =>
    Alert.alert("Restore this version?", "The document goes back to this version. Its history keeps every version.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          setRestoring(true);
          try {
            await d.save!(r.source, `Restored the version from ${new Date(r.createdAt).toLocaleString()}`);
            router.back();
          } catch (e) {
            Alert.alert("Couldn't restore it", e instanceof Error ? e.message : String(e));
          } finally {
            setRestoring(false);
          }
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: relativeTime(r.createdAt) }} />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ padding: 10, borderRadius: 10, backgroundColor: palette.surface2 }}>
          <Icon name={authorIcon(r.author)} size={20} color={palette.ink2} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size="lg" weight="600">
            {r.summary ?? authorLabel(r.author)}
          </Txt>
          <Txt size="sm" tone="ink3">
            {authorLabel(r.author)} · {new Date(r.createdAt).toLocaleString()}
          </Txt>
          {current && <Chip label="Current version" tone="accent" />}
        </View>
      </View>

      <Section title={diff ? (changes.length === 0 ? "No changes to the architecture" : `${changes.length} change${changes.length === 1 ? "" : "s"}`) : "First version"}>
        {!diff ? (
          <Row first title="The document's first saved version." />
        ) : changes.length === 0 ? (
          <Row first title={diff.title ? `Renamed to “${diff.title.to}”` : "Only the layout moved."} />
        ) : (
          changes.map((c, i) => (
            <Row
              key={c.key}
              first={i === 0}
              leading={<Chip label={KIND[c.kind].label} tone={KIND[c.kind].tone} />}
              title={
                <Txt size="sm" mono numberOfLines={2}>
                  {c.what}
                </Txt>
              }
              subtitle={c.detail || undefined}
            />
          ))
        )}
      </Section>

      <Segmented
        value={view}
        options={[
          { value: "diagram", label: "Diagram" },
          { value: "code", label: "Code" },
        ]}
        onChange={setView}
      />
      {view === "diagram" ? (
        <Card style={{ backgroundColor: palette.ground }}>
          <DiagramThumb source={r.source} height={320} />
        </Card>
      ) : (
        <CodeView source={r.source} />
      )}

      {d.editable && !current && <Button title="Restore this version" icon="arrow-counter-clockwise" loading={restoring} onPress={restore} />}
    </Screen>
  );
}
