/**
 * The inspector, as the web shows it on a phone (`components/DetailPanel.tsx`
 * in a bottom sheet): a 44px header with the swatch, name and path, then the
 * component's sections — what it is, its connections, its payloads — or a
 * plane's. Editors get the header's Edit toggle and the form's fields, each
 * committing as you leave it, as on the web.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { lookupType } from "@archer/catalog";
import {
  findComponent,
  findPlane,
  format,
  isShape,
  pathToString,
  planeTree,
  scopeAt,
  setComponentMeta,
  SHAPE_INFO,
  type ArchDoc,
  type ComponentNode,
  type PlaneNode,
} from "@archer/lang";
import { connectionsOf, type LinkDirection } from "@web/connectionsOf";
import { useDoc, type RepoInfo } from "@/lib/doc";
import { useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";
import { PayloadReadout } from "./Payload";
import { Glyph, GlyphSwatch, hasGlyph } from "./TypeIcon";
import { BottomPanel, Button, Chip, IconButton, Input, Menu, ReadRow, Section, TextArea, Txt } from "./ui";

const DIRECTION: Record<LinkDirection, { label: string; icon: IconName }> = {
  out: { label: "Outgoing", icon: "arrow-right" },
  in: { label: "Incoming", icon: "arrow-left" },
  both: { label: "Both ways", icon: "swap" },
  none: { label: "Undirected", icon: "minus" },
};

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

/** Where a `src` entry opens (the web's `sourceHref`): a URL as it is, a repo path on GitHub. */
const sourceHref = (src: string, repo: RepoInfo | undefined): string | null =>
  isHttpUrl(src)
    ? src
    : repo
      ? `https://github.com/${repo.owner}/${repo.name}/tree/${encodeURIComponent(repo.branch)}/${src.replace(/^\.?\//, "")}`
      : null;

/** The bottom sheet for what's selected on the canvas. */
export function Inspector({
  doc,
  path,
  onClose,
  onOpen,
  onSelect,
  readOnly,
}: {
  doc: ArchDoc;
  /** Full dotted path of the selected component or plane. */
  path: string;
  /** Nothing can change (an old version is on the canvas). */
  readOnly?: boolean;
  onClose: () => void;
  /** Open a component: show its own canvas. */
  onOpen: (path: string) => void;
  /** Select another component (a connection's far end, something on a plane). */
  onSelect: (path: string) => void;
}) {
  const segments = path.split(".");
  const component = findComponent(doc, segments);
  const plane = component ? undefined : findPlane(doc, segments);
  return (
    <BottomPanel>
      {component ? (
        <ComponentInspector key={path} doc={doc} path={path} node={component} onClose={onClose} onOpen={onOpen} onSelect={onSelect} readOnly={readOnly} />
      ) : plane ? (
        <PlaneInspector key={path} doc={doc} path={path} plane={plane} onClose={onClose} onSelect={onSelect} />
      ) : null}
    </BottomPanel>
  );
}

function Header({
  node,
  title,
  subtitle,
  children,
  onClose,
}: {
  node: ComponentNode | PlaneNode;
  title: string;
  subtitle: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
      }}
    >
      {hasGlyph(node) && <GlyphSwatch node={node} box={24} size={14} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt weight="600" numberOfLines={1} style={{ lineHeight: 17 }}>
          {title}
        </Txt>
        <Txt size="xs" tone="ink3" mono numberOfLines={1} style={{ lineHeight: 14 }}>
          {subtitle}
        </Txt>
      </View>
      {children}
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
  );
}

function ComponentInspector({
  doc,
  path,
  node,
  onClose,
  onOpen,
  onSelect,
  readOnly,
}: {
  doc: ArchDoc;
  path: string;
  node: ComponentNode;
  onClose: () => void;
  onOpen: (path: string) => void;
  onSelect: (path: string) => void;
  readOnly?: boolean;
}) {
  const d = useDoc();
  const [editing, setEditing] = useState(false);
  const inside = node.children.length;
  const editable = d.editable && d.save !== undefined && !readOnly;
  return (
    <View style={{ flex: 1 }}>
      <Header node={node} title={node.name ?? node.id} subtitle={path} onClose={onClose}>
        {editable && (
          <Button
            size="sm"
            title={editing ? "Done" : "Edit"}
            icon={editing ? "check" : "pencil"}
            onPress={() => setEditing((e) => !e)}
          />
        )}
        {inside > 0 && (
          <Menu
            trigger={({ open, toggle }) => <IconButton icon="more" label="More" active={open} onPress={toggle} />}
            items={[{ label: "Open", hint: `${inside} inside`, icon: "open", onSelect: () => onOpen(path) }]}
          />
        )}
      </Header>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {editing ? (
          <ComponentForm doc={doc} path={path} node={node} />
        ) : (
          <ComponentDetails doc={doc} path={path} node={node} repo={d.repo} onOpen={inside > 0 ? () => onOpen(path) : undefined} onSelect={onSelect} />
        )}
      </ScrollView>
    </View>
  );
}

/** A component as it reads: what it is, what it's for, where its code lives, its connections and payloads. */
function ComponentDetails({
  doc,
  path,
  node,
  repo,
  onOpen,
  onSelect,
}: {
  doc: ArchDoc;
  path: string;
  node: ComponentNode;
  repo: RepoInfo | undefined;
  onOpen?: () => void;
  onSelect: (path: string) => void;
}) {
  const { palette } = useTheme();
  const typeName = lookupType(node.type)?.name;
  const sources = node.src ?? [];
  const inside = node.children.length;
  const links = useMemo(() => connectionsOf(doc, path.split(".")), [doc, path]);
  return (
    <>
      <Section title="Component">
        <ReadRow label="Type">
          {node.type === undefined ? (
            <Txt tone="ink3">Untyped</Txt>
          ) : (
            <TypeLine node={node} name={typeName} />
          )}
        </ReadRow>
        {node.shape !== undefined && (
          <ReadRow label="Shape">
            {isShape(node.shape) ? (
              <Txt numberOfLines={1}>{SHAPE_INFO[node.shape].name}</Txt>
            ) : (
              <Txt tone="ink3">
                <Txt mono tone="ink3">
                  {node.shape}
                </Txt>{" "}
                (unknown, drawn as a box)
              </Txt>
            )}
          </ReadRow>
        )}
        <ReadRow label="Description">
          {node.desc ? <Txt selectable>{node.desc}</Txt> : <Txt tone="ink3">No description</Txt>}
        </ReadRow>
        {sources.length > 0 && (
          <ReadRow label={sources.length > 1 ? "Sources" : "Source"}>
            <View style={{ gap: 4 }}>
              {sources.map((src, i) => {
                const href = sourceHref(src, repo);
                return href ? (
                  <Pressable key={`${i}:${src}`} onPress={() => void Linking.openURL(href)} hitSlop={4}>
                    <Txt size="sm" mono tone="accent" style={{ lineHeight: 20 }}>
                      {src} <Icon name="external" size={12} color={palette.accent} />
                    </Txt>
                  </Pressable>
                ) : (
                  <Txt key={`${i}:${src}`} size="sm" mono style={{ lineHeight: 20 }} selectable>
                    {src}
                  </Txt>
                );
              })}
            </View>
          </ReadRow>
        )}
        {inside > 0 && (
          <ReadRow label="Inside">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt>
                {inside} component{inside === 1 ? "" : "s"}
              </Txt>
              {onOpen && (
                <Pressable onPress={onOpen} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Txt size="sm" tone="accent">
                    Open
                  </Txt>
                  <Icon name="chevron-right" size={12} color={palette.accent} />
                </Pressable>
              )}
            </View>
          </ReadRow>
        )}
      </Section>
      <Section title="Connections" action={links.length > 0 ? <Chip label={String(links.length)} /> : undefined} last={node.payloads.length === 0}>
        {links.length === 0 ? (
          <Txt tone="ink3" style={{ paddingVertical: 4 }}>
            No connections
          </Txt>
        ) : (
          <View style={{ marginHorizontal: -6 }}>
            {links.map((link) => {
              const far = findComponent(doc, link.far);
              const part = pathToString(link.near) === path ? null : findComponent(doc, link.near);
              const detail = [
                part && `${link.direction === "in" ? "to" : "from"} ${part.name ?? part.id}`,
                link.conn.label && `“${link.conn.label}”`,
              ].filter(Boolean);
              return (
                <Pressable
                  key={link.index}
                  onPress={far ? () => onSelect(pathToString(link.far)) : undefined}
                  accessibilityLabel={`${DIRECTION[link.direction].label}: ${far?.name ?? pathToString(link.far)}`}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: pressed ? palette.surface2 : "transparent",
                  })}
                >
                  <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center" }}>
                    <Icon name={DIRECTION[link.direction].icon} size={14} color={palette.ink3} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 }}>
                      {far ? (
                        <>
                          {hasGlyph(far) && <Glyph node={far} size={14} />}
                          <Txt numberOfLines={1} style={{ flexShrink: 1 }}>
                            {far.name ?? far.id}
                          </Txt>
                        </>
                      ) : (
                        <Txt size="sm" mono numberOfLines={1}>
                          {pathToString(link.far)}
                        </Txt>
                      )}
                      {link.conn.type && (
                        <Txt size="xs" tone="ink3" mono numberOfLines={1} style={{ marginLeft: "auto", paddingLeft: 8 }}>
                          @{link.conn.type}
                        </Txt>
                      )}
                    </View>
                    {detail.length > 0 && (
                      <Txt size="xs" tone="ink3" numberOfLines={1}>
                        {detail.join(" · ")}
                      </Txt>
                    )}
                  </View>
                  {link.conn.payloads.length > 0 && (
                    <Chip label={`${link.conn.payloads.length} payload${link.conn.payloads.length === 1 ? "" : "s"}`} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </Section>
      {node.payloads.length > 0 && (
        <Section title="Payloads" last>
          {node.payloads.map((p, i) => (
            <PayloadReadout key={p.name} payload={p} first={i === 0} />
          ))}
        </Section>
      )}
    </>
  );
}

/** Glyph, type name, then the tag in mono (the inspector's Type row). */
function TypeLine({ node, name }: { node: ComponentNode | PlaneNode; name: string | undefined }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 }}>
      <Glyph node={node} size={14} />
      {name && (
        <Txt numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Txt>
      )}
      <Txt size="xs" tone="ink3" mono numberOfLines={1} style={{ flexShrink: 1 }}>
        @{node.type}
      </Txt>
    </View>
  );
}

const TYPE_TAG = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/** The component's form (a subset of the web's): name, type, description, each saved as you leave it. */
function ComponentForm({ doc, path, node }: { doc: ArchDoc; path: string; node: ComponentNode }) {
  const d = useDoc();
  const [name, setName] = useState(node.name ?? "");
  const [type, setType] = useState(node.type ?? "");
  const [desc, setDesc] = useState(node.desc ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(node.name ?? "");
    setType(node.type ?? "");
    setDesc(node.desc ?? "");
  }, [node.name, node.type, node.desc]);

  const commit = (meta: Parameters<typeof setComponentMeta>[2]) => {
    setError(null);
    void d.save?.(format(setComponentMeta(doc, path.split("."), meta))).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };
  const tag = type.trim().replace(/^@/, "");
  const typeInvalid = tag !== "" && !TYPE_TAG.test(tag);
  const known = tag !== "" && !typeInvalid ? lookupType(tag) : undefined;

  return (
    <Section title="Component" last>
      <ReadRow label="Name" align="center">
        <Input
          value={name}
          onChangeText={setName}
          placeholder={node.id}
          returnKeyType="done"
          onEndEditing={() => {
            const n = name.trim();
            if (n !== (node.name ?? "")) commit({ name: n === "" || n === node.id ? null : n });
          }}
        />
      </ReadRow>
      <ReadRow label="Id" align="center">
        <Txt size="sm" mono tone="ink2">
          {path}
        </Txt>
      </ReadRow>
      <ReadRow label="Type" align="center">
        <Input
          value={type}
          onChangeText={setType}
          placeholder="service"
          autoCapitalize="none"
          mono
          invalid={typeInvalid}
          onEndEditing={() => {
            if (typeInvalid || tag === (node.type ?? "")) return;
            commit({ type: tag === "" ? null : tag });
          }}
        />
        <Txt size="xs" tone={typeInvalid ? "danger" : "ink3"} style={{ paddingTop: 2 }}>
          {typeInvalid ? "Types look like postgres or aws.s3" : tag === "" ? "Untyped" : (known?.name ?? "Custom type")}
        </Txt>
      </ReadRow>
      <ReadRow label="Description">
        <TextArea
          value={desc}
          onChangeText={setDesc}
          placeholder="What it does, and why it's here"
          onEndEditing={() => {
            const v = desc.trim();
            if (v !== (node.desc ?? "")) commit({ desc: v === "" ? null : v });
          }}
        />
      </ReadRow>
      {error && (
        <Txt size="sm" tone="danger" style={{ paddingTop: 6 }}>
          {error}
        </Txt>
      )}
    </Section>
  );
}

function PlaneInspector({
  doc,
  path,
  plane,
  onClose,
  onSelect,
}: {
  doc: ArchDoc;
  path: string;
  plane: PlaneNode;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const { palette } = useTheme();
  const typeName = lookupType(plane.type)?.name;
  const scopePath = path.split(".").slice(0, -1);
  const scope = scopeAt(doc, scopePath);
  const on = scope ? planeTree(scope).itemsOn(planeTree(scope).plane(plane.id)) : [];
  return (
    <View style={{ flex: 1 }}>
      <Header node={plane} title={plane.name ?? plane.id} subtitle={`plane · ${path}`} onClose={onClose} />
      <ScrollView style={{ flex: 1 }}>
        <Section title="Plane" last>
          <ReadRow label="Type">{plane.type === undefined ? <Txt tone="ink3">Untyped</Txt> : <TypeLine node={plane} name={typeName} />}</ReadRow>
          <ReadRow label="Description">{plane.desc ? <Txt selectable>{plane.desc}</Txt> : <Txt tone="ink3">No description</Txt>}</ReadRow>
          <ReadRow label="On it">
            {on.length === 0 ? (
              <Txt tone="ink3">Nothing yet</Txt>
            ) : (
              <View style={{ alignItems: "flex-start", gap: 2 }}>
                {on.map((item) => {
                  const itemPath = [...scopePath, item.id].join(".");
                  return (
                    <Pressable key={itemPath} onPress={() => onSelect(itemPath)} hitSlop={4} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 }}>
                      {item.kind === "plane" ? (
                        <Icon name="plane" size={14} color={palette.ink3} />
                      ) : (
                        hasGlyph(item) && <Glyph node={item} size={14} />
                      )}
                      <Txt numberOfLines={1}>{item.name ?? item.id}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ReadRow>
        </Section>
      </ScrollView>
    </View>
  );
}
