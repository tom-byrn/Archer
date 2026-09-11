import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type DisplayMode,
  type LayoutEntry,
} from "./types";
import { normalizeLayout } from "./validate";

/** Default footprint of a leaf / icon-collapsed component, in grid cells. */
export const LEAF_SIZE: [number, number] = [4, 3];
/** Children of a plane start at this inner offset (room for the icon + title row). */
export const PLANE_INNER_ORIGIN: [number, number] = [1, 2];
/** Right/bottom inner margin of a plane around its children. */
export const PLANE_INNER_MARGIN: [number, number] = [1, 1];
const H_GAP = 3;
const V_GAP = 2;
/** A layer taller than this wraps into side-by-side sub-columns. */
const TARGET_COL_H = 14;

export const layoutMap = (doc: ArchDoc): Map<string, LayoutEntry> =>
  new Map(doc.layout.map((e) => [pathToString(e.path), e]));

/** A container renders as a plane unless explicitly collapsed to an icon. */
export const effectiveDisplay = (
  component: ComponentNode,
  entry: LayoutEntry | undefined,
): DisplayMode =>
  entry?.display ?? (component.children.length > 0 ? "plane" : "icon");

interface Rect {
  at: [number, number];
  size: [number, number];
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.at[0] < b.at[0] + b.size[0] &&
  b.at[0] < a.at[0] + a.size[0] &&
  a.at[1] < b.at[1] + b.size[1] &&
  b.at[1] < a.at[1] + a.size[1];

/**
 * Complete the layout block: every component gets an `at` and `size`; existing
 * entries are preserved untouched. Deterministic. Never mutates the input.
 *
 * Scope-by-scope (bottom-up so container sizes are known):
 * 1. Children with entries keep them (missing size is filled in).
 * 2. Children without entries are layered by the connection graph projected onto
 *    this scope (longest-path in declaration order — cycle-safe), placed in
 *    columns left→right, stacked top→bottom, then nudged down past collisions.
 */
export function autoLayout(doc: ArchDoc): ArchDoc {
  const base = normalizeLayout(doc);
  const existing = layoutMap(base);
  const out = new Map<string, LayoutEntry>();

  // Edges projected onto a scope: child-id -> set of child-ids it points at.
  const scopeEdges = (prefix: string, childIds: Set<string>) => {
    const edges = new Map<string, Set<string>>();
    for (const id of childIds) edges.set(id, new Set());
    const project = (path: string[]): string | null => {
      const p = pathToString(path);
      if (prefix === "") {
        const head = path[0];
        return head !== undefined && childIds.has(head) ? head : null;
      }
      if (!p.startsWith(prefix + ".")) return null;
      const head = path[prefix.split(".").length];
      return head !== undefined && childIds.has(head) ? head : null;
    };
    for (const c of base.connections) {
      const s = project(c.source);
      const t = project(c.target);
      if (s !== null && t !== null && s !== t) edges.get(s)!.add(t);
    }
    return edges;
  };

  /** Lay out one scope's children; returns the bounding box of all of them. */
  const layoutScope = (
    nodes: ComponentNode[],
    prefix: string,
  ): { w: number; h: number } => {
    // Bottom-up: size containers first.
    const sizes = new Map<string, [number, number]>();
    for (const n of nodes) {
      const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
      const entry = existing.get(p);
      const inner = layoutScope(n.children, p);
      let size: [number, number];
      if (entry?.size) {
        size = entry.size;
      } else if (effectiveDisplay(n, entry) === "plane" && n.children.length > 0) {
        size = [
          PLANE_INNER_ORIGIN[0] + inner.w + PLANE_INNER_MARGIN[0],
          PLANE_INNER_ORIGIN[1] + inner.h + PLANE_INNER_MARGIN[1],
        ];
      } else {
        size = LEAF_SIZE;
      }
      sizes.set(n.id, size);
    }

    // Layering (longest-path, declaration order, cycle-safe: only consider
    // predecessors already assigned).
    const ids = nodes.map((n) => n.id);
    const idSet = new Set(ids);
    const edges = scopeEdges(prefix, idSet);
    const layer = new Map<string, number>();
    for (const id of ids) {
      let l = 0;
      for (const [from, tos] of edges) {
        if (tos.has(id) && layer.has(from)) l = Math.max(l, layer.get(from)! + 1);
      }
      layer.set(id, l);
    }

    const placed: Rect[] = [];
    const origin: [number, number] =
      prefix === "" ? [0, 0] : PLANE_INNER_ORIGIN;

    // Fixed entries participate in collision avoidance and the bounding box.
    for (const n of nodes) {
      const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
      const entry = existing.get(p);
      if (entry?.at) {
        const rect: Rect = { at: entry.at, size: sizes.get(n.id)! };
        placed.push(rect);
        out.set(p, {
          kind: "layout-entry",
          path: entry.path,
          at: entry.at,
          size: sizes.get(n.id)!,
          display: entry.display,
          span: entry.span,
        });
      }
    }

    // Auto-placed nodes, grouped by layer (declaration order preserved).
    const layers = [...new Set([...layer.values()])].sort((a, b) => a - b);
    const autoByLayer = new Map<number, ComponentNode[]>();
    for (const n of nodes) {
      const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
      if (existing.get(p)?.at) continue;
      const l = layer.get(n.id)!;
      autoByLayer.set(l, [...(autoByLayer.get(l) ?? []), n]);
    }

    // Each layer is a vertical band that WRAPS into side-by-side sub-columns
    // once it grows taller than TARGET_COL_H, so sibling-heavy scopes (e.g. a
    // plane full of unconnected children) come out roughly rectangular
    // instead of one endless column.
    let x = origin[0];
    for (const l of layers) {
      const members = autoByLayer.get(l);
      if (!members || members.length === 0) continue;
      const totalH = members.reduce(
        (acc, n) => acc + sizes.get(n.id)![1] + V_GAP,
        -V_GAP,
      );
      const cap = Math.max(
        Math.ceil(totalH / Math.max(1, Math.ceil(totalH / TARGET_COL_H))),
        Math.max(...members.map((n) => sizes.get(n.id)![1])),
      );

      let subX = x;
      let subW = 0;
      let y = origin[1];
      for (const n of members) {
        const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
        const entry = existing.get(p);
        const size = sizes.get(n.id)!;
        if (y > origin[1] && y - origin[1] + size[1] > cap) {
          subX += subW + H_GAP;
          subW = 0;
          y = origin[1];
        }
        const rect: Rect = { at: [subX, y], size };
        while (placed.some((r) => intersects(r, rect)))
          rect.at = [rect.at[0], rect.at[1] + 1];
        placed.push(rect);
        y = rect.at[1] + size[1] + V_GAP;
        subW = Math.max(subW, size[0]);
        out.set(p, {
          kind: "layout-entry",
          path: p.split("."),
          at: rect.at,
          size,
          display: entry?.display,
          span:
            entry?.span ??
            ({ start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } as const),
        });
      }
      x = subX + subW + H_GAP;
    }

    let w = 0;
    let h = 0;
    for (const r of placed) {
      w = Math.max(w, r.at[0] + r.size[0] - origin[0]);
      h = Math.max(h, r.at[1] + r.size[1] - origin[1]);
    }
    return { w, h };
  };

  layoutScope(base.components, "");
  return { ...base, layout: [...out.values()] };
}
