/**
 * Diagrams: the share image (`@web/svg`) drawn with react-native-svg.
 * `ZoomableDiagram` is the canvas view (pinch, pan, double-tap to zoom, tap
 * a component to open it); `DiagramThumb` a static preview; `ArchSvg` draws
 * any SVG the renderer and the catalog produce.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { G, SvgAst, parse as parseSvg } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { LOGOS } from "@archer/catalog/logos";
import type { RenderedArch, RenderedBox } from "@web/svg";
import { fitViewport, hitTest, renderCanvas } from "@/lib/diagram";
import { adaptSvgTree, type SvgNode } from "@/lib/nativeSvg";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { IconButton } from "./ui";

type ParsedSvg = ReturnType<typeof parseSvg>;

/** Parse once per SVG string, adapted for react-native-svg (see lib/nativeSvg.ts). */
function useSvgAst(svg: string, mono: string, sans: string | undefined): ParsedSvg {
  return useMemo(() => {
    try {
      return parseSvg(svg, (root) => {
        adaptSvgTree(root as unknown as SvgNode, { mono, ...(sans ? { sans } : {}) });
        const retag = (n: typeof root) => {
          if (n.tag === "g") n.Tag = G as unknown as typeof n.Tag;
          for (const c of n.children) if (typeof c !== "string") retag(c);
        };
        retag(root);
        return root;
      });
    } catch {
      return null;
    }
  }, [svg, mono, sans]);
}

/** On a device text without a font is the system's sans; a browser would draw it in Times. */
const SANS = Platform.OS === "web" ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

/** An SVG string drawn natively at `width` × `height` (its viewBox scaled to fit). */
export const ArchSvg = memo(function ArchSvg({
  svg,
  width,
  height,
}: {
  svg: string;
  width: number;
  height: number;
}) {
  const { mono } = useTheme();
  const ast = useSvgAst(svg, mono, SANS);
  if (!ast) return null;
  return <SvgAst ast={ast} override={{ width, height }} />;
});

/**
 * Render a document's canvas in the current theme, with product logos as the
 * share image draws them (`logos: false` keeps glyphs, as the web's landing
 * page does).
 */
export function useRenderedCanvas(
  source: string,
  path: readonly string[],
  opts: { showTitle?: boolean; background?: boolean; logos?: boolean } = {},
): RenderedArch {
  const { dark } = useTheme();
  const key = path.join(".");
  const { showTitle = false, background = false, logos = true } = opts;
  return useMemo(
    () =>
      renderCanvas(source, key === "" ? [] : key.split("."), {
        theme: dark ? "dark" : "light",
        showTitle,
        background,
        ...(logos ? { logos: LOGOS } : {}),
      }),
    [source, key, dark, showTitle, background, logos],
  );
}

/** A static preview that fills `height`, centered. */
export function DiagramThumb({
  source,
  path = [],
  height,
  logos = true,
}: {
  source: string;
  path?: readonly string[];
  height: number;
  logos?: boolean;
}) {
  const rendered = useRenderedCanvas(source, path, { logos });
  const [width, setWidth] = useState(0);
  const s = width > 0 ? Math.min(1, (width - 24) / rendered.width, (height - 24) / rendered.height) : 0;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, alignItems: "center", justifyContent: "center" }}
      pointerEvents="none"
    >
      {s > 0 && <ArchSvg svg={rendered.svg} width={rendered.width * s} height={rendered.height * s} />}
    </View>
  );
}

const MAX_SCALE = 3;

/**
 * The canvas: pinch to zoom, drag to pan, double-tap to zoom in (or back out
 * to fit), tap a component to open it.
 */
export function ZoomableDiagram({
  rendered,
  onPressComponent,
}: {
  rendered: RenderedArch;
  onPressComponent?: (box: RenderedBox) => void;
}) {
  const { palette } = useTheme();
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [flash, setFlash] = useState<RenderedBox | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const minScale = useSharedValue(0.1);
  const fitScale = useSharedValue(1);

  const fit = useCallback(
    (animated: boolean) => {
      if (!view) return;
      const v = fitViewport(rendered.width, rendered.height, view.w, view.h);
      fitScale.value = v.scale;
      minScale.value = Math.min(v.scale * 0.6, 0.6);
      const to = (n: number) => (animated ? withTiming(n, { duration: 220 }) : n);
      scale.value = to(v.scale);
      tx.value = to(v.x);
      ty.value = to(v.y);
    },
    [view, rendered.width, rendered.height, fitScale, minScale, scale, tx, ty],
  );

  // Fit on first layout, and whenever the diagram or the view changes size.
  useEffect(() => fit(false), [fit]);
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setView((v) => (v && v.w === width && v.h === height ? v : { w: width, h: height }));
  };

  const pan = usePanGesture({
    onUpdate: (e) => {
      "worklet";
      tx.value += e.changeX;
      ty.value += e.changeY;
    },
  });

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      "worklet";
      const next = Math.min(MAX_SCALE, Math.max(minScale.value, scale.value * e.scaleChange));
      const k = next / scale.value;
      tx.value = e.focalX - (e.focalX - tx.value) * k;
      ty.value = e.focalY - (e.focalY - ty.value) * k;
      scale.value = next;
    },
  });

  const openAt = useCallback(
    (x: number, y: number) => {
      if (!onPressComponent) return;
      const box = hitTest(rendered.boxes, (x - tx.value) / scale.value, (y - ty.value) / scale.value);
      if (!box || box.kind !== "component") return;
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      setFlash(box);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 400);
      onPressComponent(box);
    },
    [onPressComponent, rendered.boxes, scale, tx, ty],
  );

  const zoomAt = useCallback(
    (x: number, y: number) => {
      const s0 = scale.value;
      const zoomedIn = s0 > fitScale.value * 1.4;
      if (zoomedIn) return fit(true);
      const next = Math.min(MAX_SCALE, Math.max(1, fitScale.value * 2.5));
      const k = next / s0;
      tx.value = withTiming(x - (x - tx.value) * k, { duration: 220 });
      ty.value = withTiming(y - (y - ty.value) * k, { duration: 220 });
      scale.value = withTiming(next, { duration: 220 });
    },
    [fit, fitScale, scale, tx, ty],
  );

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    runOnJS: true,
    onActivate: (e) => zoomAt(e.x, e.y),
  });
  const singleTap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => openAt(e.x, e.y),
  });
  const taps = useExclusiveGestures(doubleTap, singleTap);
  const moves = useSimultaneousGestures(pan, pinch);
  const gesture = useCompetingGestures(moves, taps);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: palette.ground, overflow: "hidden" }} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View
            style={[
              { width: rendered.width, height: rendered.height, transformOrigin: "left top" },
              contentStyle,
            ]}
          >
            <ArchSvg svg={rendered.svg} width={rendered.width} height={rendered.height} />
            {flash && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: flash.x - 3,
                  top: flash.y - 3,
                  width: flash.w + 6,
                  height: flash.h + 6,
                  borderRadius: RADIUS.lg,
                  borderWidth: 2,
                  borderColor: palette.accent,
                }}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>
      <View
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          backgroundColor: palette.surface,
          borderRadius: RADIUS.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line2,
          padding: 2,
        }}
      >
        <IconButton icon="corners-out" label="Fit to screen" onPress={() => fit(true)} />
      </View>
    </View>
  );
}
