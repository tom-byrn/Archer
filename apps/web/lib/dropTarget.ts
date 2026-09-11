import {
  effectiveDisplay,
  findComponent,
  layoutMap,
  PLANE_INNER_ORIGIN,
  type ArchDoc,
  type ComponentNode,
} from "@archlang/lang";
import { CELL } from "./toFlow";

export interface DropTarget {
  /** Parent path ([] = root of the document). */
  parent: string[];
  /** Grid position relative to that parent. */
  at: [number, number];
}

export interface ResolveOptions {
  /** The view's root (drill-down focus); containment starts at its children. */
  base?: string[];
  /** Path whose subtree can't be a target (the node being dragged). */
  exclude?: string[];
  /** Top-left of the dropped rect in flow px; defaults to centering around the point. */
  topLeft?: { x: number; y: number };
  /** Grid size of the dropped rect, for centering. */
  sizeGrid?: [number, number];
}

/**
 * Resolve a canvas point (flow px, relative to the current view's origin) to a
 * parent plane + relative grid cell. The deepest visible expanded plane
 * containing the point wins; otherwise the view root.
 */
export function resolveDropTarget(
  doc: ArchDoc,
  point: { x: number; y: number },
  opts: ResolveOptions = {},
): DropTarget {
  const layout = layoutMap(doc);
  const base = opts.base ?? [];
  const excludeKey = opts.exclude?.join(".");
  let best: { parent: string[]; originPx: [number, number]; depth: number } = {
    parent: [...base],
    originPx: [0, 0],
    depth: 0,
  };

  const rootItems =
    base.length === 0 ? doc.components : (findComponent(doc, base)?.children ?? []);

  const walk = (
    items: ComponentNode[],
    prefix: string[],
    originPx: [number, number],
    depth: number,
  ) => {
    for (const c of items) {
      const path = [...prefix, c.id];
      const key = path.join(".");
      if (excludeKey !== undefined && (key === excludeKey || key.startsWith(excludeKey + ".")))
        continue;
      const entry = layout.get(key);
      if (!entry?.at || !entry.size) continue;
      if (effectiveDisplay(c, entry) !== "plane" || c.children.length === 0) continue;
      const px: [number, number] = [
        originPx[0] + entry.at[0] * CELL,
        originPx[1] + entry.at[1] * CELL,
      ];
      const w = entry.size[0] * CELL;
      const h = entry.size[1] * CELL;
      if (
        point.x >= px[0] &&
        point.x <= px[0] + w &&
        point.y >= px[1] &&
        point.y <= px[1] + h &&
        depth + 1 > best.depth
      ) {
        best = { parent: path, originPx: px, depth: depth + 1 };
      }
      walk(c.children, path, px, depth + 1);
    }
  };
  walk(rootItems, [...base], [0, 0], 0);

  const size = opts.sizeGrid ?? [4, 3];
  const topLeft = opts.topLeft ?? {
    x: point.x - (size[0] * CELL) / 2,
    y: point.y - (size[1] * CELL) / 2,
  };
  const rel: [number, number] = [
    Math.round((topLeft.x - best.originPx[0]) / CELL),
    Math.round((topLeft.y - best.originPx[1]) / CELL),
  ];
  if (best.parent.length > 0) {
    rel[0] = Math.max(rel[0], PLANE_INNER_ORIGIN[0]);
    rel[1] = Math.max(rel[1], PLANE_INNER_ORIGIN[1]);
  }
  return { parent: best.parent, at: rel };
}
