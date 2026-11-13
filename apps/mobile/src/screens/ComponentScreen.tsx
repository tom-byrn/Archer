/**
 * One component, as the web's inspector shows it: its type, description,
 * where it lives in the code, what's inside it (its own canvas), its
 * connections and its payloads. Everything links on: the components it
 * connects to, the ones nested in it, the ones it's nested in.
 */

import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { lookupType } from "@archer/catalog";
import { findComponent, scopeOf } from "@archer/lang";
import { connectionsOf, type LinkDirection } from "@web/connectionsOf";
import { DiagramThumb } from "@/components/Diagram";
import { DocGate } from "@/components/DocGate";
import type { IconName } from "@/components/Icon";
import { PayloadView } from "@/components/Payload";
import { TypeIcon } from "@/components/TypeIcon";
import { Button, Chip, Empty, IconButton, Row, Screen, Section, Txt } from "@/components/ui";
import { useDoc } from "@/lib/doc";
import { canvasRows, displayName, trail } from "@/lib/outline";
import { plural } from "@/lib/text";
import { useTheme } from "@/lib/theme";
import { ComponentRow, canvasHref, componentHref } from "./DocumentHome";

const ARROW: Record<LinkDirection, IconName> = {
  out: "arrow-right",
  in: "arrow-left",
  both: "arrows-left-right",
  none: "minus",
};

export function ComponentScreen() {
  return (
    <DocGate>
      <Component />
    </DocGate>
  );
}

/** The `path` search param as segments. */
export function usePathParam(): string[] {
  const { path } = useLocalSearchParams<{ path?: string }>();
  return useMemo(() => (path ? path.split(".").filter((s) => s !== "") : []), [path]);
}

/** Where a `src` entry opens: a URL as is, a repository path on the document's linked repository. */
function srcUrl(src: string, repo: ReturnType<typeof useDoc>["repo"]): string | null {
  if (/^https?:\/\//i.test(src)) return src;
  if (!repo) return null;
  const path = src.replace(/^\.?\//, "");
  return `https://github.com/${repo.owner}/${repo.name}/tree/${encodeURIComponent(repo.branch)}/${path}`;
}

function Component() {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const path = usePathParam();
  const node = useMemo(() => findComponent(d.doc, path), [d.doc, path]);
  const links = useMemo(() => connectionsOf(d.doc, path), [d.doc, path]);
  const parents = useMemo(() => trail(d.doc, path).slice(0, -1), [d.doc, path]);

  if (!node)
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <Empty icon="squares-four" title="Not in this document" body={`Nothing is at ${path.join(".")} any more.`} />
      </>
    );

  const type = lookupType(node.type);
  const inside = canvasRows(scopeOf(node), path);
  const nameOf = (p: readonly string[]) => {
    const t = trail(d.doc, p);
    return t.map((e) => displayName(e.node)).join(" › ") || p.join(".");
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: displayName(node),
          headerRight: d.editable
            ? () => (
                <IconButton
                  icon="pencil"
                  label="Edit component"
                  onPress={() =>
                    router.push({ pathname: `${d.base}/edit-component`, params: { path: path.join(".") } } as unknown as Href)
                  }
                />
              )
            : undefined,
        }}
      />

      <View style={{ gap: 12 }}>
        {parents.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {parents.map((p, i) => (
              <Pressable key={p.path.join(".")} onPress={() => router.push(componentHref(d, p.path))} hitSlop={6}>
                <Txt size="sm" tone="accent">
                  {displayName(p.node)}
                  {i < parents.length - 1 ? "  ›" : ""}
                </Txt>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <TypeIcon node={node} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt size="2xl" display numberOfLines={2}>
              {displayName(node)}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {node.type && <Chip label={`@${node.type}`} mono />}
              {type && type.name !== displayName(node) && <Chip label={type.name} />}
              {node.type && !type && <Chip label="Custom type" tone="warn" />}
            </View>
          </View>
        </View>
        {node.desc ? (
          <Txt tone="ink2" selectable>
            {node.desc}
          </Txt>
        ) : null}
      </View>

      {node.src && node.src.length > 0 && (
        <Section title="In the code">
          {node.src.map((s, i) => {
            const url = srcUrl(s, d.repo);
            return (
              <Row
                key={s}
                first={i === 0}
                icon={/^https?:/i.test(s) ? "globe" : "file-text"}
                title={
                  <Txt size="sm" mono numberOfLines={1} tone={url ? "accent" : "ink"}>
                    {s}
                  </Txt>
                }
                onPress={url ? () => void Linking.openURL(url) : undefined}
                chevron={false}
              />
            );
          })}
        </Section>
      )}

      {inside.length > 0 && (
        <Section
          title={`Inside · ${plural(node.children.length, "component")}`}
          action={
            <Pressable onPress={() => router.push(canvasHref(d, path))} hitSlop={8}>
              <Txt size="sm" tone="accent" weight="600">
                Open canvas
              </Txt>
            </Pressable>
          }
        >
          <Pressable
            onPress={() => router.push(canvasHref(d, path))}
            accessibilityRole="button"
            accessibilityLabel={`Open the canvas inside ${displayName(node)}`}
            style={{ backgroundColor: palette.ground, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }}
          >
            <DiagramThumb source={d.source} path={path} height={200} />
          </Pressable>
          {inside.map((row, i) =>
            row.kind === "plane" ? (
              <Row
                key={`plane:${row.path.join(".")}`}
                first={i === 0}
                indent={row.depth}
                leading={<TypeIcon node={row.node} size={26} />}
                title={displayName(row.node)}
                subtitle="Plane"
              />
            ) : (
              <ComponentRow
                key={row.path.join(".")}
                first={i === 0}
                indent={row.depth}
                node={row.node as typeof node}
                onPress={() => router.push(componentHref(d, row.path))}
              />
            ),
          )}
        </Section>
      )}

      {links.length > 0 && (
        <Section title={plural(links.length, "connection")}>
          {links.map((l, i) => {
            const label = [l.conn.type && `@${l.conn.type}`, l.conn.label].filter(Boolean).join(" · ");
            const below = trail(d.doc, l.near).slice(path.length).map((e) => displayName(e.node));
            const via = below.length > 0 ? `via ${below.join(" › ")}` : "";
            return (
              <Row
                key={l.index}
                first={i === 0}
                icon={ARROW[l.direction]}
                title={nameOf(l.far)}
                subtitle={[label, via, l.conn.payloads.length > 0 && plural(l.conn.payloads.length, "payload")].filter(Boolean).join(" · ") || undefined}
                onPress={() => router.push(componentHref(d, l.far))}
              />
            );
          })}
        </Section>
      )}

      {node.payloads.length > 0 && (
        <Section title={plural(node.payloads.length, "payload")} plain>
          <View style={{ gap: 16 }}>
            {node.payloads.map((p) => (
              <PayloadView key={p.name} payload={p} />
            ))}
          </View>
        </Section>
      )}

      <Section title="Details">
        <Detail first label="Path" value={path.join(".")} mono />
        {node.shape && <Detail label="Shape" value={node.shape} />}
        {node.icon && <Detail label="Icon" value={node.icon} mono />}
        {node.color && <Detail label="Color" value={node.color} mono />}
      </Section>

      {d.editable && (
        <Button
          title="Edit details"
          icon="pencil"
          onPress={() =>
            router.push({ pathname: `${d.base}/edit-component`, params: { path: path.join(".") } } as unknown as Href)
          }
        />
      )}
    </Screen>
  );
}

function Detail({ label, value, mono, first }: { label: string; value: string; mono?: boolean; first?: boolean }) {
  return (
    <Row
      first={first}
      title={
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Txt tone="ink3" style={{ width: 64 }}>
            {label}
          </Txt>
          <Txt mono={mono} selectable style={{ flex: 1 }} numberOfLines={2}>
            {value}
          </Txt>
        </View>
      }
    />
  );
}
