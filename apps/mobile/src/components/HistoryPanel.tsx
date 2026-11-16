/**
 * A stored document's history, as the web's activity panel shows it
 * (`components/ActivityPanel.tsx`): every save grouped by day, who made it
 * (you, an agent over MCP, a commit), its summary and what it changed. A tap
 * shows that version on the canvas; while one is shown, Restore and Exit sit
 * at the top.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "convex/react";
import { diffDocs, parse, summarizeDiff, type DiffSummary } from "@archer/lang";
import { api, type Id } from "@/lib/convex";
import { useDoc } from "@/lib/doc";
import { relativeTime } from "@/lib/text";
import { useTheme } from "@/lib/theme";
import { GitHubMark, Icon } from "./Icon";
import { BottomPanel, Button, Chip, Dialog, DialogActions, Eyebrow, IconButton, Loading, Segmented, Txt } from "./ui";

export interface Author {
  kind: "user" | "agent" | "git";
  name?: string;
}

export interface Revision {
  _id: Id<"revisions">;
  createdAt: number;
  author: Author;
  summary?: string;
  source: string;
  commit?: { sha: string; url: string };
}

/** The web's `authorLabel`: "You", the agent's or committer's name, else "Agent" / "GitHub". */
export const authorLabel = (a: Author): string =>
  a.kind === "user" ? "You" : a.name && a.name.trim() !== "" ? a.name : a.kind === "git" ? "GitHub" : "Agent";

const dayLabel = (ts: number, now: number): string => {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === n.getFullYear() ? {} : { year: "numeric" }),
  });
};

function Avatar({ author }: { author: Author }) {
  const { palette } = useTheme();
  const other = author.kind !== "user";
  const color = other ? palette.accent : palette.ink2;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: other ? palette.accentSoft : palette.surface2,
      }}
    >
      {author.kind === "git" ? <GitHubMark size={14} color={color} /> : <Icon name={author.kind === "agent" ? "bot" : "user"} size={14} color={color} />}
    </View>
  );
}

/** What a version changed (the web's ChangeChips). */
function ChangeChips({ summary }: { summary: DiffSummary | null }) {
  if (summary === null)
    return (
      <View style={{ flexDirection: "row" }}>
        <Chip label="Initial version" />
      </View>
    );
  const chips: { label: string; tone?: "accent" | "danger" | "warn" }[] = [];
  if (summary.added > 0) chips.push({ label: `+${summary.added}`, tone: "accent" });
  if (summary.removed > 0) chips.push({ label: `−${summary.removed}`, tone: "danger" });
  if (summary.changed > 0) chips.push({ label: `~${summary.changed}`, tone: "warn" });
  const planes = summary.planesAdded + summary.planesRemoved + summary.planesChanged;
  if (planes > 0) chips.push({ label: `${planes} plane${planes === 1 ? "" : "s"}` });
  const conn = summary.connectionsAdded + summary.connectionsRemoved + summary.connectionsChanged;
  if (conn > 0) chips.push({ label: `${conn} conn` });
  if (chips.length === 0) chips.push({ label: "No component changes" });
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {chips.map((c) => (
        <Chip key={c.label} label={c.label} tone={c.tone} />
      ))}
    </View>
  );
}

export function HistoryPanel({
  viewing,
  onView,
  onRestore,
  onClose,
}: {
  /** The version shown on the canvas, or null for the current one. */
  viewing: Id<"revisions"> | null;
  onView: (rev: Revision | null) => void;
  onRestore: (source: string) => void;
  onClose: () => void;
}) {
  const d = useDoc();
  const { palette } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const revisions = useQuery(
    api.revisions.listFull,
    d.documentId && d.workspaceId ? { documentId: d.documentId, workspaceId: d.workspaceId, limit: 200 } : "skip",
  ) as Revision[] | undefined;

  const summaries = useMemo(() => {
    const m = new Map<string, DiffSummary | null>();
    (revisions ?? []).forEach((rev, i) => {
      const older = revisions![i + 1];
      if (!older) return m.set(rev._id, null);
      try {
        m.set(rev._id, summarizeDiff(diffDocs(parse(older.source).doc, parse(rev.source).doc)));
      } catch {
        m.set(rev._id, null);
      }
    });
    return m;
  }, [revisions]);

  const now = Date.now();
  const shown = viewing && revisions ? revisions.find((r) => r._id === viewing) : undefined;
  let lastDay = "";

  return (
    <BottomPanel tall>
      <View
        style={{
          height: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 8,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        <Segmented value="history" options={[{ value: "history", label: "History" }]} onChange={() => {}} />
        <IconButton icon="close" label="Close" onPress={onClose} style={{ marginLeft: "auto" }} />
      </View>
      {revisions === undefined ? (
        <Loading />
      ) : (
        <ScrollView style={{ flex: 1 }} stickyHeaderIndices={shown ? [0] : undefined}>
          {shown && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.surface }}>
              <Txt size="xs" tone="ink2">
                Viewing this revision · compared with the previous one
              </Txt>
              <View style={{ flexDirection: "row", gap: 6, paddingTop: 6 }}>
                {d.editable && <Button size="sm" title="Restore" icon="restore" onPress={() => setConfirm(true)} />}
                <Button size="sm" variant="ghost" title="Exit" onPress={() => onView(null)} />
              </View>
            </View>
          )}
          {revisions.length === 0 && (
            <Txt size="sm" tone="ink3" style={{ paddingHorizontal: 12, paddingVertical: 24, textAlign: "center", lineHeight: 20 }}>
              Every save lands here. Agent edits are listed by name so you can review them.
            </Txt>
          )}
          <View style={{ paddingBottom: 12 }}>
            {revisions.map((rev) => {
              const day = dayLabel(rev.createdAt, now);
              const header = day !== lastDay;
              lastDay = day;
              const active = rev._id === viewing;
              return (
                <View key={rev._id}>
                  {header && <Eyebrow style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>{day}</Eyebrow>}
                  <Pressable
                    onPress={() => onView(active ? null : rev)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: active ? palette.accentSoft : pressed ? palette.surface2 : "transparent",
                    })}
                  >
                    <Avatar author={rev.author} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                        <Txt size="sm" weight="500" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {authorLabel(rev.author)}
                        </Txt>
                        <Txt size="xs" tone="ink3">
                          {relativeTime(rev.createdAt, now)}
                        </Txt>
                        {rev.commit && (
                          <Txt size="xs" tone="ink3" mono style={{ marginLeft: "auto" }}>
                            {rev.commit.sha.slice(0, 7)}
                          </Txt>
                        )}
                      </View>
                      {rev.summary && (
                        <Txt size="sm" tone="ink2" numberOfLines={2}>
                          {rev.summary}
                        </Txt>
                      )}
                      <View style={{ paddingTop: 4 }}>
                        <ChangeChips summary={summaries.get(rev._id) ?? null} />
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Restore this version?" width={400}>
        <Txt size="sm" tone="ink2">
          The current document will be saved as a new revision first, so nothing is lost.
        </Txt>
        <DialogActions>
          <Button variant="ghost" title="Cancel" onPress={() => setConfirm(false)} />
          <Button
            variant="primary"
            title="Restore"
            onPress={() => {
              setConfirm(false);
              if (shown) onRestore(shown.source);
            }}
          />
        </DialogActions>
      </Dialog>
    </BottomPanel>
  );
}
