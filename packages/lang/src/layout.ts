import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type DisplayMode,
  type LayoutEntry,
  type Span,
} from "./types";
import { normalizeLayout } from "./validate";
import { LEAF_SIZE, PLANE_INNER_MARGIN, PLANE_INNER_ORIGIN, layeredLayout } from "./layered";

export { LEAF_SIZE, PLANE_INNER_ORIGIN, PLANE_INNER_MARGIN } from "./layered";

/** Spacing kept around a component placed next to existing ones. */
const COL_GAP = 3;
const ROW_GAP = 2;
/** How far (cells) from its ideal spot a new component may land. */
const SEARCH_RADIUS = 30;
/**
 * Most boxes a view opens with: the top level, or a collapsed container's
 * interior once drilled into. Past this a diagram stops reading as a picture,
 * so containers laid out for the first time open only while their view stays
 * within it (see `planDisplays`).
 */
export const VIEW_BUDGET = 16;

const ZERO_SPAN: Span = {
  start: { line: 0, col: 0, offset: 0 },
  end: { line: 0, col: 0, offset: 0 },
};

export const layoutMap = (doc: ArchDoc): Map<string, LayoutEntry> =>
  new Map(doc.layout.map((e) => [pathToString(e.path), e]));

/** A container renders as a plane unless explicitly collapsed to an icon. */
export const effectiveDisplay = (
  component: ComponentNode,
  entry: LayoutEntry | undefined,
): DisplayMode =>
  entry?.display ?? (component.children.length > 0 ? "plane" : "icon");

export interface AutoLayoutOptions {
  /**
   * Discard every position and size (display modes survive) and arrange the
   * whole document from scratch — the canvas's "Auto-layout" button.
   */
  reset?: boolean;
  /**
   * Decide whether each container laid out for the first time starts open or
   * collapsed (default true; see `planDisplays`). Off: every container with
   * no display of its own opens as a plane.
   */
  collapse?: boolean;
}

/**
 * Open or collapsed, for every container whose display hasn't been settled —
 * no layout entry yet, or one with neither a position nor a display. A
 * container with a position was already drawn open, so it stays that way.
 *
 * Each view gets `budget` boxes. A view is the top level, or the interior of a
 * collapsed container (what drilling in shows); an open plane's children are
 * part of its parent's view. New containers start collapsed, then open
 * smallest first while the view stays within budget, their own new containers
 * joining the queue. A document that fits shows everything, as it always did;
 * a big one opens as an overview of its parts, small groups (clients, data
 * stores) already open, each big subsystem a box with its count inside. A
 * view of a single container always opens it, so no view is one lone box.
 */
export function planDisplays(
  components: readonly ComponentNode[],
  layout: ReadonlyMap<string, LayoutEntry>,
  budget = VIEW_BUDGET,
): Map<string, DisplayMode> {
  const plan = new Map<string, DisplayMode>();
  const settled = (path: string): DisplayMode | undefined => {
    const e = layout.get(path);
    return e?.display ?? (e?.at ? "plane" : undefined);
  };
  const open = (path: string, c: ComponentNode) =>
    c.children.length > 0 && (settled(path) ?? plan.get(path)) === "plane";
  const join = (pre: string, c: ComponentNode) => (pre === "" ? c.id : `${pre}.${c.id}`);

  /** Boxes a view draws: each item, or an open plane's own boxes in its place. */
  const boxes = (items: readonly ComponentNode[], pre: string): number =>
    items.reduce((n, c) => {
      const path = join(pre, c);
      return n + (open(path, c) ? boxes(c.children, path) : 1);
    }, 0);
  /** Collapsed containers drawn in a view, in document order. */
  const closed = (items: readonly ComponentNode[], pre: string, out: [string, ComponentNode][] = []) => {
    for (const c of items) {
      const path = join(pre, c);
      if (open(path, c)) closed(c.children, path, out);
      else if (c.children.length > 0) out.push([path, c]);
    }
    return out;
  };
  const seed = (items: readonly ComponentNode[], pre: string) => {
    for (const c of items) {
      const path = join(pre, c);
      if (c.children.length > 0 && settled(path) === undefined && !plan.has(path)) plan.set(path, "icon");
      if (open(path, c)) seed(c.children, path);
    }
  };

  const planView = (items: readonly ComponentNode[], pre: string) => {
    seed(items, pre);
    let total = boxes(items, pre);
    for (;;) {
      const fresh = closed(items, pre).filter(([path]) => settled(path) === undefined);
      if (fresh.length === 0) break;
      const lone = total === 1;
      const costs = fresh.map(([path, c]) => {
        seed(c.children, path);
        return { path, cost: boxes(c.children, path) - 1 };
      });
      const pick = costs
        .map((x, i) => ({ ...x, i }))
        .sort((a, b) => a.cost - b.cost || a.i - b.i)
        .find((x) => lone || total + x.cost <= budget);
      if (!pick) break;
      plan.set(pick.path, "plane");
      total += pick.cost;
    }
    // Each container left collapsed is a view of its own.
    for (const [path, c] of closed(items, pre)) planView(c.children, path);
  };
  planView(components, "");
  return plan;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const parentOf = (path: string): string => {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(0, i);
};
const isUnder = (path: string, prefix: string) =>
  prefix === "" || path === prefix || path.startsWith(prefix + ".");

/**
 * Complete the layout block: every component gets an `at` and `size`, and a
 * container laid out for the first time gets collapsed when its view is
 * already full (`planDisplays`). Deterministic; never mutates the input.
 *
 * - A document with no positions at all (or `reset`) is arranged from scratch
 *   by the layered engine (`layered.ts`): connections flow left → right with
 *   few crossings and straight edges, planes wrap their children.
 * - Otherwise existing positions are kept. A new container gets its interior
 *   laid out by the same engine; each new component (or container) is then
 *   placed in free space next to the components it connects to — right of
 *   its sources, left of its targets. Planes grow to fit their children, and
 *   siblings a grown plane would overlap are nudged right/down.
 */
export function autoLayout(doc: ArchDoc, opts: AutoLayoutOptions = {}): ArchDoc {
  const base = normalizeLayout(doc);
  const given = new Map<string, LayoutEntry>();
  for (const e of base.layout) {
    given.set(
      pathToString(e.path),
      opts.reset
        ? { kind: "layout-entry", path: e.path, display: e.display, span: e.span }
        : e,
    );
  }
  // New containers in a crowded view start collapsed (decided on the entries
  // as they were: a reset keeps what was open open).
  if (opts.collapse !== false) {
    for (const [path, display] of planDisplays(base.components, layoutMap(base))) {
      if (display !== "icon") continue;
      const e = given.get(path);
      given.set(
        path,
        e ? { ...e, display } : { kind: "layout-entry", path: path.split("."), display, span: ZERO_SPAN },
      );
    }
  }

  const comps = new Map<string, ComponentNode>();
  const index = (items: readonly ComponentNode[], pre: string) => {
    for (const c of items) {
      const path = pre === "" ? c.id : `${pre}.${c.id}`;
      if (comps.has(path)) continue;
      comps.set(path, c);
      index(c.children, path);
    }
  };
  index(base.components, "");

  const isPlane = (path: string, c: ComponentNode) =>
    c.children.length > 0 && effectiveDisplay(c, given.get(path)) === "plane";
  const boxSize = (path: string): [number, number] => given.get(path)?.size ?? LEAF_SIZE;

  const out = new Map<string, LayoutEntry>();
  const put = (path: string, at: [number, number], size: [number, number]) => {
    const g = given.get(path);
    out.set(path, {
      kind: "layout-entry",
      path: path.split("."),
      at,
      size,
      display: g?.display,
      span: g?.span ?? ZERO_SPAN,
    });
  };

  /** Arrange a forest from scratch; its top-level boxes are offset by `origin`. */
  const layForest = (items: readonly ComponentNode[], pre: string, origin: [number, number]) => {
    const placed = layeredLayout(items, pre, base.connections, { isPlane, boxSize });
    for (const [path, p] of placed) {
      const top = parentOf(path) === pre;
      put(path, top ? [p.at[0] + origin[0], p.at[1] + origin[1]] : p.at, p.size);
      const c = comps.get(path)!;
      if (c.children.length > 0 && !isPlane(path, c))
        layForest(c.children, path, PLANE_INNER_ORIGIN);
    }
  };

  const fixed = [...given.values()].filter((e) => e.at).map((e) => pathToString(e.path));
  if (fixed.length === 0) {
    layForest(base.components, "", [0, 0]);
    return { ...base, layout: [...out.values()] };
  }

  // ------------------------------------------------ incremental placement
  const freshInside = (path: string) => !fixed.some((p) => p.startsWith(path + "."));

  /** Size of a plane from its children's entries (undefined until one is placed). */
  const fitSize = (path: string): [number, number] | undefined => {
    const c = comps.get(path);
    if (!c) return undefined;
    let w = 0;
    let h = 0;
    let any = false;
    for (const child of c.children) {
      const e = out.get(`${path}.${child.id}`);
      if (!e?.at || !e.size) continue;
      any = true;
      w = Math.max(w, e.at[0] + e.size[0]);
      h = Math.max(h, e.at[1] + e.size[1]);
    }
    return any ? [w + PLANE_INNER_MARGIN[0], h + PLANE_INNER_MARGIN[1]] : undefined;
  };
  const sizeFor = (path: string, c: ComponentNode): [number, number] => {
    if (!isPlane(path, c)) return boxSize(path);
    const fit = fitSize(path);
    const had = given.get(path)?.size;
    if (fit && had) return [Math.max(fit[0], had[0]), Math.max(fit[1], had[1])];
    return fit ?? had ?? LEAF_SIZE;
  };

  /** The component actually drawn for `path` (a collapsed ancestor hides it). */
  const drawnAs = (path: string): string => {
    const segs = path.split(".");
    for (let i = 1; i < segs.length; i++) {
      const p = segs.slice(0, i).join(".");
      const c = comps.get(p);
      if (c && !isPlane(p, c)) return p;
    }
    return path;
  };
  /** Top-left of a scope's local frame in absolute cells ("" = the root). */
  const absOrigin = (pre: string): [number, number] | undefined => {
    let x = 0;
    let y = 0;
    const segs = pre === "" ? [] : pre.split(".");
    for (let i = 1; i <= segs.length; i++) {
      const e = out.get(segs.slice(0, i).join("."));
      if (!e?.at) return undefined;
      x += e.at[0];
      y += e.at[1];
    }
    return [x, y];
  };
  /** A component's rect in the local frame of scope `pre`, when known. */
  const localRect = (path: string, pre: string): Rect | undefined => {
    const e = out.get(path);
    if (!e?.at || !e.size) return undefined;
    const segs = path.split(".");
    const depth = pre === "" ? 0 : pre.split(".").length;
    if (isUnder(path, pre)) {
      let x = 0;
      let y = 0;
      for (let i = depth + 1; i <= segs.length; i++) {
        const a = out.get(segs.slice(0, i).join("."));
        if (!a?.at) return undefined;
        x += a.at[0];
        y += a.at[1];
      }
      return { x, y, w: e.size[0], h: e.size[1] };
    }
    const abs = absOrigin(parentOf(path));
    const own = absOrigin(pre);
    if (!abs || !own) return undefined;
    return {
      x: abs[0] + e.at[0] - own[0],
      y: abs[1] + e.at[1] - own[1],
      w: e.size[0],
      h: e.size[1],
    };
  };

  /** Known neighbours of `path` (outside its subtree), in `pre`'s frame. */
  const anchors = (path: string, pre: string) => {
    const found: { r: Rect; incoming: boolean }[] = [];
    for (const c of base.connections) {
      const s = drawnAs(pathToString(c.source));
      const t = drawnAs(pathToString(c.target));
      const sIn = isUnder(s, path);
      const tIn = isUnder(t, path);
      if (sIn === tIn) continue;
      const r = localRect(sIn ? t : s, pre);
      if (r) found.push({ r, incoming: tIn });
    }
    return found;
  };

  const overlaps = (a: Rect, b: Rect, gx: number, gy: number) =>
    a.x - gx < b.x + b.w && b.x < a.x + a.w + gx && a.y - gy < b.y + b.h && b.y < a.y + a.h + gy;

  /** Best free spot for a w×h box near its neighbours in `pre`'s frame. */
  const findSpot = (
    size: [number, number],
    near: { r: Rect; incoming: boolean }[],
    placed: Rect[],
    pre: string,
  ): [number, number] => {
    const [w, h] = size;
    const min: [number, number] = pre === "" ? [-Infinity, -Infinity] : PLANE_INNER_ORIGIN;
    const limit = pre === "" ? undefined : (out.get(pre)?.size ?? given.get(pre)?.size);
    if (placed.length === 0) return pre === "" ? [0, 0] : [...PLANE_INNER_ORIGIN];

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

  const placeScope = (items: readonly ComponentNode[], pre: string) => {
    const pathOf = (c: ComponentNode) => (pre === "" ? c.id : `${pre}.${c.id}`);
    const interior = (c: ComponentNode) => {
      const path = pathOf(c);
      if (freshInside(path)) layForest(c.children, path, PLANE_INNER_ORIGIN);
      else placeScope(c.children, path);
    };
    // New containers first, so their sizes are known before placing them.
    for (const c of items) if (c.children.length > 0 && !given.get(pathOf(c))?.at) interior(c);

    const placed: Rect[] = [];
    const pending: ComponentNode[] = [];
    for (const c of items) {
      const path = pathOf(c);
      const at = given.get(path)?.at;
      if (!at) {
        pending.push(c);
        continue;
      }
      const size = sizeFor(path, c);
      put(path, at, size);
      placed.push({ x: at[0], y: at[1], w: size[0], h: size[1] });
    }
    // Most-connected first, so each lands next to neighbours already placed.
    while (pending.length > 0) {
      let pick = 0;
      let pickNear = anchors(pathOf(pending[0]!), pre);
      for (let i = 1; i < pending.length; i++) {
        const near = anchors(pathOf(pending[i]!), pre);
        if (near.length > pickNear.length) {
          pick = i;
          pickNear = near;
        }
      }
      const c = pending.splice(pick, 1)[0]!;
      const path = pathOf(c);
      const size = sizeFor(path, c);
      const at = findSpot(size, pickNear, placed, pre);
      put(path, at, size);
      placed.push({ x: at[0], y: at[1], w: size[0], h: size[1] });
    }

    for (const c of items) if (c.children.length > 0 && given.get(pathOf(c))?.at) interior(c);
  };

  /** Grow planes to fit their children (bottom-up); push aside what they now overlap. */
  const growScope = (items: readonly ComponentNode[], pre: string) => {
    const paths = items.map((c) => (pre === "" ? c.id : `${pre}.${c.id}`));
    items.forEach((c, i) => c.children.length > 0 && growScope(c.children, paths[i]!));
    const grown: string[] = [];
    items.forEach((c, i) => {
      const path = paths[i]!;
      const e = out.get(path);
      if (!e?.size || !isPlane(path, c)) return;
      const fit = fitSize(path);
      if (!fit || (fit[0] <= e.size[0] && fit[1] <= e.size[1])) return;
      e.size = [Math.max(fit[0], e.size[0]), Math.max(fit[1], e.size[1])];
      grown.push(path);
    });
    const rect = (p: string): Rect => {
      const e = out.get(p)!;
      return { x: e.at![0], y: e.at![1], w: e.size![0], h: e.size![1] };
    };
    // Every push moves right or down, so this settles.
    const queue = [...grown];
    for (let guard = 0; queue.length > 0 && guard < 10_000; guard++) {
      const moverPath = queue.shift()!;
      const mover = rect(moverPath);
      for (const p of paths) {
        if (p === moverPath) continue;
        const r = rect(p);
        if (!overlaps(mover, r, COL_GAP - 1, ROW_GAP - 1)) continue;
        const dx = mover.x + mover.w + COL_GAP - r.x;
        const dy = mover.y + mover.h + ROW_GAP - r.y;
        out.get(p)!.at = dx <= dy ? [r.x + dx, r.y] : [r.x, r.y + dy];
        queue.push(p);
      }
    }
  };

  placeScope(base.components, "");
  growScope(base.components, "");
  return { ...base, layout: [...out.values()] };
}
