import { planeTree, scopeAt, scopeOf, type Scope } from "./scope";
import {
  pathToString,
  type ArchDoc,
  type ItemNode,
  type LayoutEntry,
  type Span,
} from "./types";
import { normalizeLayout } from "./validate";
import {
  LEAF_SIZE,
  PLANE_INNER_MARGIN,
  PLANE_INNER_ORIGIN,
  layeredLayout,
  type LayerItem,
} from "./layered";

export { LEAF_SIZE, PLANE_INNER_ORIGIN, PLANE_INNER_MARGIN } from "./layered";

/** Footprint of a plane with nothing on it, in grid cells. */
export const EMPTY_PLANE_SIZE: [number, number] = [10, 6];

/** Spacing kept around a component placed next to existing ones. */
const COL_GAP = 3;
const ROW_GAP = 2;
/** How far (cells) from its ideal spot a new component may land. */
const SEARCH_RADIUS = 30;

const ZERO_SPAN: Span = {
  start: { line: 0, col: 0, offset: 0 },
  end: { line: 0, col: 0, offset: 0 },
};

export const layoutMap = (doc: ArchDoc): Map<string, LayoutEntry> =>
  new Map(doc.layout.map((e) => [pathToString(e.path), e]));

/**
 * The planes a component or plane sits on, innermost first, as paths (its
 * scope's path plus each plane's id). It follows the plane tree rather than
 * looking paths up again, so it ends even when a plane and a component share
 * an id (an E002 document, which the canvas still draws).
 */
export function planeChainOf(doc: ArchDoc, path: readonly string[]): string[][] {
  const scopePath = path.slice(0, -1);
  const scope = scopeAt(doc, scopePath);
  const id = path[path.length - 1];
  const item: ItemNode | undefined =
    scope?.components.find((c) => c.id === id) ?? scope?.planes.find((p) => p.id === id);
  if (!scope || !item) return [];
  return planeTree(scope)
    .chainOf(item)
    .map((p) => [...scopePath, p.id]);
}

/**
 * The plane a component or plane sits on, as a path (its scope's path plus
 * the plane's id); undefined when it sits on none.
 */
export const planePathOf = (doc: ArchDoc, path: readonly string[]): string[] | undefined =>
  planeChainOf(doc, path)[0];

/**
 * Where an item sits on its canvas: its own `at` plus those of the planes it
 * sits on (an `at` is relative to its plane). Missing entries count as 0.
 */
export function canvasAt(
  doc: ArchDoc,
  path: readonly string[],
  layout: ReadonlyMap<string, LayoutEntry> = layoutMap(doc),
): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of [path, ...planeChainOf(doc, path)]) {
    const at = layout.get(pathToString(p))?.at;
    if (at) {
      x += at[0];
      y += at[1];
    }
  }
  return [x, y];
}

export interface AutoLayoutOptions {
  /**
   * Discard every position and size and arrange the whole document from
   * scratch — the canvas's "Re-layout everything".
   */
  reset?: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A component or plane on the canvas being laid out. */
interface Item {
  path: string;
  node: ItemNode;
  /** The plane it sits on (null: the canvas itself). */
  frame: Item | null;
  /** What sits on it (planes only). */
  items: Item[];
}

const isPlane = (v: Item) => v.node.kind === "plane";

/**
 * Complete the layout block: every component and plane gets an `at` and a
 * `size`. Deterministic; never mutates the input.
 *
 * Each canvas is laid out on its own: the document's top level, and the
 * inside of every component (what drilling into it shows). A component is
 * always a box there; a plane is a region sized around what sits on it.
 *
 * - A canvas with no positions at all (or `reset`) is arranged from scratch
 *   by the layered engine (`layered.ts`): connections flow left → right with
 *   few crossings and straight edges, planes wrap what sits on them.
 * - Otherwise existing positions are kept. A new plane gets its interior laid
 *   out by the same engine; each new component (or plane) is then placed in
 *   free space next to the components it connects to — right of its sources,
 *   left of its targets. Planes grow to fit what's on them, and whatever a
 *   grown plane would overlap is nudged right/down.
 */
export function autoLayout(doc: ArchDoc, opts: AutoLayoutOptions = {}): ArchDoc {
  const base = normalizeLayout(doc);
  const given = new Map<string, LayoutEntry>();
  if (!opts.reset) for (const e of base.layout) given.set(pathToString(e.path), e);

  const out = new Map<string, LayoutEntry>();
  const put = (path: string, at: [number, number], size: [number, number]) => {
    out.set(path, {
      kind: "layout-entry",
      path: path.split("."),
      at,
      size,
      span: given.get(path)?.span ?? ZERO_SPAN,
    });
  };

  const layCanvas = (scopePath: string[], scope: Scope) => {
    layOne(scopePath, scope, base.connections, given, out, put);
    for (const c of scope.components) layCanvas([...scopePath, c.id], scopeOf(c));
  };
  layCanvas([], { components: base.components, planes: base.planes });
  return { ...base, layout: [...out.values()] };
}

/** Lay out one canvas: the scope at `scopePath`, with its planes. */
function layOne(
  scopePath: string[],
  scope: Scope,
  connections: ArchDoc["connections"],
  given: ReadonlyMap<string, LayoutEntry>,
  out: Map<string, LayoutEntry>,
  put: (path: string, at: [number, number], size: [number, number]) => void,
): void {
  const pre = scopePath.join(".");
  const depth = scopePath.length;
  const tree = planeTree(scope);
  const byPath = new Map<string, Item>();
  const make = (node: ItemNode, frame: Item | null): Item | null => {
    const path = pre === "" ? node.id : `${pre}.${node.id}`;
    if (byPath.has(path)) return null; // duplicate id (invalid doc)
    const item: Item = { path, node, frame, items: [] };
    byPath.set(path, item);
    if (node.kind === "plane") item.items = made(tree.itemsOn(node), item);
    return item;
  };
  const made = (nodes: readonly ItemNode[], frame: Item | null): Item[] =>
    nodes.map((n) => make(n, frame)).filter((v): v is Item => v !== null);
  const roots = made(tree.itemsOn(undefined), null);
  if (roots.length === 0) return;

  /** The box on this canvas that a connection's end is drawn as. */
  const endpoint = (p: readonly string[]): string | undefined => {
    if (p.length <= depth) return undefined;
    for (let i = 0; i < depth; i++) if (p[i] !== scopePath[i]) return undefined;
    const key = p.slice(0, depth + 1).join(".");
    return byPath.get(key)?.node.kind === "component" ? key : undefined;
  };
  const boxSize = (v: Item): [number, number] => given.get(v.path)?.size ?? LEAF_SIZE;
  const toLayer = (v: Item): LayerItem =>
    isPlane(v)
      ? { path: v.path, items: v.items.map(toLayer), size: [0, 0] }
      : { path: v.path, size: boxSize(v) };

  /** Arrange a forest from scratch; its top-level items are offset by `origin`. */
  const layForest = (items: Item[], origin: [number, number]) => {
    const placed = layeredLayout(items.map(toLayer), connections, endpoint);
    const top = new Set(items.map((v) => v.path));
    for (const [path, p] of placed)
      put(path, top.has(path) ? [p.at[0] + origin[0], p.at[1] + origin[1]] : p.at, p.size);
  };

  if (![...byPath.keys()].some((p) => given.get(p)?.at)) {
    layForest(roots, [0, 0]);
    return;
  }

  // ------------------------------------------------ incremental placement
  const hasFixed = (v: Item): boolean =>
    v.items.some((w) => given.get(w.path)?.at !== undefined || hasFixed(w));

  /** Size of a plane from what's on it (undefined until something is placed). */
  const fitSize = (v: Item): [number, number] | undefined => {
    let w = 0;
    let h = 0;
    let any = false;
    for (const child of v.items) {
      const e = out.get(child.path);
      if (!e?.at || !e.size) continue;
      any = true;
      w = Math.max(w, e.at[0] + e.size[0]);
      h = Math.max(h, e.at[1] + e.size[1]);
    }
    return any ? [w + PLANE_INNER_MARGIN[0], h + PLANE_INNER_MARGIN[1]] : undefined;
  };
  const sizeFor = (v: Item): [number, number] => {
    if (!isPlane(v)) return boxSize(v);
    const fit = fitSize(v);
    const had = given.get(v.path)?.size;
    if (fit && had) return [Math.max(fit[0], had[0]), Math.max(fit[1], had[1])];
    return fit ?? had ?? EMPTY_PLANE_SIZE;
  };

  /** Top-left on the canvas: `at` summed up the planes it sits on. */
  const canvasTopLeft = (v: Item): [number, number] | undefined => {
    let x = 0;
    let y = 0;
    for (let cur: Item | null = v; cur; cur = cur.frame) {
      const at = out.get(cur.path)?.at;
      if (!at) return undefined;
      x += at[0];
      y += at[1];
    }
    return [x, y];
  };
  /** An item's rect in the frame of `frame` (null: the canvas), when known. */
  const rectIn = (v: Item, frame: Item | null): Rect | undefined => {
    const size = out.get(v.path)?.size;
    const abs = canvasTopLeft(v);
    const origin = frame ? canvasTopLeft(frame) : [0, 0];
    if (!size || !abs || !origin) return undefined;
    return { x: abs[0] - origin[0]!, y: abs[1] - origin[1]!, w: size[0], h: size[1] };
  };
  const within = (v: Item, root: Item): boolean => {
    for (let cur: Item | null = v; cur; cur = cur.frame) if (cur === root) return true;
    return false;
  };

  /** Known neighbours of `item` (outside what's on it), in `frame`'s coordinates. */
  const anchors = (item: Item, frame: Item | null) => {
    const found: { r: Rect; incoming: boolean }[] = [];
    for (const c of connections) {
      const sp = endpoint(c.source);
      const tp = endpoint(c.target);
      if (sp === undefined || tp === undefined) continue;
      const s = byPath.get(sp)!;
      const t = byPath.get(tp)!;
      const sIn = within(s, item);
      const tIn = within(t, item);
      if (sIn === tIn) continue;
      const r = rectIn(sIn ? t : s, frame);
      if (r) found.push({ r, incoming: tIn });
    }
    return found;
  };

  const overlaps = (a: Rect, b: Rect, gx: number, gy: number) =>
    a.x - gx < b.x + b.w && b.x < a.x + a.w + gx && a.y - gy < b.y + b.h && b.y < a.y + a.h + gy;

  /** Best free spot for a w×h box near its neighbours in `frame`'s coordinates. */
  const findSpot = (
    size: [number, number],
    near: { r: Rect; incoming: boolean }[],
    placed: Rect[],
    frame: Item | null,
  ): [number, number] => {
    const [w, h] = size;
    const min: [number, number] = frame ? PLANE_INNER_ORIGIN : [-Infinity, -Infinity];
    const limit = frame ? (out.get(frame.path)?.size ?? given.get(frame.path)?.size) : undefined;
    if (placed.length === 0) return frame ? [...PLANE_INNER_ORIGIN] : [0, 0];

    let ix: number;
    let iy: number;
    let wx = 2;
    let wy = 1;
    if (near.length === 0) {
      // Unconnected: start a row under everything already here.
      ix = Math.min(...placed.map((r) => r.x));
      iy = Math.max(...placed.map((r) => r.y + r.h)) + ROW_GAP;
      wx = 1;
      wy = 2;
    } else {
      const after = near.filter((n) => n.incoming).map((n) => n.r.x + n.r.w + COL_GAP);
      const before = near.filter((n) => !n.incoming).map((n) => n.r.x - COL_GAP - w);
      if (after.length > 0 && before.length > 0) {
        const lo = Math.max(...after);
        const hi = Math.min(...before);
        ix = lo <= hi ? Math.round((lo + hi) / 2) : lo;
      } else ix = after.length > 0 ? Math.max(...after) : Math.min(...before);
      const mids = near.map((n) => n.r.y + n.r.h / 2).sort((a, b) => a - b);
      iy = Math.round(mids[Math.floor((mids.length - 1) / 2)]! - h / 2);
    }
    ix = Math.max(ix, min[0]);
    iy = Math.max(iy, min[1]);

    let best: [number, number] | undefined;
    let bestCost = Infinity;
    for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
      for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
        const x = ix + dx;
        const y = iy + dy;
        if (x < min[0] || y < min[1]) continue;
        let cost = Math.abs(dx) * (dx < 0 ? wx + 1 : wx) + Math.abs(dy) * wy;
        if (limit) {
          const grow =
            Math.max(0, x + w + PLANE_INNER_MARGIN[0] - limit[0]) +
            Math.max(0, y + h + PLANE_INNER_MARGIN[1] - limit[1]);
          cost += 4 * grow;
        }
        if (cost >= bestCost) continue;
        const rect = { x, y, w, h };
        if (placed.some((r) => overlaps(rect, r, COL_GAP, ROW_GAP))) continue;
        best = [x, y];
        bestCost = cost;
      }
    }
    return best ?? [ix, Math.max(...placed.map((r) => r.y + r.h)) + ROW_GAP];
  };

  const placeFrame = (frame: Item | null, items: Item[]) => {
    const interior = (v: Item) => {
      if (!hasFixed(v)) layForest(v.items, PLANE_INNER_ORIGIN);
      else placeFrame(v, v.items);
    };
    // New planes first, so their sizes are known before placing them.
    for (const v of items) if (isPlane(v) && !given.get(v.path)?.at) interior(v);

    const placed: Rect[] = [];
    const pending: Item[] = [];
    for (const v of items) {
      const at = given.get(v.path)?.at;
      if (!at) {
        pending.push(v);
        continue;
      }
      const size = sizeFor(v);
      put(v.path, at, size);
      placed.push({ x: at[0], y: at[1], w: size[0], h: size[1] });
    }
    // Most-connected first, so each lands next to neighbours already placed.
    while (pending.length > 0) {
      let pick = 0;
      let pickNear = anchors(pending[0]!, frame);
      for (let i = 1; i < pending.length; i++) {
        const near = anchors(pending[i]!, frame);
        if (near.length > pickNear.length) {
          pick = i;
          pickNear = near;
        }
      }
      const v = pending.splice(pick, 1)[0]!;
      const size = sizeFor(v);
      const at = findSpot(size, pickNear, placed, frame);
      put(v.path, at, size);
      placed.push({ x: at[0], y: at[1], w: size[0], h: size[1] });
    }

    for (const v of items) if (isPlane(v) && given.get(v.path)?.at) interior(v);
  };

  /** Grow planes to fit what's on them (bottom-up); push aside what they now overlap. */
  const growFrame = (items: Item[]) => {
    for (const v of items) if (isPlane(v)) growFrame(v.items);
    const grown: Item[] = [];
    for (const v of items) {
      const e = out.get(v.path);
      if (!e?.size || !isPlane(v)) continue;
      const fit = fitSize(v);
      if (!fit || (fit[0] <= e.size[0] && fit[1] <= e.size[1])) continue;
      e.size = [Math.max(fit[0], e.size[0]), Math.max(fit[1], e.size[1])];
      grown.push(v);
    }
    const rect = (v: Item): Rect => {
      const e = out.get(v.path)!;
      return { x: e.at![0], y: e.at![1], w: e.size![0], h: e.size![1] };
    };
    // Every push moves right or down, so this settles.
    const queue = [...grown];
    for (let guard = 0; queue.length > 0 && guard < 10_000; guard++) {
      const mover = queue.shift()!;
      const m = rect(mover);
      for (const v of items) {
        if (v === mover) continue;
        const r = rect(v);
        if (!overlaps(m, r, COL_GAP - 1, ROW_GAP - 1)) continue;
        const dx = m.x + m.w + COL_GAP - r.x;
        const dy = m.y + m.h + ROW_GAP - r.y;
        out.get(v.path)!.at = dx <= dy ? [r.x + dx, r.y] : [r.x, r.y + dy];
        queue.push(v);
      }
    }
  };

  placeFrame(null, roots);
  growFrame(roots);
}
