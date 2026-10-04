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

export interface Point {
  x: number;
  y: number;
}

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
   * the target's top or bottom (`from` is l/r, `to` is t/b), or with
   * `horizontal` false out of its top or bottom into the target's side
   * (`from` t/b, `to` l/r). `mid` unused.
   */
  corner?: boolean;
  /**
   * A detour instead (`detour`): the whole path, from the middle of the
   * source's `from` side to the middle of the target's `to` side, for an edge
   * no simpler shape gets past the boxes in its way. `mid` unused.
   */
  points?: Point[];
}

/** Bends stay at least this far (px) from the boxes they leave and enter. */
const CLEAR = 20;
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
 * nearest to it — so the edges fanning out of one box bend in one place,
 * which `separateBends` then spreads into neat parallel tracks.
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
 * An L-shaped route from a side of `s` into the top or bottom of `t` (or,
 * `vertical`, from the top or bottom of `s` into a side of `t`), or null
 * when the geometry doesn't allow one or it would cross something.
 */
export function routeCorner(
  s: Rect,
  t: Rect,
  obstacles: readonly Obstacle[],
  vertical = false,
): EdgeRoute | null {
  if (vertical) {
    // A vertical-first L is a horizontal-first one with x and y swapped.
    const flip = <R extends Rect>(r: R): R => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w });
    const r = routeCorner(flip(s), flip(t), obstacles.map(flip));
    const side = { r: "b", l: "t", t: "l", b: "r" } as const;
    return r && { from: side[r.from], to: side[r.to], horizontal: false, mid: r.mid, corner: true };
  }
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

/**
 * A diagonal edge (its boxes overlap neither across nor down) takes an L
 * where that is clear of boxes and plane titles and both sides it would use
 * are free of other edges: one bend is easier to follow than two, but not
 * when it runs alongside another line. It leaves the way its three-piece
 * route did if it can, else the other way.
 */
export function preferCorners(
  edges: RoutedEdge[],
  obstaclesFor: (source: string, target: string) => Obstacle[],
): void {
  const used = new Map<string, number>();
  const use = (e: RoutedEdge, by: number) => {
    for (const k of [`${e.source}:${e.route.from}`, `${e.target}:${e.route.to}`])
      used.set(k, (used.get(k) ?? 0) + by);
  };
  edges.forEach((e) => use(e, 1));
  const apart = (a0: number, a1: number, b0: number, b1: number) => a1 <= b0 || b1 <= a0;
  for (const e of edges) {
    if (e.route.corner) continue;
    if (
      !apart(e.s.x, e.s.x + e.s.w, e.t.x, e.t.x + e.t.w) ||
      !apart(e.s.y, e.s.y + e.s.h, e.t.y, e.t.y + e.t.h)
    )
      continue;
    use(e, -1);
    const free = (r: EdgeRoute | null) =>
      r !== null && !used.get(`${e.source}:${r.from}`) && !used.get(`${e.target}:${r.to}`);
    const hard = obstaclesFor(e.source, e.target).filter((o) => o.cost >= BOX_COST / 4);
    const sideways = e.route.horizontal;
    const corner = [
      routeCorner(e.s, e.t, hard, !sideways),
      routeCorner(e.s, e.t, hard, sideways),
    ].find(free);
    if (corner) e.route = corner;
    use(e, 1);
  }
}

/** The pieces of a route between the middles of its sides (ports aside). */
function pieces(route: EdgeRoute, s: Rect, t: Rect): Seg[] {
  const at = (r: Rect, side: Side): Point =>
    side === "l"
      ? { x: r.x, y: r.y + r.h / 2 }
      : side === "r"
        ? { x: r.x + r.w, y: r.y + r.h / 2 }
        : side === "t"
          ? { x: r.x + r.w / 2, y: r.y }
          : { x: r.x + r.w / 2, y: r.y + r.h };
  const a = at(s, route.from);
  const b = at(t, route.to);
  const pts = route.points
    ? route.points
    : route.corner
      ? route.horizontal
        ? [a, { x: b.x, y: a.y }, b]
        : [a, { x: a.x, y: b.y }, b]
      : route.horizontal
        ? [a, { x: route.mid, y: a.y }, { x: route.mid, y: b.y }, b]
        : [a, { x: a.x, y: route.mid }, { x: b.x, y: route.mid }, b];
  const out: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, q] = [pts[i]!, pts[i + 1]!];
    if (p.y === q.y) out.push({ at: p.y, from: p.x, to: q.x, alongX: true });
    else out.push({ at: p.x, from: p.y, to: q.y, alongX: false });
  }
  return out;
}

/** Bends cost this much path length (px) in a detour: fewer bends read easier. */
const BEND = 80;

/**
 * A path around the boxes from a side of `s` to a side of `t`: the shortest
 * with bends counted dear, on lanes 20px clear of every box and plane title
 * (an orthogonal visibility grid, searched with Dijkstra). Null when there is
 * none.
 */
export function routeAround(s: Rect, t: Rect, obstacles: readonly Obstacle[]): EdgeRoute | null {
  const walls = [...obstacles.filter((o) => o.cost >= BOX_COST / 4), s, t].map((r) => ({
    x0: r.x - MARGIN,
    x1: r.x + r.w + MARGIN,
    y0: r.y - MARGIN,
    y1: r.y + r.h + MARGIN,
  }));
  const blocked = (x: number, y: number) =>
    walls.some((w) => x > w.x0 && x < w.x1 && y > w.y0 && y < w.y1);
  const sides: Side[] = ["t", "r", "b", "l"];
  const stub = (r: Rect, side: Side) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return side === "l"
      ? { at: { x: r.x, y: cy }, out: { x: r.x - CLEAR, y: cy } }
      : side === "r"
        ? { at: { x: r.x + r.w, y: cy }, out: { x: r.x + r.w + CLEAR, y: cy } }
        : side === "t"
          ? { at: { x: cx, y: r.y }, out: { x: cx, y: r.y - CLEAR } }
          : { at: { x: cx, y: r.y + r.h }, out: { x: cx, y: r.y + r.h + CLEAR } };
  };
  // Lanes: 10px outside every wall (20px from its box), through each stub,
  // and down the middle of every gap between those.
  const lanes = (base: number[]) => {
    const sorted = [...new Set(base.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
    const mids = sorted.slice(1).map((v, i) => (v + sorted[i]!) / 2);
    return [...new Set([...sorted, ...mids])].sort((a, b) => a - b);
  };
  const stubs = [s, t].flatMap((r) => sides.map((side) => stub(r, side).out));
  const xs = lanes([
    ...walls.flatMap((w) => [w.x0 - MARGIN, w.x1 + MARGIN]),
    ...stubs.map((p) => p.x),
  ]);
  const ys = lanes([
    ...walls.flatMap((w) => [w.y0 - MARGIN, w.y1 + MARGIN]),
    ...stubs.map((p) => p.y),
  ]);
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const round = (v: number) => Math.round(v * 2) / 2;

  // Dijkstra over (grid point, heading). Headings: 0 right, 1 down, 2 left, 3 up.
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const heading: Record<Side, number> = { r: 0, b: 1, l: 2, t: 3 };
  const key = (i: number, j: number, d: number) => (i * ys.length + j) * 4 + d;
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap: [number, number][] = [];
  const push = (cost: number, k: number, from: number) => {
    if ((dist.get(k) ?? Infinity) <= cost) return;
    dist.set(k, cost);
    prev.set(k, from);
    heap.push([cost, k]);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p]![0] <= heap[n]![0]) break;
      [heap[p], heap[n]] = [heap[n]!, heap[p]!];
      n = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let n = 0;
      for (;;) {
        const [l, r] = [2 * n + 1, 2 * n + 2];
        let m = n;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n]!, heap[m]!];
        n = m;
      }
    }
    return top;
  };
  const START = -1;
  const starts = new Map<number, Side>();
  for (const side of sides) {
    const { out } = stub(s, side);
    const i = xi.get(round(out.x));
    const j = yi.get(round(out.y));
    if (i === undefined || j === undefined || blocked(out.x, out.y)) continue;
    const k = key(i, j, heading[side]);
    starts.set(k, side);
    push(CLEAR, k, START);
  }
  const goals = new Map<number, Side>();
  for (const side of sides) {
    const { out } = stub(t, side);
    const i = xi.get(round(out.x));
    const j = yi.get(round(out.y));
    if (i === undefined || j === undefined || blocked(out.x, out.y)) continue;
    // Arriving here heading into the side, i.e. away from where `side` faces.
    goals.set(key(i, j, (heading[side] + 2) % 4), side);
  }
  let goal: number | undefined;
  while (heap.length > 0) {
    const [cost, k] = pop();
    if (cost > (dist.get(k) ?? Infinity)) continue;
    if (goals.has(k)) {
      goal = k;
      break;
    }
    const d = k % 4;
    const cell = (k - d) / 4;
    const j = cell % ys.length;
    const i = (cell - j) / ys.length;
    for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
      if (nd !== d) {
        // Turning: arriving at a goal stub in a new heading counts too.
        push(cost + BEND, key(i, j, nd), k);
        continue;
      }
      const ni = i + DX[d]!;
      const nj = j + DY[d]!;
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
      const [x0, y0, x1, y1] = [xs[i]!, ys[j]!, xs[ni]!, ys[nj]!];
      if (blocked(x1, y1) || blocked((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      push(cost + Math.abs(x1 - x0) + Math.abs(y1 - y0), key(ni, nj, d), k);
    }
  }
  if (goal === undefined) return null;
  const cells: Point[] = [];
  let k = goal;
  let first = goal;
  while (k !== START) {
    const d = k % 4;
    const cell = (k - d) / 4;
    const j = cell % ys.length;
    const i = (cell - j) / ys.length;
    const p = { x: xs[i]!, y: ys[j]! };
    const last = cells[cells.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) cells.push(p);
    first = k;
    k = prev.get(k)!;
  }
  cells.reverse();
  const from = starts.get(first)!;
  const to = goals.get(goal)!;
  const path = [stub(s, from).at, ...cells, stub(t, to).at];
  // Keep only the corners.
  const points = path.filter((p, n) => {
    if (n === 0 || n === path.length - 1) return true;
    const [a, b] = [path[n - 1]!, path[n + 1]!];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
  return { from, to, horizontal: from === "l" || from === "r", mid: 0, points };
}

/**
 * An edge whose route still crosses a box (one in its row, say, that no
 * bend can get around) takes a detour around everything instead
 * (`routeAround`), if there is one.
 */
export function detour(
  edges: RoutedEdge[],
  obstaclesFor: (source: string, target: string) => Obstacle[],
): void {
  for (const e of edges) {
    const obstacles = obstaclesFor(e.source, e.target);
    const boxes = obstacles.filter((o) => o.cost >= BOX_COST);
    if (!pieces(e.route, e.s, e.t).some((seg) => boxes.some((b) => segmentHits(seg, b)))) continue;
    const around = routeAround(e.s, e.t, obstacles);
    if (around) e.route = around;
  }
}

/** `p` moved `by` px in from `side` of a box (towards its middle). */
export const inward = (p: Point, side: Side, by: number): Point =>
  side === "l"
    ? { x: p.x + by, y: p.y }
    : side === "r"
      ? { x: p.x - by, y: p.y }
      : side === "t"
        ? { x: p.x, y: p.y + by }
        : { x: p.x, y: p.y - by };

/**
 * A detour's points with its ports applied: each end slides `by` px along
 * its side, and so does the piece leaving it, up to its first turn.
 */
export function detourPoints(route: EdgeRoute, ports: Ports): Point[] {
  const pts = route.points!.map((p) => ({ ...p }));
  const slide = (order: Point[], side: Side, by: number) => {
    if (by === 0) return;
    const alongY = side === "l" || side === "r";
    order[0]![alongY ? "y" : "x"] += by;
    for (let n = 1; n < order.length; n++) {
      // Still on the piece that leaves the side square on (perpendicular to it).
      const leaving = alongY
        ? order[n]!.y === order[n - 1]!.y - by
        : order[n]!.x === order[n - 1]!.x - by;
      if (!leaving) break;
      order[n]![alongY ? "y" : "x"] += by;
    }
  };
  slide(pts, route.from, ports.from);
  slide([...pts].reverse(), route.to, ports.to);
  return pts;
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

/** Ports on one side of a box sit this far apart (px): room for an arrowhead, or a label chip, each. */
export const PORT_GAP = 20;
/** Ports keep this far (px) from a side's corners. */
const PORT_PAD = 12;

/** Where an edge meets its two boxes: offsets (px) along each side from its middle. */
export interface Ports {
  from: number;
  to: number;
}

/**
 * Give every edge its own port on each box. Lines that leave from (or arrive
 * at) one point merge into a trunk, and then nobody can tell which line goes
 * where, or that two opposite arrows aren't one two-way line. So the edges on
 * a side spread out along it, `gap` apart, in the order of where each one goes
 * (the other box), which keeps them from crossing as they leave; parallel
 * edges between the same two boxes get the same order at both ends.
 *
 * An edge whose boxes overlap across its direction runs straight when it can
 * (and the line stays clear): two lone ports meet in the middle of the
 * smaller box, and the ports on a side slide to meet their partners on the
 * other boxes where that keeps their order and spacing.
 */
export function assignPorts(
  edges: readonly RoutedEdge[],
  obstaclesFor: (source: string, target: string) => Obstacle[],
  gap = PORT_GAP,
): Ports[] {
  const ports: Ports[] = edges.map(() => ({ from: 0, to: 0 }));
  const across = (side: Side) => (side === "l" || side === "r" ? "y" : "x");
  const center = (r: Rect, axis: "x" | "y") => (axis === "y" ? r.y + r.h / 2 : r.x + r.w / 2);
  const length = (r: Rect, axis: "x" | "y") => (axis === "y" ? r.h : r.w);

  type End = { i: number; end: keyof Ports; order: number };
  type SideEnds = { rect: Rect; axis: "x" | "y"; ends: End[]; step: number };
  const sides = new Map<string, SideEnds>();
  edges.forEach((e, i) => {
    for (const end of ["from", "to"] as const) {
      const [id, rect, other] = end === "from" ? [e.source, e.s, e.t] : [e.target, e.t, e.s];
      const side = end === "from" ? e.route.from : e.route.to;
      const axis = across(side);
      const k = `${id}:${side}`;
      const entry = sides.get(k) ?? { rect, axis, ends: [], step: gap };
      entry.ends.push({ i, end, order: center(other, axis) });
      sides.set(k, entry);
    }
  });
  const range = (r: Rect, axis: "x" | "y") => {
    const pad = Math.min(PORT_PAD, length(r, axis) / 4);
    const lo = (axis === "y" ? r.y : r.x) + pad;
    return [lo, lo + length(r, axis) - 2 * pad] as const;
  };
  for (const entry of sides.values()) {
    const { rect, axis, ends } = entry;
    if (ends.length === 1) continue;
    ends.sort((a, b) => a.order - b.order || a.i - b.i);
    const room = length(rect, axis) - 2 * Math.min(PORT_PAD, length(rect, axis) / 4);
    entry.step = Math.min(gap, room / (ends.length - 1));
    ends.forEach((e, k) => (ports[e.i]![e.end] = (k - (ends.length - 1) / 2) * entry.step));
  }

  // Straightening. A straight line must stay clear of the boxes between.
  const clear = (e: RoutedEdge, at: number) => {
    const axis = across(e.route.from);
    const forward = e.route.from === "r" || e.route.from === "b";
    const far = (r: Rect) => (axis === "y" ? r.x + r.w : r.y + r.h);
    const near = (r: Rect) => (axis === "y" ? r.x : r.y);
    const line: Seg = {
      at,
      from: forward ? far(e.s) : near(e.s),
      to: forward ? near(e.t) : far(e.t),
      alongX: axis === "y",
    };
    return !obstaclesFor(e.source, e.target).some((o) => o.cost >= BOX_COST && segmentHits(line, o));
  };
  const abs = (i: number, end: keyof Ports) => {
    const e = edges[i]!;
    const axis = across(end === "from" ? e.route.from : e.route.to);
    return center(end === "from" ? e.s : e.t, axis) + ports[i]![end];
  };
  const sideOf = (i: number, end: keyof Ports) => {
    const e = edges[i]!;
    return sides.get(end === "from" ? `${e.source}:${e.route.from}` : `${e.target}:${e.route.to}`)!;
  };
  // Two lone ports meet in the middle of the smaller box.
  edges.forEach((e, i) => {
    if (
      e.route.corner ||
      e.route.points ||
      sideOf(i, "from").ends.length > 1 ||
      sideOf(i, "to").ends.length > 1
    )
      return;
    const axis = across(e.route.from);
    const [sLo, sHi] = range(e.s, axis);
    const [tLo, tHi] = range(e.t, axis);
    const lo = Math.max(sLo, tLo);
    const hi = Math.min(sHi, tHi);
    if (lo > hi) return;
    const small = center(length(e.s, axis) <= length(e.t, axis) ? e.s : e.t, axis);
    const at = Math.min(hi, Math.max(lo, small));
    if (!clear(e, at)) return;
    ports[i] = { from: at - center(e.s, axis), to: at - center(e.t, axis) };
  });
  // Then each side, fewest ports first, slides its ports to meet their
  // partners where the order and spacing on the side still hold.
  const other = (end: keyof Ports): keyof Ports => (end === "from" ? "to" : "from");
  for (const { rect, axis, ends, step } of [...sides.values()].sort(
    (a, b) => a.ends.length - b.ends.length,
  )) {
    const [lo, hi] = range(rect, axis);
    const want = ends.map(({ i, end }) => {
      const at = abs(i, other(end));
      const { corner, points } = edges[i]!.route;
      return !corner && !points && at >= lo && at <= hi && clear(edges[i]!, at)
        ? at
        : abs(i, end);
    });
    if (want.every((at, k) => at === abs(ends[k]!.i, ends[k]!.end))) continue;
    if (want.some((at, k) => k > 0 && at - want[k - 1]! < step - 0.01)) continue;
    ends.forEach(({ i, end }, k) => {
      const e = edges[i]!;
      ports[i]![end] = want[k]! - center(end === "from" ? e.s : e.t, axis);
    });
  }
  return ports;
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
}

/** The `Bend` of a route between two boxes, with the edge's `ports` on them. */
export function bendOf(route: EdgeRoute, s: Rect, t: Rect, ports: Ports = { from: 0, to: 0 }): Bend {
  const across = (r: Rect) => (route.horizontal ? r.y + r.h / 2 : r.x + r.w / 2);
  const forward = route.from === "r" || route.from === "b";
  const a = across(s) + ports.from;
  const b = across(t) + ports.to;
  return { route, near: forward ? a : b, far: forward ? b : a };
}

/**
 * Spread apart bends that landed in the same channel, so two edges' middle
 * segments never merge into one ambiguous line: each gets its own track,
 * `spacing` apart, in the order that crosses least.
 */
export function separateBends(bends: readonly Bend[], spacing = 10): void {
  for (const horizontal of [true, false]) {
    // A straight edge has no bend to separate (and an L or a detour no one bend).
    const list = bends
      .filter(
        (b) =>
          b.route.horizontal === horizontal && !b.route.corner && !b.route.points && b.near !== b.far,
      )
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
  const lo = (b: Bend) => Math.min(b.near, b.far);
  const hi = (b: Bend) => Math.max(b.near, b.far);
  let clash = false;
  for (let i = 0; i < cluster.length && !clash; i++)
    for (let j = i + 1; j < cluster.length && !clash; j++) {
      const [a, b] = [cluster[i]!, cluster[j]!];
      clash = lo(a) <= hi(b) + 2 && lo(b) <= hi(a) + 2;
    }
  if (!clash) return;

  // With a before b along the channel, a's far piece crosses b's bend if it
  // runs strictly inside b's span, and b's near piece likewise a's.
  const inside = (v: number, b: Bend) => v > lo(b) && v < hi(b);
  const cost = (a: Bend, b: Bend) => Number(inside(a.far, b)) + Number(inside(b.near, a));
  let order = cluster;
  if (cluster.length <= 6) {
    let best = Infinity;
    for (const perm of permutations(cluster)) {
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
  order.forEach((b, k) => (b.route.mid = center + (k - (order.length - 1) / 2) * spacing));
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
