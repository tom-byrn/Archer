/**
 * The signed-in home: the web's dashboard (`apps/web/app/page.tsx`) on a
 * phone. The site header — wordmark, workspace switcher, new-document menu,
 * account — over the selected workspace's documents as square cards, each
 * with its diagram, title and freshness, and its own menu.
 */

import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { format, parse } from "@archer/lang";
import { ACME_SAAS } from "@web/samples/acme-saas";
import { DiagramThumb } from "@/components/Diagram";
import { ConfirmDialog, ConnectAgentDialog, FeedbackDialog, NameDialog, SampleDialog } from "@/components/Dialogs";
import { GitHubMark, Icon } from "@/components/Icon";
import { Band, FooterLink, Frame, SiteFooter, SiteHeader, Wordmark } from "@/components/Site";
import { Avatar, Button, Chip, IconButton, Menu, Segmented, Txt, VRule, type MenuEntry } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { api, canEdit, type Id } from "@/lib/convex";
import { SITE_URL } from "@/lib/env";
import { relativeTime } from "@/lib/text";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { SHADOW } from "@/lib/tokens";
import { useWorkspace, type WorkspaceSummary } from "@/lib/workspace";

interface DocRow {
  _id: Id<"documents">;
  title: string;
  updatedAt: number;
  source: string;
  repo?: { owner: string; name: string; branch: string; path?: string };
}

const BLANK = 'arch "Untitled" v0.2\n';
const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

/** Rewrite the header title, keeping the rest of the source (the dashboard's `withTitle`). */
const withTitle = (source: string, title: string): string => {
  try {
    return format({ ...parse(source).doc, title });
  } catch {
    return source;
  }
};

type Pending = { kind: "rename" | "delete"; doc: DocRow } | { kind: "sample" | "connect" | "feedback" | "team" } | null;

export function DocumentsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { workspaceId, current, role, workspaces, select } = useWorkspace();
  const docs = useQuery(api.documents.list, workspaceId ? { workspaceId } : "skip") as DocRow[] | undefined;
  const create = useMutation(api.documents.create);
  const remove = useMutation(api.documents.remove);
  const updateSource = useMutation(api.documents.updateSource);
  const createWorkspace = useMutation(api.workspaces.create);
  const [pending, setPending] = useState<Pending>(null);
  const { width } = useWindowDimensions();
  const editor = canEdit(role);

  const newDoc = async (source: string, title: string) => {
    if (!workspaceId) return;
    const id = await create({ workspaceId, title, source });
    router.push(`/documents/${id}` as Href);
  };

  const createItems: MenuEntry[] = [
    { label: "New document", icon: "plus", onSelect: () => void newDoc(BLANK, "Untitled") },
    { label: "From sample…", icon: "diagram", onSelect: () => setPending({ kind: "sample" }) },
  ];

  // Cards fill the column in rows of `cols`, 220px at the least (the web's grid).
  const inner = width - 2 - 40;
  const cols = Math.max(1, Math.floor((inner + 16) / (220 + 16)));
  const cardW = (inner - (cols - 1) * 16) / cols;

  return (
    <Frame>
      <Stack.Screen options={{ headerShown: false }} />
      <SiteHeader>
        <Wordmark />
        <VRule />
        {current ? (
          <WorkspaceSwitcher workspaces={workspaces} current={current} onSelect={select} onCreate={() => setPending({ kind: "team" })} />
        ) : (
          <View style={{ height: 32, width: 96, borderRadius: 6, backgroundColor: palette.surface2 }} />
        )}
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 }}>
          {editor && docs !== undefined && docs.length > 0 && (
            <Menu
              width={200}
              items={createItems}
              trigger={({ open, toggle }) => <IconButton icon="plus" label="New document" active={open} onPress={toggle} />}
            />
          )}
          <AccountMenu onConnect={() => setPending({ kind: "connect" })} />
        </View>
      </SiteHeader>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {docs === undefined ? (
          <View style={styles.grid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ width: cardW, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface }}>
                <View style={{ aspectRatio: 16 / 10, backgroundColor: palette.surface2, borderBottomWidth: 1, borderBottomColor: palette.line }} />
                <View style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 8 }}>
                  <View style={{ height: 12, width: "66%", backgroundColor: palette.surface2 }} />
                  <View style={{ height: 10, width: "33%", backgroundColor: palette.surface2 }} />
                </View>
              </View>
            ))}
          </View>
        ) : docs.length === 0 ? (
          <Band>
            <View style={{ backgroundColor: palette.ground, paddingHorizontal: 24, paddingVertical: 80, overflow: "hidden" }}>
              <View style={[StyleSheet.absoluteFill, { padding: 40, opacity: 0.18 }]} pointerEvents="none">
                <DiagramThumb source={ACME_SAAS} height={400} padding={0} />
              </View>
              <View style={{ alignItems: "center", maxWidth: 448, alignSelf: "center" }}>
                <Txt size="2xl" display style={{ textAlign: "center" }}>
                  Draw your architecture. Hand it to an agent.
                </Txt>
                <Txt tone="ink2" style={{ textAlign: "center", paddingTop: 12 }}>
                  Every box and arrow on the canvas compiles to a small text language that coding agents read and write, so
                  the diagram and the code never drift.
                </Txt>
                {editor ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingTop: 24 }}>
                    <Button title="From sample" icon="diagram" onPress={() => setPending({ kind: "sample" })} />
                    <Button title="New document" icon="plus" variant="primary" onPress={() => void newDoc(BLANK, "Untitled")} />
                  </View>
                ) : (
                  <Txt size="sm" tone="ink3" style={{ paddingTop: 24 }}>
                    You have view access. Ask an owner to add documents.
                  </Txt>
                )}
              </View>
            </View>
          </Band>
        ) : (
          <View style={styles.grid}>
            {docs.map((doc) => (
              <DocCard
                key={doc._id}
                doc={doc}
                width={cardW}
                readOnly={!editor}
                onOpen={() => router.push(`/documents/${doc._id}` as Href)}
                onRename={() => setPending({ kind: "rename", doc })}
                onDuplicate={() => workspaceId && void create({ workspaceId, title: `${doc.title} copy`, source: doc.source })}
                onDelete={() => setPending({ kind: "delete", doc })}
              />
            ))}
          </View>
        )}
        <View style={{ flex: 1 }} />
        <SiteFooter>
          <FooterLink label="Docs" onPress={() => void Linking.openURL(`${SITE_URL}/language`)} />
          <FooterLink label="Examples" onPress={() => router.push("/examples")} />
          <FooterLink label="Send feedback" onPress={() => setPending({ kind: "feedback" })} />
        </SiteFooter>
      </ScrollView>

      <ConnectAgentDialog open={pending?.kind === "connect"} onClose={() => setPending(null)} workspaceName={current?.name ?? "this workspace"} />
      <FeedbackDialog open={pending?.kind === "feedback"} onClose={() => setPending(null)} />
      {pending?.kind === "sample" && (
        <SampleDialog
          workspaceName={current?.name ?? "this workspace"}
          onClose={() => setPending(null)}
          onChoose={async (s) => {
            await newDoc(s.source, s.title);
            setPending(null);
          }}
        />
      )}
      {pending?.kind === "team" && (
        <NameDialog
          title="New team workspace"
          initial=""
          submitLabel="Create"
          placeholder="Team name"
          onClose={() => setPending(null)}
          onSave={async (name) => select(await createWorkspace({ name }))}
        />
      )}
      {pending?.kind === "rename" && workspaceId && (
        <NameDialog
          title="Rename document"
          initial={pending.doc.title}
          submitLabel="Save"
          onClose={() => setPending(null)}
          onSave={async (title) => {
            await updateSource({ id: pending.doc._id, workspaceId, title, source: withTitle(pending.doc.source, title) });
          }}
        />
      )}
      {pending?.kind === "delete" && workspaceId && (
        <ConfirmDialog
          title="Delete document"
          confirmLabel="Delete"
          body={
            <>
              Delete <Txt weight="500">{pending.doc.title}</Txt>? Agents connected to this workspace lose access to it too. This
              cannot be undone.
            </>
          }
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await remove({ id: pending.doc._id, workspaceId });
          }}
        />
      )}
    </Frame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 20, paddingVertical: 32 },
});

/** A document card: square-cornered, its diagram on the canvas color, title and freshness under it. */
function DocCard({
  doc,
  width,
  readOnly,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  doc: DocRow;
  width: number;
  readOnly: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { palette } = useTheme();
  const items: MenuEntry[] = readOnly
    ? [{ label: "Open", icon: "external", onSelect: onOpen }]
    : [
        { label: "Open", icon: "external", onSelect: onOpen },
        { label: "Rename", icon: "pencil", onSelect: onRename },
        { label: "Duplicate", icon: "duplicate", onSelect: onDuplicate },
        "separator",
        { label: "Delete", icon: "trash", danger: true, onSelect: onDelete },
      ];
  return (
    <View style={{ width }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={doc.title}
        style={({ pressed }) => [
          { borderWidth: 1, borderColor: pressed ? palette.line2 : palette.line, backgroundColor: palette.surface },
          pressed && SHADOW.md,
        ]}
      >
        <View style={{ aspectRatio: 16 / 10, backgroundColor: palette.ground, borderBottomWidth: 1, borderBottomColor: palette.line }}>
          <DiagramThumb source={doc.source} height={((width - 2) * 10) / 16} padding={12} />
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <Txt weight="500" numberOfLines={1}>
            {doc.title}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 }}>
            {doc.repo && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
                  <GitHubMark size={12} color={palette.ink2} />
                  <Txt size="xs" tone="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {doc.repo.path ? `${doc.repo.name}/${doc.repo.path}` : `${doc.repo.owner}/${doc.repo.name}`}
                  </Txt>
                </View>
                <Txt size="xs" tone="ink3">
                  ·
                </Txt>
              </>
            )}
            <Txt size="xs" tone="ink3">
              {relativeTime(doc.updatedAt)}
            </Txt>
          </View>
        </View>
      </Pressable>
      <View style={{ position: "absolute", right: 8, top: 8 }}>
        <Menu
          width={180}
          items={items}
          trigger={({ open, toggle }) => (
            <IconButton
              size="sm"
              icon="more"
              label="Document actions"
              active={open}
              onPress={toggle}
              style={[{ backgroundColor: open ? palette.surface3 : palette.surface }, SHADOW.sm]}
            />
          )}
        />
      </View>
    </View>
  );
}

/** The header's workspace control: its name (and role, for a team) → every workspace. */
function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
  onCreate,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { palette } = useTheme();
  const items: MenuEntry[] = [
    ...workspaces.map((w) => ({
      label: w.name,
      hint: w.pending ? "Invited — open it on the web to join" : w.kind === "team" ? ROLE_LABEL[w.role] : undefined,
      icon: w.id === current.id ? ("check" as const) : <View />,
      disabled: w.pending === true,
      onSelect: () => onSelect(w.id),
    })),
    "separator",
    { label: "New team workspace…", icon: "plus", onSelect: onCreate },
  ];
  return (
    <Menu
      width={260}
      align="start"
      items={items}
      trigger={({ toggle }) => (
        <Button
          title={current.name}
          onPress={toggle}
          style={{ maxWidth: 190, paddingRight: 8 }}
          trailing={
            <>
              {current.kind === "team" && <Chip label={ROLE_LABEL[current.role]} />}
              <Icon name="chevron-down" size={14} color={palette.ink3} />
            </>
          }
        />
      )}
    />
  );
}

/** The avatar menu: who you are, connecting agents, the theme, sign out (the web's AccountMenu). */
function AccountMenu({ onConnect }: { onConnect: () => void }) {
  const account = useAccount();
  const router = useRouter();
  const { choice, setChoice } = useTheme();
  const name = account.name;
  const email = account.email;
  return (
    <Menu
      width={240}
      items={[
        { label: name ?? email ?? "Account", hint: name && email ? email : undefined, icon: "user", disabled: true, onSelect: () => {} },
        "separator",
        { label: "Connect an agent", hint: "Claude Code, Cursor, the CLI…", icon: "plug", onSelect: onConnect },
        "separator",
        {
          label: "Theme",
          icon: "contrast",
          control: (
            <Segmented<ThemeChoice>
              label="Theme"
              value={choice}
              onChange={setChoice}
              options={[
                { value: "system", label: "System", icon: "monitor" },
                { value: "light", label: "Light", icon: "sun" },
                { value: "dark", label: "Dark", icon: "moon" },
              ]}
            />
          ),
        },
        "separator",
        { label: "Sign out", icon: "external", onSelect: () => void account.signOut().then(() => router.replace("/welcome")) },
      ]}
      trigger={({ open, toggle }) => (
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel="Account" hitSlop={8} style={{ borderRadius: 16, padding: open ? 0 : 0 }}>
          <Avatar image={account.imageUrl} name={name ?? email} />
        </Pressable>
      )}
    />
  );
}
