/**
 * A document: its diagram (tap a component to open it), its components as a
 * list (with search across every level), its code, and — for documents in a
 * workspace — its history of changes by people, agents and commits.
 */

import { useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { compileForAgent, type ComponentNode } from "@archer/lang";
import { DocGate } from "@/components/DocGate";
import { useRenderedCanvas, ZoomableDiagram } from "@/components/Diagram";
import { CodeView } from "@/components/CodeView";
import { Diagnostics } from "@/components/Diagnostics";
import { DocActions } from "@/components/DocActions";
import { HistoryList } from "@/components/HistoryList";
import { TypeIcon } from "@/components/TypeIcon";
import { Button, Input, Row, Screen, Section, Segmented, Txt } from "@/components/ui";
import { ProvideDoc, useDoc, type DocValue } from "@/lib/doc";
import { canvasRows, displayName, docStats, searchComponents } from "@/lib/outline";
import { plural } from "@/lib/text";
import { useTheme } from "@/lib/theme";

type Tab = "diagram" | "components" | "code" | "history";

export function DocumentHome() {
  return (
    <DocGate>
      <Home />
    </DocGate>
  );
}

function Home() {
  const d = useDoc();
  const [tab, setTab] = useState<Tab>("diagram");
  const options: { value: Tab; label: string }[] = [
    { value: "diagram", label: "Diagram" },
    { value: "components", label: "Components" },
    { value: "code", label: "Code" },
    ...(d.kind === "document" ? [{ value: "history" as const, label: "History" }] : []),
  ];
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen
        options={{
          title: d.title,
          // The header renders outside this screen's provider: hand it the document.
          headerRight: () => (
            <ProvideDoc value={d}>
              <DocActions />
            </ProvideDoc>
          ),
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <Segmented value={tab} options={options} onChange={setTab} />
      </View>
      <View style={{ flex: 1 }}>
        {tab === "diagram" && <DiagramTab onShowCode={() => setTab("code")} />}
        {tab === "components" && <ComponentsTab />}
        {tab === "code" && <CodeTab />}
        {tab === "history" && <HistoryTab />}
      </View>
    </View>
  );
}

export const componentHref = (d: DocValue, path: readonly string[]): Href =>
  ({ pathname: `${d.base}/component`, params: { path: path.join(".") } }) as unknown as Href;

export const canvasHref = (d: DocValue, path: readonly string[]): Href =>
  ({ pathname: `${d.base}/canvas`, params: { path: path.join(".") } }) as unknown as Href;

function DiagramTab({ onShowCode }: { onShowCode: () => void }) {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const rendered = useRenderedCanvas(d.source, [], { showTitle: false, background: false });
  return (
    <View style={{ flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }}>
      <ZoomableDiagram rendered={rendered} onPressComponent={(box) => router.push(componentHref(d, [box.path]))} />
      {d.errors > 0 && (
        <View style={{ position: "absolute", left: 12, top: 12 }}>
          <Button
            title={plural(d.errors, "error")}
            icon="warning"
            variant="danger"
            onPress={onShowCode}
            style={{ minHeight: 34, paddingHorizontal: 12 }}
          />
        </View>
      )}
    </View>
  );
}

function ComponentsTab() {
  const d = useDoc();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => canvasRows(d.doc), [d.doc]);
  const found = useMemo(() => searchComponents(d.doc, query), [d.doc, query]);
  const stats = useMemo(() => docStats(d.doc), [d.doc]);
  const searching = query.trim() !== "";

  return (
    <Screen>
      {d.summary && (
        <Section title="About this example" plain>
          <Txt tone="ink2">{d.summary.replace(/`([^`]+)`/g, "$1")}</Txt>
        </Section>
      )}
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${plural(stats.components, "component")}`}
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {searching ? (
        <Section title={plural(found.length, "match", "matches")}>
          {found.length === 0 ? (
            <Row first title="Nothing matches" subtitle="Search looks at names, ids, types and descriptions." />
          ) : (
            found.map(({ path, node }, i) => (
              <ComponentRow
                key={path.join(".")}
                first={i === 0}
                node={node}
                subtitle={path.length > 1 ? path.slice(0, -1).join(" › ") : (node.type ? `@${node.type}` : undefined)}
                onPress={() => router.push(componentHref(d, path))}
              />
            ))
          )}
        </Section>
      ) : rows.length === 0 ? (
        <Section>
          <Row first title="No components yet" />
        </Section>
      ) : (
        <Section title={`${plural(stats.components, "component")} · ${plural(stats.connections, "connection")}`}>
          {rows.map((row, i) =>
            row.kind === "plane" ? (
              <Row
                key={`plane:${row.path.join(".")}`}
                first={i === 0}
                indent={row.depth}
                leading={<TypeIcon node={row.node} size={26} />}
                title={<Txt size="sm" weight="600" tone="ink2" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{displayName(row.node)}</Txt>}
                subtitle={row.node.type ? `@${row.node.type}` : "Plane"}
              />
            ) : (
              <ComponentRow
                key={row.path.join(".")}
                first={i === 0}
                indent={row.depth}
                node={row.node as ComponentNode}
                onPress={() => router.push(componentHref(d, row.path))}
              />
            ),
          )}
        </Section>
      )}
    </Screen>
  );
}

export function ComponentRow({
  node,
  onPress,
  first,
  indent,
  subtitle,
}: {
  node: ComponentNode;
  onPress: () => void;
  first?: boolean;
  indent?: number;
  subtitle?: string;
}) {
  const inside = node.children.length;
  return (
    <Row
      first={first}
      indent={indent}
      leading={<TypeIcon node={node} />}
      title={displayName(node)}
      subtitle={
        subtitle ??
        (node.type ? (
          <Txt size="sm" tone="ink3" mono numberOfLines={1}>
            @{node.type}
          </Txt>
        ) : undefined)
      }
      detail={inside > 0 ? `${inside} inside` : undefined}
      onPress={onPress}
    />
  );
}

function CodeTab() {
  const d = useDoc();
  const router = useRouter();
  const [copied, setCopied] = useState<"code" | "agent" | null>(null);
  const lines = useMemo(
    () =>
      new Set(
        d.diagnostics.filter((x) => x.severity === "error" && x.span).map((x) => x.span!.start.line),
      ),
    [d.diagnostics],
  );
  const copy = async (what: "code" | "agent") => {
    await Clipboard.setStringAsync(what === "code" ? d.source : compileForAgent(d.doc));
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button title="Copy code" icon={copied === "code" ? "check" : "copy"} onPress={() => void copy("code")} style={{ flexGrow: 1 }} />
        <Button title="Copy for agent" icon={copied === "agent" ? "check" : "robot"} onPress={() => void copy("agent")} style={{ flexGrow: 1 }} />
        {d.editable && (
          <Button
            title="Edit"
            icon="pencil"
            variant="primary"
            onPress={() => router.push(`${d.base}/edit` as Href)}
            style={{ flexGrow: 1 }}
          />
        )}
      </View>
      {d.diagnostics.length > 0 && <Diagnostics diagnostics={d.diagnostics} />}
      <CodeView source={d.source} highlightLines={lines} />
    </Screen>
  );
}

function HistoryTab() {
  return <HistoryList />;
}
