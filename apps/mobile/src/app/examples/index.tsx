/**
 * The language's worked examples (`/language/examples` on the web; agents
 * read them with `list_examples`), bundled with the app: they work signed
 * out and offline.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { EXAMPLES } from "@archer/mcp/examples";
import { DiagramThumb } from "@/components/Diagram";
import { Chip, Screen, Txt } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";

export default function Examples() {
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <Screen>
      <Txt tone="ink2">
        Each one teaches part of the `.arch` language. Open one to explore its diagram, components and code.
      </Txt>
      {EXAMPLES.map((e) => (
        <Pressable
          key={e.slug}
          onPress={() => router.push(`/examples/${e.slug}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={e.title}
          style={({ pressed }) => ({
            backgroundColor: palette.surface,
            borderRadius: RADIUS.xl,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: pressed ? palette.line2 : palette.line,
            overflow: "hidden",
          })}
        >
          <View style={{ backgroundColor: palette.ground, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }}>
            <DiagramThumb source={e.source} height={170} />
          </View>
          <View style={{ padding: 14, gap: 8 }}>
            <Txt size="lg" weight="600">
              {e.title}
            </Txt>
            <Txt size="sm" tone="ink2" numberOfLines={3}>
              {e.summary.replace(/`([^`]+)`/g, "$1")}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {e.features.map((f) => (
                <Chip key={f} label={f} />
              ))}
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
