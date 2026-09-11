import {
  effectiveDisplay,
  layoutMap,
  PLANE_INNER_ORIGIN,
  type ArchDoc,
  type ComponentNode,
} from "@archlang/lang";
import { CELL } from "./toFlow";

export interface DropTarget {
  /** Parent path ([] = root). */
  parent: string[];
  /** Grid position relative to that parent. */
  at: [number, number];
}

/**
 * Resolve a canvas drop position (flow px coords) to a parent plane + relative
 * grid cell. The deepest visible plane containing the point wins.
 */
export function resolveDropTarget(
  doc: ArchDoc,
  flowPos: { x: number; y: number },
  gridSize?: [number, number],
): DropTarget {
  const layout = layoutMap(doc);
  let best: { parent: string[]; originPx: [number, number]; depth: number } = {
    parent: [],
    originPx: [0, 0],
    depth: 0,
  };

  const walk = (
    items: ComponentNode[],
    prefix: string[],
    originPx: [number, number],
    depth: number,
  ) => {
    for (const c of items) {
      const path = [...prefix, c.id];
      const entry = layout.get(path.join("."));
      if (!entry?.at || !entry.size) continue;
      if (effectiveDisplay(c, entry) !== "plane" || c.children.length === 0) {
        // Planes only; icons and leaves can't receive drops (v0.7 may extend).
        if (c.children.length === 0 || entry.display === "icon") continue;
      }
      const px: [number, number] = [
        originPx[0] + entry.at[0] * CELL,
        originPx[1] + entry.at[1] * CELL,
      ];
      const w = entry.size[0] * CELL;
      const h = entry.size[1] * CELL;
      if (
        flowPos.x >= px[0] &&
        flowPos.x <= px[0] + w &&
        flowPos.y >= px[1] &&
        flowPos.y <= px[1] + h &&
        depth + 1 > best.depth
      ) {
        best = { parent: path, originPx: px, depth: depth + 1 };
      }
      walk(c.children, path, px, depth + 1);
    }
  };
  walk(doc.components, [], [0, 0], 0);

  const rel: [number, number] = [
    Math.round((flowPos.x - best.originPx[0]) / CELL - (gridSize?.[0] ?? 4) / 2),
    Math.round((flowPos.y - best.originPx[1]) / CELL - (gridSize?.[1] ?? 3) / 2),
  ];
  if (best.parent.length > 0) {
    rel[0] = Math.max(rel[0], PLANE_INNER_ORIGIN[0]);
    rel[1] = Math.max(rel[1], PLANE_INNER_ORIGIN[1]);
  }
  return { parent: best.parent, at: rel };
}
