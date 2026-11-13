/** The canvas inside a component, full screen: tap one of its parts to open it. */

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { findComponent } from "@archer/lang";
import { DocGate } from "@/components/DocGate";
import { useRenderedCanvas, ZoomableDiagram } from "@/components/Diagram";
import { useDoc } from "@/lib/doc";
import { displayName } from "@/lib/outline";
import { useTheme } from "@/lib/theme";
import { usePathParam } from "./ComponentScreen";
import { componentHref } from "./DocumentHome";

export function CanvasScreen() {
  return (
    <DocGate>
      <Canvas />
    </DocGate>
  );
}

function Canvas() {
  const d = useDoc();
  const router = useRouter();
  const { palette } = useTheme();
  const path = usePathParam();
  const node = useMemo(() => findComponent(d.doc, path), [d.doc, path]);
  const rendered = useRenderedCanvas(d.source, path);
  return (
    <View style={{ flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }}>
      <Stack.Screen options={{ title: node ? `Inside ${displayName(node)}` : "" }} />
      <ZoomableDiagram rendered={rendered} onPressComponent={(box) => router.push(componentHref(d, [...path, box.path]))} />
    </View>
  );
}
