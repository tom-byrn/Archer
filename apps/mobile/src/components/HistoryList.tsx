/**
 * A stored document's history: every save, newest first, by you, an agent
 * (over MCP) or a commit (repo sync). Agent changes since you last looked are
 * marked until you mark them reviewed, as in the web's activity panel.
 */

import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { useDoc } from "@/lib/doc";
import { relativeTime } from "@/lib/text";
import { useTheme } from "@/lib/theme";
import type { IconName } from "./Icon";
import { Button, Empty, Row, Screen, Section, Txt } from "./ui";

interface Author {
  kind: "user" | "agent" | "git";
  name?: string;
}

export const authorLabel = (a: Author): string =>
  a.kind === "user" ? "Edited in Archer" : a.kind === "agent" ? (a.name ?? "An agent") : `Commit${a.name ? ` by ${a.name}` : ""}`;

export const authorIcon = (a: Author): IconName => (a.kind === "agent" ? "robot" : a.kind === "git" ? "git-commit" : "user");

export function HistoryList() {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const revisions = useQuery(
    api.revisions.list,
    d.documentId && d.workspaceId ? { documentId: d.documentId, workspaceId: d.workspaceId } : "skip",
  );
  const markSeen = useMutation(api.documents.markSeen);

  if (revisions === undefined) return <Empty loading />;
  if (revisions.length === 0)
    return <Empty icon="history" title="No history yet" body="Saves, agent edits and commits show up here." />;

  const seen = d.seenRevisionAt ?? 0;
  const unseen = revisions.filter((r) => r.author.kind !== "user" && r.createdAt > seen).length;

  return (
    <Screen>
      {unseen > 0 && (
        <View style={{ gap: 10 }}>
          <Txt tone="ink2">
            {unseen === 1 ? "1 change" : `${unseen} changes`} by agents or commits since you last looked.
          </Txt>
          {d.editable && (
            <Button
              title="Mark all reviewed"
              icon="check"
              onPress={() => void markSeen({ id: d.documentId!, workspaceId: d.workspaceId! })}
            />
          )}
        </View>
      )}
      <Section title="Changes">
        {revisions.map((r, i) => {
          const isNew = r.author.kind !== "user" && r.createdAt > seen;
          return (
            <Row
              key={r._id}
              first={i === 0}
              icon={authorIcon(r.author)}
              title={r.summary ?? authorLabel(r.author)}
              numberOfLines={2}
              subtitle={`${r.summary ? `${authorLabel(r.author)} · ` : ""}${relativeTime(r.createdAt)}`}
              right={
                isNew ? (
                  <View
                    accessibilityLabel="Not reviewed"
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }}
                  />
                ) : undefined
              }
              onPress={() => router.push(`${d.base}/revision/${r._id}` as Href)}
            />
          );
        })}
      </Section>
    </Screen>
  );
}
