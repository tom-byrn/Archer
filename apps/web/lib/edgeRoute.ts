/**
 * Orthogonal edge routing shared by the canvas (`toFlow` → `ArchEdgeComponent`)
 * and the SVG renderer (`svg.ts`), so both draw an edge the same way.
 *
 * Which edges there are comes first (`groupEdges`): a connection into a
 * collapsed container is drawn to the container, and every connection
 * between the same two boxes that way becomes one edge.
 *
 * Every edge is three straight pieces: out of one side of the source, one
 * bend segment, into the facing side of the target. Boxes side by side
 * connect left/right, stacked boxes top/bottom. The bend goes where the whole
 * path (and its label chip) clears the other boxes — the auto-layout leaves
 * free lanes for long edges, and this is what uses them — preferring the
 * middle of the span.
 */

import { pathToString, type Arrow, type ConnectionNode } from "@archer/lang";

/** One drawn edge: a connection, or several summed up between the same two boxes. */
export interface EdgeGroup {
  /** The boxes it joins (a connection's end, or the collapsed container drawn for it). */
  source: string;
  target: string;
  /** The connections it draws, as indices into `doc.connections`, in document order. */
  indices: number[];
  /** Heads as drawn: `->` at the target, `<->` both ends, `--` none. */
  arrow: Arrow;
  /** Chip: a lone connection's type and label; a summary's type when all share one. */
  type?: string;
  label?: string;
  /** Payload blocks on a lone connection (a summary shows none). */
  payloads: number;
  /** An end was drawn as a collapsed ancestor rather than the component itself. */
  summary: boolean;
}

/**
 * The edges to draw between visible boxes. `drawnAs` maps a connection's end
 * (given the path at its other end) to the box drawn for it: itself, its
 * collapsed ancestor, or a stand-in outside a drilled-into view — undefined
 * when that end isn't drawn at all.
 *
 * Connections between two boxes that are each drawn as themselves keep an
 * edge apiece, exactly as written. Once an end is folded into a collapsed
 * container, everything between the same two boxes (either direction) is one
 * edge: its heads point wherever any of them do, and its chip gives the count
 * — eleven parallel lines out of a collapsed worker say nothing that one line
 * marked ×11 doesn't. A connection inside a single collapsed box isn't drawn.
 */
export function groupEdges(
  connections: readonly ConnectionNode[],
  drawnAs: (path: string, other: string) => string | undefined,
): EdgeGroup[] {
  interface Member {
    i: number;
    s: string;
    t: string;
    direct: boolean;
  }
  const buckets = new Map<string, Member[]>();
  connections.forEach((c, i) => {
    const sp = pathToString(c.source);
    const tp = pathToString(c.target);
    const s = drawnAs(sp, tp);
    const t = drawnAs(tp, sp);
    if (s === undefined || t === undefined || s === t) return;
    const key = s < t ? `${s}\n${t}` : `${t}\n${s}`;
    const list = buckets.get(key) ?? [];
    buckets.set(key, list);
    list.push({ i, s, t, direct: s === sp && t === tp });
  });

  const out: EdgeGroup[] = [];
  for (const members of buckets.values()) {
    if (members.every((m) => m.direct)) {
      for (const m of members) {
        const c = connections[m.i]!;
        out.push({
          source: m.s,
          target: m.t,
          indices: [m.i],
          arrow: c.arrow,
          ...(c.type !== undefined ? { type: c.type } : {}),
          ...(c.label !== undefined ? { label: c.label } : {}),
          payloads: c.payloads.length,
          summary: false,
        });
      }
      continue;
    }
    const first = members[0]!;
    if (members.length === 1) {
      const c = connections[first.i]!;
      out.push({
        source: first.s,
        target: first.t,
        indices: [first.i],
        arrow: c.arrow,
        ...(c.type !== undefined ? { type: c.type } : {}),
        ...(c.label !== undefined ? { label: c.label } : {}),
        payloads: c.payloads.length,
        summary: true,
      });
      continue;
    }
    // Heads: where any member points, seen from the first member's direction.
    let forward = false;
    let backward = false;
    for (const m of members) {
      const arrow = connections[m.i]!.arrow;
      if (arrow === "<->") forward = backward = true;
      else if (arrow === "->") {
        if (m.s === first.s) forward = true;
        else backward = true;
      }
    }
    const types = new Set(members.map((m) => connections[m.i]!.type));
    const type = types.size === 1 ? [...types][0] : undefined;
    const [source, target] = backward && !forward ? [first.t, first.s] : [first.s, first.t];
    out.push({
      source,
      target,
      indices: members.map((m) => m.i),
      arrow: forward && backward ? "<->" : forward || backward ? "->" : "--",
      ...(type !== undefined ? { type } : {}),
      payloads: 0,
      summary: true,
    });
  }
  return out.sort((a, b) => a.indices[0]! - b.indices[0]!);
}

/** The text on an edge's chip: type, then a lone connection's label or a summary's count. */
export const chipText = (g: Pick<EdgeGroup, "type" | "label" | "indices">): string =>
  g.indices.length > 1
    ? [g.type, `×${g.indices.length}`].filter((p) => p !== undefined).join(" ")
    : [g.type, g.label].filter((p) => p !== undefined).join(" · ");

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
export const BOX_COST = 1000;
export const CHIP_H = 18;

/** Approximate rendered width (px) of an edge's label chip (0: no chip). */
export const chipWidth = (g: Pick<EdgeGroup, "type" | "label" | "indices" | "payloads">): number => {
  const text = chipText(g);
  const payloads = g.indices.length > 1 ? 0 : g.payloads;
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
    const mid = bendAt(
      right ? s.x + s.w : s.x,
      right ? t.x : t.x + t.w,
      s.y + s.h / 2,
      t.y + t.h / 2,
      obstacles,
      chip,
      CHIP_H,
    );
    return { from: right ? "r" : "l", to: right ? "l" : "r", horizontal: true, mid };
  }
  // A top/bottom route is a left/right one with x and y swapped.
  const down = dy >= 0;
  const mid = bendAt(
    down ? s.y + s.h : s.y,
    down ? t.y : t.y + t.h,
    s.x + s.w / 2,
    t.x + t.w / 2,
    obstacles.map((o) => ({ x: o.y, y: o.x, w: o.h, h: o.w, cost: o.cost })),
    CHIP_H,
    chip,
  );
  return { from: down ? "b" : "t", to: down ? "t" : "b", horizontal: false, mid };
}

/**
 * Where the bend of a left/right route goes: it leaves at x = a1 on row b1
 * and arrives at x = a2 on row b2. A bend at m costs the obstacles its three
 * pieces cross, those its label chip (centred on the bend) overlaps, and a
 * little for squeezing right past a box. That cost only changes at obstacle
 * edges, so it is swept exactly. The answer is the middle of the span when
 * that is as clear as anywhere, else the middle of the clearest stretch
 * nearest to it — so a fan-out from one box keeps a single trunk.
 */
function bendAt(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  obstacles: readonly Obstacle[],
  chipAlong: number,
  chipAcross: number,
): number {
  const center = (a1 + a2) / 2;
  const lo = Math.min(a1, a2) + CLEAR;
  const hi = Math.max(a1, a2) - CLEAR;
  if (hi <= lo) return center;
  const forward = a2 >= a1;
  const bLo = Math.min(b1, b2);
  const bHi = Math.max(b1, b2);
  const chipMid = (b1 + b2) / 2;

  // Each obstacle adds its cost for bends strictly inside some (from, to).
  const spans: [number, number, number][] = [];
  const add = (from: number, to: number, cost: number) => {
    const f = Math.max(from, lo);
    const e = Math.min(to, hi);
    if (f < e) spans.push([f, e, cost]);
  };
  for (const o of obstacles) {
    const x0 = o.x - MARGIN;
    const x1 = o.x + o.w + MARGIN;
    const y0 = o.y - MARGIN;
    const y1 = o.y + o.h + MARGIN;
    // The piece from a1 to the bend, along row b1, and from the bend to a2.
    if (b1 > y0 && b1 < y1) {
      if (forward) {
        if (x1 > a1) add(x0, Infinity, o.cost);
      } else if (x0 < a1) add(-Infinity, x1, o.cost);
    }
    if (b2 > y0 && b2 < y1) {
      if (forward) {
        if (x0 < a2) add(-Infinity, x1, o.cost);
      } else if (x1 > a2) add(x0, Infinity, o.cost);
    }
    // The bend itself, or a bend squeezed right beside a box.
    if (bHi > y0 && bLo < y1) add(x0, x1, o.cost);
    else if (o.cost >= BOX_COST && bHi + 2 * CLEAR > o.y && bLo - 2 * CLEAR < o.y + o.h)
      add(x0, x1, 5);
    if (chipAlong > 0 && chipMid + chipAcross / 2 > o.y && chipMid - chipAcross / 2 < o.y + o.h)
      add(o.x - chipAlong / 2, o.x + o.w + chipAlong / 2, o.cost / 4);
  }
  const costAt = (m: number) =>
    spans.reduce((acc, [f, e, c]) => (f < m && m < e ? acc + c : acc), 0);
  const centerCost = costAt(center);
  if (centerCost === 0) return center;

  // Piecewise-constant cost over [lo, hi]: one value per stretch between edges.
  const events: [number, number][] = [];
  for (const [f, e, c] of spans) events.push([f, c], [e, -c]);
  events.sort((p, q) => p[0] - q[0]);
  const cuts = [...new Set([lo, ...events.map((ev) => ev[0]), hi])].sort((p, q) => p - q);
  const stretches: { from: number; to: number; cost: number }[] = [];
  let running = 0;
  let k = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    while (k < events.length && events[k]![0] <= cuts[i]!) running += events[k++]![1];
    stretches.push({ from: cuts[i]!, to: cuts[i + 1]!, cost: running });
  }
  const min = Math.min(centerCost, ...stretches.map((st) => st.cost));
  if (centerCost <= min) return center;
  let best = center;
  let bestDist = Infinity;
  for (let i = 0; i < stretches.length; i++) {
    if (stretches[i]!.cost > min) continue;
    let j = i;
    while (j + 1 < stretches.length && stretches[j + 1]!.cost <= min) j++;
    const from = stretches[i]!.from;
    const to = stretches[j]!.to;
    const dist = center < from ? from - center : center > to ? center - to : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = (from + to) / 2;
    }
    i = j;
  }
  return best;
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

/* ---------------------------------------------------------------- chips */

/** One straight piece of a drawn edge (absolute px). */
export interface Piece {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The pieces of an edge from handle (sx, sy) to handle (tx, ty), source
 * first: three for a left/right or top/bottom route (the middle one is the
 * bend, at `mid`, or halfway when that's unset), two for an L. The canvas
 * redraws these live from its handles; `routePieces` is the same from boxes.
 */
export function piecesBetween(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  shape: { horizontal: boolean; mid?: number; corner?: boolean },
): Piece[] {
  if (shape.corner)
    return [
      { x1: sx, y1: sy, x2: tx, y2: sy },
      { x1: tx, y1: sy, x2: tx, y2: ty },
    ];
  if (shape.horizontal) {
    const m = shape.mid ?? (sx + tx) / 2;
    return [
      { x1: sx, y1: sy, x2: m, y2: sy },
      { x1: m, y1: sy, x2: m, y2: ty },
      { x1: m, y1: ty, x2: tx, y2: ty },
    ];
  }
  const m = shape.mid ?? (sy + ty) / 2;
  return [
    { x1: sx, y1: sy, x2: sx, y2: m },
    { x1: sx, y1: m, x2: tx, y2: m },
    { x1: tx, y1: m, x2: tx, y2: ty },
  ];
}

/** Where a side's handle sits: the middle of that side. */
const handleAt = (r: Rect, side: Side): [number, number] =>
  side === "l"
    ? [r.x, r.y + r.h / 2]
    : side === "r"
      ? [r.x + r.w, r.y + r.h / 2]
      : side === "t"
        ? [r.x + r.w / 2, r.y]
        : [r.x + r.w / 2, r.y + r.h];

/** The pieces of a routed edge between two boxes. */
export function routePieces(route: EdgeRoute, s: Rect, t: Rect): Piece[] {
  const [sx, sy] = handleAt(s, route.from);
  const [tx, ty] = handleAt(t, route.to);
  return piecesBetween(sx, sy, tx, ty, route);
}

/** Where an edge's chip sits: `t` of the way along one of its pieces. */
export interface ChipSpot {
  piece: number;
  t: number;
}

/** The centre of a chip at `spot` (undefined when the pieces don't have that one). */
export function chipPoint(pieces: readonly Piece[], spot: ChipSpot): { x: number; y: number } | undefined {
  const p = pieces[spot.piece];
  if (!p) return undefined;
  return { x: p.x1 + (p.x2 - p.x1) * spot.t, y: p.y1 + (p.y2 - p.y1) * spot.t };
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Does a piece run through the rect? */
function crosses(p: Piece, r: Rect): boolean {
  if (p.y1 === p.y2) {
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    return p.y1 > r.y && p.y1 < r.y + r.h && hi > r.x && lo < r.x + r.w;
  }
  const lo = Math.min(p.y1, p.y2);
  const hi = Math.max(p.y1, p.y2);
  return p.x1 > r.x && p.x1 < r.x + r.w && hi > r.y && lo < r.y + r.h;
}

/** Where along a run of pieces a chip may sit, middle first. */
const CHIP_TS = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];

/**
 * Where each edge's label chip goes (null: it has none). Candidates are points
 * along its runs of straight line (collinear pieces count as one, so a straight
 * edge is one run however its bend was placed). A chip mustn't cover a box,
 * another chip or a plane's title bar, and shouldn't cover another edge's
 * line: on a trunk several edges share, each chip moves out onto a stretch of
 * its own. Among what's clear, the middle of the bend wins, then the middle of
 * a run. The widest chips go first, while there's the most room.
 */
export function placeChips(
  edges: readonly { pieces: readonly Piece[]; width: number }[],
  boxes: readonly Rect[],
  bars: readonly Rect[] = [],
): (ChipSpot | null)[] {
  const spots: (ChipSpot | null)[] = edges.map(() => null);
  const placed: Rect[] = [];
  const order = edges
    .map((e, i) => i)
    .filter((i) => edges[i]!.width > 0)
    .sort((a, b) => edges[b]!.width - edges[a]!.width || a - b);
  const len = (p: Piece) => Math.abs(p.x2 - p.x1) + Math.abs(p.y2 - p.y1);
  for (const i of order) {
    const { pieces, width } = edges[i]!;
    const bent = pieces.length === 3 && len(pieces[1]!) >= 1;
    // Runs: consecutive pieces on one line (zero-length ones join either side).
    const runs: number[][] = [];
    pieces.forEach((p, k) => {
      if (len(p) < 1) return;
      const last = runs[runs.length - 1];
      const prev = last && pieces[last[last.length - 1]!]!;
      const along = p.y1 === p.y2;
      const same = prev && (prev.y1 === prev.y2) === along && (along ? prev.y1 === p.y1 : prev.x1 === p.x1);
      if (same) last.push(k);
      else runs.push([k]);
    });
    let best = null as ChipSpot | null;
    let bestCost = Infinity;
    for (const run of runs) {
      const total = run.reduce((n, k) => n + len(pieces[k]!), 0);
      const first = pieces[run[0]!]!;
      const along = first.y1 === first.y2;
      const extent = along ? width : CHIP_H;
      for (const t of CHIP_TS) {
        // Keep the chip on the run, except at its middle (a short run).
        if (t !== 0.5 && Math.min(t, 1 - t) * total < extent / 2 + 4) continue;
        // The point t of the way along the run, as a piece and a fraction of it.
        let d = t * total;
        let k = run[0]!;
        for (const j of run) {
          k = j;
          if (d <= len(pieces[j]!)) break;
          d -= len(pieces[j]!);
        }
        const spot = { piece: k, t: Math.min(1, d / len(pieces[k]!)) };
        const { x, y } = chipPoint(pieces, spot)!;
        const r = { x: x - width / 2, y: y - CHIP_H / 2, w: width, h: CHIP_H };
        const pad = { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 };
        let cost = (bent && !run.includes(1) ? 6 : 0) + Math.abs(t - 0.5) * 8;
        cost += Math.max(0, extent - total) / 2;
        for (const b of boxes) if (hits(r, b)) cost += BOX_COST;
        for (const c of placed) if (hits(pad, c)) cost += 800;
        for (const b of bars) if (hits(r, b)) cost += 150;
        edges.forEach((other, j) => {
          if (j === i) return;
          for (const q of other.pieces) if (crosses(q, r)) cost += 40;
        });
        if (cost < bestCost) {
          bestCost = cost;
          best = spot;
        }
      }
    }
    spots[i] = best;
    const at = best ? chipPoint(pieces, best) : undefined;
    if (at) placed.push({ x: at.x - width / 2, y: at.y - CHIP_H / 2, w: width, h: CHIP_H });
  }
  return spots;
}
