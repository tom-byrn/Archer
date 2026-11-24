/**
 * Diagrams on the phone are the share image (`apps/web/lib/svg.ts`), drawn
 * with react-native-svg, so they look exactly like `/share/<slug>/image.svg`
 * and the docs' pictures. The renderer draws one canvas; a component's inside
 * is drawn by rendering it as a document of its own.
 */

import { findComponent, format, parse, type ArchDoc } from "@archer/lang";
import { renderArch, type RenderedArch, type RenderedBox, type RenderOptions } from "@web/svg";

const within = (p: readonly string[], prefix: readonly string[]): boolean =>
  p.length > prefix.length && prefix.every((s, i) => p[i] === s);

/**
 * The canvas inside the component at `path` as a document of its own: its
 * components and planes, the connections between them and their positions,
 * every path made relative to it. Null when nothing is there.
 */
export function canvasDoc(doc: ArchDoc, path: readonly string[]): ArchDoc | null {
  if (path.length === 0) return doc;
  const node = findComponent(doc, path);
  if (!node) return null;
  const n = path.length;
  return {
    kind: "doc",
    title: node.name ?? node.id,
    version: doc.version,
    components: node.children,
    planes: node.planes,
    connections: doc.connections
      .filter((c) => within(c.source, path) && within(c.target, path))
      .map((c) => ({ ...c, source: c.source.slice(n), target: c.target.slice(n) })),
    layout: doc.layout
      .filter((e) => within(e.path, path))
      .map((e) => ({ ...e, path: e.path.slice(n) })),
  };
}

/** Render the canvas at `path` (the document's top level when empty). */
export function renderCanvas(
  source: string,
  path: readonly string[],
  opts: RenderOptions = {},
): RenderedArch {
  if (path.length === 0) return renderArch(source, opts);
  const doc = canvasDoc(parse(source).doc, path);
  return renderArch(doc ? format(doc) : "", opts);
}

/**
 * The box a tap at (x, y) in diagram pixels lands on: a component before the
 * plane it sits on, the innermost of nested planes.
 */
export function hitTest(boxes: readonly RenderedBox[], x: number, y: number): RenderedBox | undefined {
  const hits = boxes.filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  const components = hits.filter((b) => b.kind === "component");
  const pool = components.length > 0 ? components : hits;
  return pool.reduce<RenderedBox | undefined>(
    (best, b) => (!best || b.w * b.h < best.w * best.h ? b : best),
    undefined,
  );
}

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

/** The scale and offset that fit a `width` × `height` diagram in a `vw` × `vh` view, centered, never above 1:1. */
export function fitViewport(width: number, height: number, vw: number, vh: number, pad = 16): Viewport {
  const scale = Math.min(1, (vw - pad * 2) / width, (vh - pad * 2) / height);
  const s = Math.max(scale, 0.05);
  return { scale: s, x: (vw - width * s) / 2, y: (vh - height * s) / 2 };
}
