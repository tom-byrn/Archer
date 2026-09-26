import {
  PLANE_INNER_ORIGIN,
  layoutMap,
  planeTree,
  scopeAt,
  type ArchDoc,
  type PlaneNode,
} from "@archer/lang";
import { CELL } from "./toFlow";

export interface DropTarget {
  /** The canvas it lands on, as a component path ([] = the top level). */
  scope: string[];
  /** The plane it lands on there, by id. */
  plane?: string;
  /**
   * Grid position, relative to the plane (else the canvas). Absent when it's
   * dropped into a component: auto-layout finds it a spot inside.
   */
  at?: [number, number];
  /** What to highlight while dragging: the plane it lands on, or the component it goes into. */
  highlight?: string;
}

export interface ResolveOptions {
  /** The canvas on screen (drill-down focus). */
  base?: string[];
  /** Paths being dragged: never a target, and neither is anything on them. */
  exclude?: readonly (readonly string[])[];
  /** Top-left of the dropped rect in flow px; defaults to centering around the point. */
  topLeft?: { x: number; y: number };
  /** Grid size of the dropped rect, for centering. */
  sizeGrid?: [number, number];
  /**
   * Dropping onto a component puts it inside that component. Planes can't
   * go inside components, so leave this off when a plane is dropped.
   */
  nest?: boolean;
}

/**
 * Resolve a canvas point (flow px, relative to the canvas's origin) to where
 * something dropped there lands: into the component under it (with `nest`),
 * else onto the deepest plane under it, else loose on the canvas.
 */
export function resolveDropTarget(
  doc: ArchDoc,
  point: { x: number; y: number },
  opts: ResolveOptions = {},
): DropTarget {
  const layout = layoutMap(doc);
  const base = opts.base ?? [];
  const pre = base.join(".");
  const excluded = new Set((opts.exclude ?? []).map((p) => p.join(".")));
  const scope = scopeAt(doc, base);
  let plane: { node: PlaneNode; path: string; originPx: [number, number]; depth: number } | null = null;
  let into: string | null = null;

  if (scope) {
    const tree = planeTree(scope);
    const walk = (on: PlaneNode | undefined, originPx: [number, number], depth: number) => {
      for (const item of tree.itemsOn(on)) {
        const path = pre === "" ? item.id : `${pre}.${item.id}`;
        if (excluded.has(path)) continue;
        const entry = layout.get(path);
        if (!entry?.at || !entry.size) continue;
        const px: [number, number] = [originPx[0] + entry.at[0] * CELL, originPx[1] + entry.at[1] * CELL];
        const hit =
          point.x >= px[0] &&
          point.x <= px[0] + entry.size[0] * CELL &&
          point.y >= px[1] &&
          point.y <= px[1] + entry.size[1] * CELL;
        if (item.kind === "plane") {
          if (hit && depth + 1 > (plane?.depth ?? 0)) plane = { node: item, path, originPx: px, depth: depth + 1 };
          walk(item, px, depth + 1);
        } else if (hit && opts.nest) into = path;
      }
    };
    walk(undefined, [0, 0], 0);
  }

  if (into !== null) return { scope: (into as string).split("."), highlight: into };

  const onPlane = plane as { node: PlaneNode; path: string; originPx: [number, number] } | null;
  const size = opts.sizeGrid ?? [4, 3];
  const topLeft = opts.topLeft ?? {
    x: point.x - (size[0] * CELL) / 2,
    y: point.y - (size[1] * CELL) / 2,
  };
  const origin = onPlane?.originPx ?? [0, 0];
  const at: [number, number] = [
    Math.round((topLeft.x - origin[0]) / CELL),
    Math.round((topLeft.y - origin[1]) / CELL),
  ];
  if (onPlane) {
    at[0] = Math.max(at[0], PLANE_INNER_ORIGIN[0]);
    at[1] = Math.max(at[1], PLANE_INNER_ORIGIN[1]);
    return { scope: [...base], plane: onPlane.node.id, at, highlight: onPlane.path };
  }
  return { scope: [...base], at };
}
