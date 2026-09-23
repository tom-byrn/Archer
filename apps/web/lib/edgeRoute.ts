/**
 * Orthogonal edge routing shared by the canvas (`toFlow` → `ArchEdgeComponent`)
 * and the SVG renderer (`svg.ts`), so both draw an edge the same way.
 *
 * Every edge is three straight pieces: out of one side of the source, one
 * bend segment, into the facing side of the target. Boxes side by side
 * connect left/right, stacked boxes top/bottom. The bend goes where the whole
 * path (and its label chip) clears the other boxes — the auto-layout leaves
 * free lanes for long edges, and this is what uses them — preferring the
 * middle of the span.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "t" | "r" | "b" | "l";

/** Something an edge should not cross; `cost` weighs a crossing (boxes 1000). */
export interface Obstacle extends Rect {
  cost: number;
}

export interface EdgeRoute {
  /** Side the edge leaves the source from / enters the target on. */
  from: Side;
  to: Side;
  /**
   * Left/right sides: the middle segment is vertical at x = mid.
   * Top/bottom: horizontal at y = mid.
   */
  horizontal: boolean;
  mid: number;
  /**
   * An L instead: out of the source's side level with it, then straight into
   * the target's top or bottom (`from` is l/r, `to` is t/b; `mid` unused).
   */
  corner?: boolean;
}

/** Bends stay at least this far (px) from the boxes they leave and enter. */
const CLEAR = 20;
const STEP = 8;
export const BOX_COST = 1000;
export const CHIP_H = 18;

/** Approximate rendered width (px) of a label chip. */
export const chipWidth = (protocol?: string, label?: string, payloads = 0): number => {
  const text = [protocol, label].filter((p) => p !== undefined).join(" · ");
  if (text === "" && payloads === 0) return 0;
  return Math.round(text.length * 6.2 + 14 + (payloads > 0 ? 18 : 0));
};

interface Seg {
  /** Fixed coordinate across the segment (y for horizontal pieces). */
  at: number;
  from: number;
  to: number;
  alongX: boolean;
}

/** Paths keep this far (px) from other boxes. */
const MARGIN = 10;

/** The rect's extent across and along a segment's direction. */
const spans = (s: Seg, r: Rect) =>
  s.alongX
    ? { across: [r.y, r.y + r.h] as const, along: [r.x, r.x + r.w] as const }
    : { across: [r.x, r.x + r.w] as const, along: [r.y, r.y + r.h] as const };

function segmentHits(s: Seg, r: Rect): boolean {
  const { across, along } = spans(s, r);
  const lo = Math.min(s.from, s.to);
  const hi = Math.max(s.from, s.to);
  return (
    s.at > across[0] - MARGIN &&
    s.at < across[1] + MARGIN &&
    hi > along[0] - MARGIN &&
    lo < along[1] + MARGIN
  );
}

/** A bend squeezed between or right beside boxes reads as crossing them. */
function besideBox(s: Seg, r: Rect): boolean {
  const { across, along } = spans(s, r);
  const lo = Math.min(s.from, s.to) - 2 * CLEAR;
  const hi = Math.max(s.from, s.to) + 2 * CLEAR;
  return s.at > across[0] - MARGIN && s.at < across[1] + MARGIN && hi > along[0] && lo < along[1];
}

const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Route one edge between two boxes (absolute px). `obstacles` should not
 * include the two endpoints; `chip` is the label chip width (0 = no label).
 */
export function routeEdge(
  s: Rect,
  t: Rect,
  obstacles: readonly Obstacle[],
  chip = 0,
): EdgeRoute {
  const gapX = Math.max(t.x - (s.x + s.w), s.x - (t.x + t.w));
  const gapY = Math.max(t.y - (s.y + s.h), s.y - (t.y + t.h));
  const dx = t.x + t.w / 2 - (s.x + s.w / 2);
  const dy = t.y + t.h / 2 - (s.y + s.h / 2);
  const horizontal =
    gapX >= 2 * CLEAR ? true : gapY >= 2 * CLEAR ? false : Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const right = dx >= 0;
    const x1 = right ? s.x + s.w : s.x;
    const x2 = right ? t.x : t.x + t.w;
    const y1 = s.y + s.h / 2;
    const y2 = t.y + t.h / 2;
    const mid = bestMid(x1, x2, (m) => {
      const segs: Seg[] = [
        { at: y1, from: x1, to: m, alongX: true },
        { at: m, from: y1, to: y2, alongX: false },
        { at: y2, from: m, to: x2, alongX: true },
      ];
      const label =
        chip > 0 ? { x: m - chip / 2, y: (y1 + y2) / 2 - CHIP_H / 2, w: chip, h: CHIP_H } : null;
      return penalty(segs, label, obstacles);
    });
    return { from: right ? "r" : "l", to: right ? "l" : "r", horizontal: true, mid };
  }

  const down = dy >= 0;
  const y1 = down ? s.y + s.h : s.y;
  const y2 = down ? t.y : t.y + t.h;
  const x1 = s.x + s.w / 2;
  const x2 = t.x + t.w / 2;
  const mid = bestMid(y1, y2, (m) => {
    const segs: Seg[] = [
      { at: x1, from: y1, to: m, alongX: false },
      { at: m, from: x1, to: x2, alongX: true },
      { at: x2, from: m, to: y2, alongX: false },
    ];
    const label =
      chip > 0 ? { x: (x1 + x2) / 2 - chip / 2, y: m - CHIP_H / 2, w: chip, h: CHIP_H } : null;
    return penalty(segs, label, obstacles);
  });
  return { from: down ? "b" : "t", to: down ? "t" : "b", horizontal: false, mid };
}

/**
 * An L-shaped route from `s` into the top or bottom of `t`, or null when the
 * geometry doesn't allow one or it would cross something.
 */
export function routeCorner(s: Rect, t: Rect, obstacles: readonly Obstacle[]): EdgeRoute | null {
  const y1 = s.y + s.h / 2;
  const x2 = t.x + t.w / 2;
  const right = x2 >= s.x + s.w + CLEAR;
  if (!right && x2 > s.x - CLEAR) return null;
  const down = y1 <= t.y - CLEAR;
  if (!down && y1 < t.y + t.h + CLEAR) return null;
  const x1 = right ? s.x + s.w : s.x;
  const y2 = down ? t.y : t.y + t.h;
  const segs: Seg[] = [
    { at: y1, from: x1, to: x2, alongX: true },
    { at: x2, from: y1, to: y2, alongX: false },
  ];
  if (obstacles.some((o) => segs.some((seg) => segmentHits(seg, o)))) return null;
  return { from: right ? "r" : "l", to: down ? "t" : "b", horizontal: true, mid: x2, corner: true };
}

/** One routed edge, as `untangle` sees it. */
export interface RoutedEdge {
  source: string;
  target: string;
  s: Rect;
  t: Rect;
  route: EdgeRoute;
  /** An arrowhead is drawn at the target end. */
  headAtTarget: boolean;
}

/**
 * An arrow arriving on the same side of a box that another edge leaves from
 * reads as one two-way line. Where that happens, bring the arrival in from
 * the top or bottom instead (an L), if that path is clear.
 */
export function untangle(
  edges: RoutedEdge[],
  obstaclesFor: (source: string, target: string) => Obstacle[],
): void {
  const departs = new Set<string>();
  for (const e of edges) {
    departs.add(`${e.source}:${e.route.from}`);
    if (!e.headAtTarget) departs.add(`${e.target}:${e.route.to}`);
  }
  for (const e of edges) {
    if (!e.headAtTarget || e.route.corner || !departs.has(`${e.target}:${e.route.to}`)) continue;
    const corner = routeCorner(e.s, e.t, obstaclesFor(e.source, e.target));
    if (corner) e.route = corner;
  }
}

function penalty(segs: Seg[], label: Rect | null, obstacles: readonly Obstacle[]): number {
  let cost = 0;
  const bend = segs[1]!;
  for (const o of obstacles) {
    if (segs.some((s) => segmentHits(s, o))) cost += o.cost;
    else if (o.cost >= BOX_COST && besideBox(bend, o)) cost += 5;
    if (label && rectsOverlap(label, o)) cost += o.cost / 4;
  }
  return cost;
}

/**
 * Where the bend goes between `a1` and `a2`: the middle of the span when that
 * is as clear as anywhere, else the middle of the clearest stretch nearest
 * to it (so a fan-out from one box shares a single trunk).
 */
function bestMid(a1: number, a2: number, cost: (m: number) => number): number {
  const center = (a1 + a2) / 2;
  const lo = Math.min(a1, a2) + CLEAR;
  const hi = Math.max(a1, a2) - CLEAR;
  if (hi <= lo) return center;
  const centerCost = cost(center);
  if (centerCost === 0) return center;
  const n = Math.max(1, Math.round((hi - lo) / STEP));
  const ms = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const cs = ms.map(cost);
  const min = Math.min(...cs);
  if (centerCost <= min) return center;
  let best = center;
  let bestDist = Infinity;
  for (let i = 0; i < ms.length; i++) {
    if (cs[i]! > min) continue;
    let j = i;
    while (j + 1 < ms.length && cs[j + 1]! <= min) j++;
    const runMid = (ms[i]! + ms[j]!) / 2;
    const dist = center < ms[i]! ? ms[i]! - center : center > ms[j]! ? center - ms[j]! : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = runMid;
    }
    i = j;
  }
  return best;
}

/** A routed edge as `separateBends` sees it. */
export interface Bend {
  /** Its route; `mid` is moved in place. */
  route: EdgeRoute;
  /**
   * Where the pieces either side of the bend run, across the bend: for a
   * left/right route the y of the piece left of the bend and of the piece
   * right of it; for a top/bottom route the x above and below.
   */
  near: number;
  far: number;
  /** The two handles it uses (e.g. "api:r"): edges sharing one keep a shared trunk. */
  handles: [string, string];
}

/** The `Bend` of a route between two boxes, keyed by their ids for bus detection. */
export function bendOf(
  route: EdgeRoute,
  s: Rect,
  t: Rect,
  sourceId: string,
  targetId: string,
): Bend {
  const across = (r: Rect) => (route.horizontal ? r.y + r.h / 2 : r.x + r.w / 2);
  const forward = route.from === "r" || route.from === "b";
  return {
    route,
    near: forward ? across(s) : across(t),
    far: forward ? across(t) : across(s),
    handles: [`${sourceId}:${route.from}`, `${targetId}:${route.to}`],
  };
}

/**
 * Spread apart bends that landed in the same channel, so two edges' middle
 * segments never merge into one ambiguous line. Edges sharing a handle stay
 * together (a bus reads fine); the rest get their own track, 10px apart, in
 * the order that crosses least.
 */
export function separateBends(bends: readonly Bend[], spacing = 10): void {
  for (const horizontal of [true, false]) {
    // A straight edge has no bend to separate (and must not glue buses together).
    const list = bends
      .filter((b) => b.route.horizontal === horizontal && !b.route.corner && b.near !== b.far)
      .sort((a, b) => a.route.mid - b.route.mid);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i]!.route.mid - list[i - 1]!.route.mid < spacing) continue;
      spread(list.slice(start, i), spacing);
      start = i;
    }
  }
}

function spread(cluster: Bend[], spacing: number) {
  if (cluster.length < 2) return;
  // Bus members (a shared handle) form one unit.
  const up = cluster.map((_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i]!)));
  for (let i = 0; i < cluster.length; i++)
    for (let j = i + 1; j < cluster.length; j++)
      if (cluster[i]!.handles.some((h) => cluster[j]!.handles.includes(h))) up[find(j)] = find(i);
  const byRoot = new Map<number, Bend[]>();
  cluster.forEach((b, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), b]));
  const units = [...byRoot.values()];
  if (units.length < 2) return;

  const lo = (b: Bend) => Math.min(b.near, b.far);
  const hi = (b: Bend) => Math.max(b.near, b.far);
  const touching = (a: Bend[], b: Bend[]) =>
    a.some((x) => b.some((y) => lo(x) <= hi(y) + 2 && lo(y) <= hi(x) + 2));
  let clash = false;
  for (let i = 0; i < units.length && !clash; i++)
    for (let j = i + 1; j < units.length && !clash; j++) clash = touching(units[i]!, units[j]!);
  if (!clash) return;

  // With unit a before unit b along the channel, a's far piece crosses b's
  // bend if it runs strictly inside b's span, and b's near piece likewise a's.
  const inside = (v: number, b: Bend) => v > lo(b) && v < hi(b);
  const cost = (a: Bend[], b: Bend[]) => {
    let c = 0;
    for (const x of a) for (const y of b) c += Number(inside(x.far, y)) + Number(inside(y.near, x));
    return c;
  };
  let order = units;
  if (units.length <= 6) {
    let best = Infinity;
    for (const perm of permutations(units)) {
      let c = 0;
      for (let i = 0; i < perm.length; i++)
        for (let j = i + 1; j < perm.length; j++) c += cost(perm[i]!, perm[j]!);
      if (c < best) {
        best = c;
        order = perm;
      }
    }
  }
  const center = cluster.reduce((acc, b) => acc + b.route.mid, 0) / cluster.length;
  order.forEach((unit, k) => {
    const mid = center + (k - (order.length - 1) / 2) * spacing;
    for (const b of unit) b.route.mid = mid;
  });
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i]!, ...p];
  }
}
