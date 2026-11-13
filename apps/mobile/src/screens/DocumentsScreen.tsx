/**
 * The signed-in home: the selected workspace's documents, newest first, each
 * with its diagram as a thumbnail (the dashboard's cards). The header switches
 * workspace and opens the account; long-press a card for more.
 */

import { memo, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { parse } from "@archer/lang";
import { DiagramThumb } from "@/components/Diagram";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { Button, Chip, Empty, IconButton, Input, Txt } from "@/components/ui";
import { api, canEdit, type Id } from "@/lib/convex";
import { docStats } from "@/lib/outline";
import { plural, relativeTime } from "@/lib/text";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { useWorkspace } from "@/lib/workspace";

interface DocRow {
  _id: Id<"documents">;
  title: string;
  updatedAt: number;
  source: string;
  repo?: { owner: string; name: string; branch: string; path?: string };
}

export function DocumentsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { workspaceId, current, role, loaded } = useWorkspace();
  const docs = useQuery(api.documents.list, workspaceId ? { workspaceId } : "skip");
  const remove = useMutation(api.documents.remove);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<DocRow | null>(null);
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const editor = canEdit(role);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter((d) => q === "" || d.title.toLowerCase().includes(q));
  }, [docs, query]);

  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => (
          <Pressable
            onPress={() => router.push("/workspaces")}
            accessibilityRole="button"
            accessibilityLabel="Switch workspace"
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            hitSlop={8}
          >
            <Txt size="lg" weight="600" numberOfLines={1}>
              {current?.name ?? "Documents"}
            </Txt>
            <Icon name="caret-down" size={14} color={palette.ink2} />
          </Pressable>
        ),
        headerLeft: () => <IconButton icon="user" label="Account" onPress={() => router.push("/account")} />,
        headerRight: () =>
          editor ? <IconButton icon="plus" label="New document" onPress={() => router.push("/new")} /> : null,
      }}
    />
  );

  if (!loaded || docs === undefined)
    return (
      <>
        {header}
        <Empty loading />
      </>
    );

  if (docs.length === 0)
    return (
      <>
        {header}
        <Empty
          icon="graph"
          title="No documents yet"
          body={
            editor
              ? "Start one here, sketch it on the web, or let an agent write it over MCP."
              : "Nothing in this workspace yet. You can view it; an editor can add documents."
          }
          action={
            <View style={{ gap: 10, alignItems: "stretch", minWidth: 220 }}>
              {editor && <Button title="New document" icon="plus" variant="primary" onPress={() => router.push("/new")} />}
              <Button title="Browse examples" icon="compass" onPress={() => router.push("/examples")} />
            </View>
          }
        />
      </>
    );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {header}
      <FlatList
        key={`cols-${columns}`}
        data={shown}
        numColumns={columns}
        keyExtractor={(d) => d._id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14 }}
        columnWrapperStyle={columns > 1 ? { gap: 14 } : undefined}
        ListHeaderComponent={
          docs.length > 4 ? (
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${plural(docs.length, "document")}`}
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
          ) : undefined
        }
        ListEmptyComponent={<Txt tone="ink3" style={{ textAlign: "center", padding: 24 }}>Nothing matches “{query}”.</Txt>}
        ListFooterComponent={
          <Pressable onPress={() => router.push("/examples")} style={{ alignItems: "center", padding: 16 }} hitSlop={8}>
            <Txt size="sm" tone="ink3">
              Learning the language? <Txt size="sm" tone="accent" weight="600">Browse the examples</Txt>
            </Txt>
          </Pressable>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns }}>
            <DocCard
              doc={item}
              onPress={() => router.push(`/documents/${item._id}` as Href)}
              onLongPress={() => setMenu(item)}
            />
          </View>
        )}
      />
      <Sheet
        visible={menu !== null}
        title={menu?.title}
        message={menu ? `Updated ${relativeTime(menu.updatedAt)}` : undefined}
        onClose={() => setMenu(null)}
        actions={
          menu
            ? [
                { label: "Open", icon: "arrow-right", onPress: () => router.push(`/documents/${menu._id}` as Href) },
                ...(editor && workspaceId
                  ? [
                      {
                        label: "Delete document",
                        icon: "trash" as const,
                        destructive: true,
                        onPress: () =>
                          Alert.alert(`Delete “${menu.title}”?`, "This deletes the document and its history for everyone in the workspace.", [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => void remove({ id: menu._id, workspaceId }),
                            },
                          ]),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </View>
  );
}

const DocCard = memo(function DocCard({
  doc,
  onPress,
  onLongPress,
}: {
  doc: DocRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { palette } = useTheme();
  const stats = useMemo(() => docStats(parse(doc.source).doc), [doc.source]);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={doc.title}
      style={({ pressed }) => ({
        backgroundColor: palette.surface,
        borderRadius: RADIUS.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: pressed ? palette.line2 : palette.line,
        overflow: "hidden",
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ backgroundColor: palette.ground, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }}>
        <DiagramThumb source={doc.source} height={150} />
      </View>
      <View style={{ padding: 12, gap: 6 }}>
        <Txt size="lg" weight="600" numberOfLines={1}>
          {doc.title}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Txt size="sm" tone="ink3">
            {relativeTime(doc.updatedAt)} · {plural(stats.components, "component")}
          </Txt>
          {doc.repo && <Chip label={`${doc.repo.owner}/${doc.repo.name}`} icon={doc.repo.path ? "git-branch" : "link"} />}
        </View>
      </View>
    </Pressable>
  );
});
