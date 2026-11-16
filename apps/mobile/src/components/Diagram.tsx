/**
 * Diagrams: the share image (`@web/svg`) drawn with react-native-svg.
 * `Canvas` is the editor's canvas on a phone: the dot grid, pinch and pan,
 * double-tap to zoom, the zoom controls at bottom left, and a tap selecting
 * what it lands on (with the canvas's selection ring). `DiagramThumb` is a
 * static preview; `ArchSvg` draws any SVG the renderer and the catalog make.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Pattern, Rect, SvgAst, parse as parseSvg } from "react-native-svg";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
import type { ConnectionNode } from "@archer/lang";
import type { RenderedArch, RenderedBox } from "@web/svg";
import { fitViewport, hitTest, renderCanvas } from "@/lib/diagram";
import { sans } from "@/lib/fonts";
import { adaptSvgTree, type SvgNode } from "@/lib/nativeSvg";
import { useTheme } from "@/lib/theme";
import { CELL, RADIUS, SHADOW } from "@/lib/tokens";
import { Icon } from "./Icon";

type ParsedSvg = ReturnType<typeof parseSvg>;

/** The diagram's text in Inter, as the web canvas sets it; the family carries the weight. */
const svgSans = (weight: number) => sans(weight >= 650 ? "700" : weight >= 550 ? "600" : weight >= 450 ? "500" : "400");

/** Parse once per SVG string, adapted for react-native-svg (see lib/nativeSvg.ts). */
function useSvgAst(svg: string, mono: string): ParsedSvg {
  return useMemo(() => {
    try {
      return parseSvg(svg, (root) => {
        adaptSvgTree(root as unknown as SvgNode, { mono, sans: svgSans });
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
  }, [svg, mono]);
}

/** An SVG string drawn natively at `width` × `height` (its viewBox scaled to fit). */
export const ArchSvg = memo(function ArchSvg({ svg, width, height }: { svg: string; width: number; height: number }) {
  const { mono } = useTheme();
  const ast = useSvgAst(svg, mono);
  if (!ast) return null;
  return <SvgAst ast={ast} override={{ width, height }} />;
});

/**
 * A document's canvas in the current theme, with product logos as the
 * viewer and the share image draw them (`logos: false` keeps glyphs, as the
 * landing page does). With `selected`, only that component's connections
 * show their labels, drawn in the stronger edge color, as the canvas lights
 * them; otherwise none do (`labels: "all"` for the share image's look).
 */
export function useRenderedCanvas(
  source: string,
  path: readonly string[],
  opts: { logos?: boolean; selected?: string | null; labels?: "all" | "selected" } = {},
): RenderedArch {
  const { dark } = useTheme();
  const key = path.join(".");
  const { logos = true, selected = null, labels = "selected" } = opts;
  return useMemo(() => {
    const touches = (c: ConnectionNode) => selected !== null && (c.source[0] === selected || c.target[0] === selected);
    return renderCanvas(source, key === "" ? [] : key.split("."), {
      theme: dark ? "dark" : "light",
      showTitle: false,
      background: false,
      ...(logos ? { logos: LOGOS } : {}),
      ...(labels === "all" ? {} : { labels: touches, emphasize: touches }),
    });
  }, [source, key, dark, logos, selected, labels]);
}

/**
 * A static preview, contained in its box like the dashboard's `DocPreview`
 * (`object-fit: contain`, scaled up as well as down).
 */
export function DiagramThumb({
  source,
  path = [],
  height,
  logos = true,
  padding = 12,
  labels = "all",
}: {
  source: string;
  path?: readonly string[];
  height: number;
  logos?: boolean;
  padding?: number;
  labels?: "all" | "selected";
}) {
  const rendered = useRenderedCanvas(source, path, { logos, labels });
  const [width, setWidth] = useState(0);
  const s = width > 0 ? Math.min((width - padding * 2) / rendered.width, (height - padding * 2) / rendered.height) : 0;
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

const MAX_SCALE = 2;
/** React Flow's dot: 1.5px across at 1:1, spaced a grid cell apart, both scaling with the zoom. */
const DOT = 1.5;

/** The canvas's dot grid, moving and scaling with the view. */
function DotGrid({ x, y, scale, color }: { x: number; y: number; scale: number; color: string }) {
  const gap = CELL * scale;
  if (gap < 6) return null;
  const r = (DOT * scale) / 2;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="dots" patternUnits="userSpaceOnUse" x={x % gap} y={y % gap} width={gap} height={gap}>
          <Circle cx={r} cy={r} r={r} fill={color} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}

/** React Flow's controls as the web draws them on a touch screen: a bordered stack at bottom left. */
function Controls({
  onZoomIn,
  onZoomOut,
  onFit,
  bottom,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  bottom: number;
}) {
  const { palette } = useTheme();
  const button = (icon: "plus" | "minus" | "fit", label: string, onPress: () => void, last = false) => (
    <Pressable
      key={icon}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? palette.surface2 : palette.surface,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.line,
      })}
    >
      <Icon name={icon} size={16} color={palette.ink2} />
    </Pressable>
  );
  return (
    <View
      style={[
        {
          position: "absolute",
          left: 15,
          bottom: 15 + bottom,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.surface,
          overflow: "hidden",
        },
        SHADOW.sm,
      ]}
    >
      {button("plus", "Zoom in", onZoomIn)}
      {button("minus", "Zoom out", onZoomOut)}
      {button("fit", "Fit view", onFit, true)}
    </View>
  );
}

/**
 * The canvas: pinch to zoom, drag to pan, double-tap to zoom in (or back out
 * to fit), tap to select what's under the finger (empty canvas clears it).
 * `fitKey` refits the view when it changes (another canvas opened); a new
 * selection never moves it.
 */
export function Canvas({
  rendered,
  selected,
  onSelect,
  fitKey = "",
  bottomInset = 0,
}: {
  rendered: RenderedArch;
  /** The selected box's path, ringed like the canvas's selection. */
  selected?: string | null;
  onSelect?: (box: RenderedBox | null) => void;
  fitKey?: string;
  /** Room a panel over the canvas takes at the bottom, kept clear when fitting. */
  bottomInset?: number;
}) {
  const { palette } = useTheme();
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [grid, setGrid] = useState({ x: 0, y: 0, scale: 1 });

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const minScale = useSharedValue(0.1);
  const fitScale = useSharedValue(1);
  // Hidden until the first fit, so it never shows a frame at 1:1 first.
  const shown = useSharedValue(0);

  const fit = useCallback(
    (animated: boolean) => {
      if (!view) return;
      const v = fitViewport(rendered.width, rendered.height, view.w, Math.max(120, view.h - bottomInset), 24);
      fitScale.value = v.scale;
      minScale.value = Math.min(v.scale * 0.5, 0.5);
      const to = (n: number) => (animated ? withTiming(n, { duration: 220 }) : n);
      scale.value = to(v.scale);
      tx.value = to(v.x);
      ty.value = to(v.y);
      shown.value = 1;
    },
    // Refit on a new canvas or a new view size, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, fitKey],
  );
  // The first fit is instant; later ones (another canvas, a panel opening) glide.
  const fitted = useRef(false);
  useEffect(() => {
    if (!view) return;
    fit(fitted.current);
    fitted.current = true;
  }, [fit, view]);

  // The dot grid follows the view on the JS side; it's one pattern, cheap to redraw.
  useAnimatedReaction(
    () => [tx.value, ty.value, scale.value] as const,
    ([x, y, s]) => runOnJS(setGrid)({ x, y, scale: s }),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setView((v) => (v && v.w === width && v.h === height ? v : { w: width, h: height }));
  };

  const zoomBy = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      if (!view) return;
      const x = cx ?? view.w / 2;
      const y = cy ?? view.h / 2;
      const next = Math.min(MAX_SCALE, Math.max(minScale.value, scale.value * factor));
      const k = next / scale.value;
      tx.value = withTiming(x - (x - tx.value) * k, { duration: 200 });
      ty.value = withTiming(y - (y - ty.value) * k, { duration: 200 });
      scale.value = withTiming(next, { duration: 200 });
    },
    [view, minScale, scale, tx, ty],
  );

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

  const selectAt = useCallback(
    (x: number, y: number) => {
      if (!onSelect) return;
      const box = hitTest(rendered.boxes, (x - tx.value) / scale.value, (y - ty.value) / scale.value) ?? null;
      if (box && Platform.OS !== "web") void Haptics.selectionAsync();
      onSelect(box);
    },
    [onSelect, rendered.boxes, scale, tx, ty],
  );
  const zoomAt = useCallback(
    (x: number, y: number) => {
      if (scale.value > fitScale.value * 1.4) return fit(true);
      zoomBy(Math.min(MAX_SCALE, Math.max(1, fitScale.value * 2.5)) / scale.value, x, y);
    },
    [fit, fitScale, scale, zoomBy],
  );

  const doubleTap = useTapGesture({ numberOfTaps: 2, runOnJS: true, onActivate: (e) => zoomAt(e.x, e.y) });
  const singleTap = useTapGesture({ runOnJS: true, onActivate: (e) => selectAt(e.x, e.y) });
  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), useExclusiveGestures(doubleTap, singleTap));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const ring = selected ? rendered.boxes.find((b) => b.path === selected) : undefined;

  // A panel opening over the canvas mustn't hide what it's about: bring the
  // selected box into the part of the canvas still showing.
  useEffect(() => {
    if (!ring || !view || bottomInset <= 0) return;
    const visible = view.h - bottomInset;
    const top = ty.value + ring.y * scale.value;
    const bottom = top + ring.h * scale.value;
    const left = tx.value + ring.x * scale.value;
    const right = left + ring.w * scale.value;
    if (top >= 12 && bottom <= visible - 12 && left >= 0 && right <= view.w) return;
    const cx = tx.value + (ring.x + ring.w / 2) * scale.value;
    const cy = (top + bottom) / 2;
    tx.value = withTiming(tx.value + view.w / 2 - cx, { duration: 240 });
    ty.value = withTiming(ty.value + visible / 2 - cy, { duration: 240 });
    // Only when the selection or the panel changes, not as the view moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring?.path, bottomInset, view]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ground, overflow: "hidden" }} onLayout={onLayout}>
      <DotGrid x={grid.x} y={grid.y} scale={grid.scale} color={palette.dot} />
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[{ width: rendered.width, height: rendered.height, transformOrigin: "left top" }, contentStyle]}>
            {ring && (
              // The canvas's selection: a 2px accent ring, 2px clear of the box.
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: ring.x - 4,
                  top: ring.y - 4,
                  width: ring.w + 8,
                  height: ring.h + 8,
                  borderRadius: ring.kind === "plane" ? RADIUS.lg + 4 : RADIUS.md + 4,
                  borderWidth: 2,
                  borderColor: palette.accent,
                }}
              />
            )}
            <ArchSvg svg={rendered.svg} width={rendered.width} height={rendered.height} />
          </Animated.View>
        </View>
      </GestureDetector>
      <Controls onZoomIn={() => zoomBy(1.2)} onZoomOut={() => zoomBy(1 / 1.2)} onFit={() => fit(true)} bottom={bottomInset} />
    </View>
  );
}
