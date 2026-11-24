/**
 * A document, as the web shows one on a phone (`components/DocumentViewer.tsx`
 * and the editor's header): a 40px bar — back, title, a chip, code, history
 * and more — over the canvas. Tapping a component selects it and opens the
 * inspector sheet; "Open" shows the canvas inside it, with a breadcrumb back
 * out. History shows any saved version on the canvas, to restore it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery } from "convex/react";
import { compileForAgent, findComponent, parse } from "@archer/lang";
import { CodeDialog } from "@/components/CodeDialog";
import { Canvas, useRenderedCanvas } from "@/components/Diagram";
import { DocGate } from "@/components/DocGate";
import { HistoryPanel, type Revision } from "@/components/HistoryPanel";
import { Icon } from "@/components/Icon";
import { Inspector } from "@/components/Inspector";
import { ShareDialog } from "@/components/ShareDialog";
import { Button, Chip, IconButton, Menu, Txt, type MenuEntry } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { api, canEdit } from "@/lib/convex";
import { useDoc } from "@/lib/doc";
import { SITE_URL } from "@/lib/env";
import { shareUrl } from "@/lib/links";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";

export function DocumentScreen() {
  return (
    <DocGate>
      <Viewer />
    </DocGate>
  );
}

function Viewer() {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [focus, setFocus] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewing, setViewing] = useState<Revision | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const source = viewing?.source ?? d.source;
  const doc = useMemo(() => (viewing ? parse(viewing.source).doc : d.doc), [viewing, d.doc]);

  // A canvas or selection that no longer exists (an agent's edit) falls back.
  const liveFocus = useMemo(() => (focus.length > 0 && !findComponent(doc, focus) ? [] : focus), [focus, doc]);
  const onCanvas =
    selected !== null && selected.split(".").length > liveFocus.length && selected.startsWith(liveFocus.length ? `${liveFocus.join(".")}.` : "")
      ? selected.split(".")[liveFocus.length]!
      : null;

  const rendered = useRenderedCanvas(source, liveFocus, { selected: onCanvas });

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);
  const copy = (kind: "code" | "agent") => {
    void Clipboard.setStringAsync(kind === "agent" ? compileForAgent(doc) : source);
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notify(kind === "agent" ? "Copied for agent" : "Copied .arch source");
  };

  const exportItems: MenuEntry[] = [
    {
      label: "Copy for agent",
      hint: d.errors === 0 ? "Layout included, language guide prepended" : "Fix validation errors first",
      icon: "sparkle",
      disabled: d.errors > 0,
      onSelect: () => copy("agent"),
    },
    { label: "Copy .arch source", hint: "Exactly what the code pane shows", icon: "copy", onSelect: () => copy("code") },
  ];

  const panelOpen = selected !== null || historyOpen;
  const panelHeight = historyOpen ? Math.round(height * 0.7) : selected !== null ? Math.round(height * 0.55) : 0;
  const readOnlyChip = d.kind === "example" ? "Example" : !d.editable ? "View only" : null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, backgroundColor: palette.surface }}>
        <View
          style={{
            height: 40,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={8}
            style={({ pressed }) => ({
              height: 28,
              paddingHorizontal: 6,
              borderRadius: 6,
              justifyContent: "center",
              backgroundColor: pressed ? palette.surface2 : "transparent",
            })}
          >
            <Icon name="chevron-left" size={16} color={palette.ink2} />
          </Pressable>
          <Txt weight="500" numberOfLines={1} style={{ flexShrink: 1, paddingHorizontal: 4 }}>
            {viewing ? doc.title : d.title}
          </Txt>
          {readOnlyChip && <Chip label={readOnlyChip} style={{ marginLeft: 4 }} />}
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 }}>
            {toast && (
              <Txt size="xs" tone="accent" style={{ paddingRight: 8 }}>
                {toast}
              </Txt>
            )}
            <IconButton icon="code" label={codeOpen ? "Hide code" : "Show code"} active={codeOpen} onPress={() => setCodeOpen(true)} />
            {d.kind === "document" && (
              <HistoryButton
                active={historyOpen}
                onPress={() => {
                  setSelected(null);
                  setHistoryOpen((o) => !o);
                }}
              />
            )}
            {d.kind === "document" ? (
              <Menu
                width={240}
                trigger={({ open, toggle }) => <IconButton icon="more" label="More" active={open} onPress={toggle} />}
                items={[
                  ...(d.editable ? [{ label: "Share", icon: "link" as const, onSelect: () => setShareOpen(true) }, "separator" as const] : []),
                  ...exportItems,
                  "separator",
                  {
                    label: "Open on the web",
                    icon: "external",
                    onSelect: () => void Linking.openURL(`${SITE_URL}/documents/${d.documentId}`),
                  },
                ]}
              />
            ) : (
              <PublicMenu exportItems={exportItems} />
            )}
          </View>
        </View>
      </View>

      {liveFocus.length > 0 && (
        <View
          style={{
            height: 32,
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
            backgroundColor: palette.surface,
            paddingHorizontal: 8,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 2 }}>
            <Crumb label={doc.title} onPress={() => (setFocus([]), setSelected(null))} />
            {liveFocus.map((seg, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Icon name="chevron-right" size={12} color={palette.ink3} />
                <Crumb
                  label={findComponent(doc, liveFocus.slice(0, i + 1))?.name ?? seg}
                  current={i === liveFocus.length - 1}
                  onPress={() => (setFocus(liveFocus.slice(0, i + 1)), setSelected(null))}
                />
              </View>
            ))}
          </ScrollView>
          <Button
            size="sm"
            variant="ghost"
            title="Up"
            icon="chevron-left"
            onPress={() => {
              setFocus(liveFocus.slice(0, -1));
              setSelected(null);
            }}
          />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Canvas
          rendered={rendered}
          selected={onCanvas}
          fitKey={`${liveFocus.join(".")}|${viewing?._id ?? ""}|${historyOpen ? "history" : ""}`}
          bottomInset={panelOpen ? panelHeight - insets.bottom : 0}
          onSelect={(box) => {
            setHistoryOpen(false);
            setSelected(box ? [...liveFocus, box.path].join(".") : null);
          }}
        />
        {selected !== null && !historyOpen && (
          <Inspector
            doc={doc}
            path={selected}
            readOnly={viewing !== null}
            onClose={() => setSelected(null)}
            onOpen={(path) => {
              setFocus(path.split("."));
              setSelected(null);
            }}
            onSelect={(path) => {
              setFocus(path.split(".").slice(0, -1));
              setSelected(path);
            }}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            viewing={viewing?._id ?? null}
            onView={(rev) => {
              setViewing(rev);
              setSelected(null);
            }}
            onRestore={(src) => {
              void d.save?.(src, "Restored an earlier version").then(() => setViewing(null));
            }}
            onClose={() => {
              setHistoryOpen(false);
              setViewing(null);
            }}
          />
        )}
      </View>

      <CodeDialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title={d.title}
        source={d.source}
        {...(d.editable && d.save && !viewing ? { onSave: (s: string) => d.save!(s) } : {})}
      />
      {shareOpen && d.documentId && d.workspaceId && (
        <ShareDialog
          open
          onClose={() => setShareOpen(false)}
          title={d.title}
          documentId={d.documentId}
          workspaceId={d.workspaceId}
          publicSlug={d.publicSlug}
        />
      )}
    </View>
  );
}

function Crumb({ label, onPress, current }: { label: string; onPress: () => void; current?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: pressed ? palette.surface2 : "transparent" })}
    >
      <Txt size="sm" weight={current ? "500" : "400"} tone={current ? "ink" : "ink2"} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * The editor's History button: lit while the panel is open, with an accent
 * dot while agents or commits have changed the document since you last
 * looked. Opening the panel marks them reviewed.
 */
function HistoryButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const d = useDoc();
  const { palette } = useTheme();
  const revisions = useQuery(
    api.revisions.list,
    d.documentId && d.workspaceId ? { documentId: d.documentId, workspaceId: d.workspaceId } : "skip",
  );
  const markSeen = useMutation(api.documents.markSeen);
  const seen = d.seenRevisionAt ?? 0;
  const unseen = (revisions ?? []).filter((r) => r.author.kind !== "user" && r.createdAt > seen).length;
  useEffect(() => {
    if (active && unseen > 0 && d.editable && d.documentId && d.workspaceId)
      void markSeen({ id: d.documentId, workspaceId: d.workspaceId });
  }, [active, unseen, d.editable, d.documentId, d.workspaceId, markSeen]);
  return (
    <IconButton label={`Activity · ${revisions?.length ?? 0} revisions`} active={active} onPress={onPress}>
      <Icon name="history" size={18} color={active ? palette.ink : palette.ink2} />
      {unseen > 0 && (
        <View
          style={{
            position: "absolute",
            right: 4,
            top: 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: palette.accent,
            borderWidth: 2,
            borderColor: palette.surface,
          }}
        />
      )}
    </IconButton>
  );
}

/** A share link's or an example's menu: copy it, open it on the web, save a copy when signed in. */
function PublicMenu({ exportItems }: { exportItems: MenuEntry[] }) {
  const { isSignedIn } = useAccount();
  return isSignedIn ? <PublicMenuSignedIn exportItems={exportItems} /> : <PublicMenuItems exportItems={exportItems} />;
}

function PublicMenuSignedIn({ exportItems }: { exportItems: MenuEntry[] }) {
  const d = useDoc();
  const router = useRouter();
  const { workspaceId, role, current } = useWorkspace();
  const create = useMutation(api.documents.create);
  const save =
    workspaceId && canEdit(role)
      ? {
          label: "Save a copy",
          hint: `Into ${current?.name ?? "your workspace"}`,
          icon: "duplicate" as const,
          onSelect: () => void create({ workspaceId, title: d.title, source: d.source }).then((id) => router.push(`/documents/${id}` as Href)),
        }
      : undefined;
  return <PublicMenuItems exportItems={exportItems} save={save} />;
}

function PublicMenuItems({ exportItems, save }: { exportItems: MenuEntry[]; save?: MenuEntry }) {
  const d = useDoc();
  const web =
    d.kind === "share" && d.publicSlug
      ? { label: "Open on the web", icon: "external" as const, onSelect: () => void Linking.openURL(shareUrl(SITE_URL, d.publicSlug!)) }
      : { label: "Open in sandbox", hint: "Change it in the web editor", icon: "external" as const, onSelect: () => void Linking.openURL(`${SITE_URL}/sandbox/${d.base.split("/").pop()}`) };
  return (
    <Menu
      width={240}
      trigger={({ open, toggle }) => <IconButton icon="more" label="More" active={open} onPress={toggle} />}
      items={[...exportItems, "separator", web, ...(save ? [save] : [])]}
    />
  );
}
