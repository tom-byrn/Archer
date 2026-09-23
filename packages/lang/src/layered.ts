import type { ComponentNode, ConnectionNode } from "./types";
import { networkSimplex, type Constraint } from "./simplex";

/**
 * Hierarchical layered layout — how `autoLayout` arranges components that have
 * no position yet. Sugiyama-style, adapted to Archer's model of planes:
 *
 * 1. Layers, top-down. Connections flow left → right. Each scope (the root or
 *    a plane's interior) is layered on its own with network simplex. Cycles
 *    are broken by DFS from each entry point in turn, keeping whichever
 *    layering has the shortest edges. A plane's children also feel their
 *    connections to the outside: a service that talks to the storage plane on
 *    the right is pulled to its plane's right edge, and a plane whose flow
 *    runs against its neighbours is mirrored (right → left inside).
 * 2. Lanes. A connection that crosses columns gets a dummy node in each one,
 *    reserving a free lane for the drawn edge instead of running it behind a
 *    box. Connections leaving (or entering) one box share their lanes, the
 *    way a hand-drawn bus does.
 * 3. Order. Barycenter sweeps over the whole hierarchy (external neighbours
 *    included), keeping the round with the fewest crossings, then swaps of
 *    neighbours while they remove crossings.
 * 4. Coordinates. Columns are as wide as their widest box and the gaps as wide
 *    as the label chips drawn in them. Rows come from one network-simplex solve
 *    over every box: edges as straight as possible (lanes first), planes as
 *    short as possible while containing their children.
 *
 * Output is integer grid cells and fully deterministic.
 */

/** Default footprint of a leaf / icon-collapsed component, in grid cells. */
export const LEAF_SIZE: [number, number] = [4, 3];
/** Children of a plane start at this inner offset (room for the icon + title row). */
export const PLANE_INNER_ORIGIN: [number, number] = [1, 2];
/** Right/bottom inner margin of a plane around its children. */
export const PLANE_INNER_MARGIN: [number, number] = [1, 1];

/** Columns between layers, before label chips widen them. */
const COL_GAP = 3;
const MAX_COL_GAP = 8;
/** Rows between stacked boxes. */
const ROW_GAP = 2;
/** Rows between an edge corridor and a box. */
const LANE_GAP = 1;
/** Pixels per grid cell in the renderers; only used to size label chips. */
const CELL_PX = 40;
const ORDER_ROUNDS = 10;
/**
 * Objective weights for the row solve. Straightness is scaled up so a tiny
 * per-edge offset can break exact ties: without it a box pulled equally by
 * two neighbours may settle between them, one row off from both.
 */
const STRAIGHT = 4000;
const COMPACT = 1000;
const tieBreak = (i: number) => 1 + ((i * 37) % 97);

export interface LayeredOptions {
  /** Drawn as an expanded plane (children inside) rather than a box. */
  isPlane: (path: string, c: ComponentNode) => boolean;
  /** Footprint of a box (leaf or collapsed container). */
  boxSize: (path: string, c: ComponentNode) => [number, number];
}

export interface Placement {
  at: [number, number];
  size: [number, number];
}

interface Scope {
  owner: Node | null;
  /** Real children in declaration order. */
  nodes: Node[];
  /** Columns, each ordered top → bottom; dummies included. */
  layers: Node[][];
  colX: number[];
  colW: number[];
  /** Minimum gap after each column (label chips). */
  gaps: number[];
  width: number;
  contentH: number;
}

interface Node {
  /** Component path; "" for dummies. */
  path: string;
  decl: number;
  scope: Scope;
  inner: Scope | null;
  dummy: boolean;
  w: number;
  h: number;
  layer: number;
  /** Segments crossing this node's subtree boundary. */
  ext: Ext[];
  x: number;
  y: number;
}

/** One column-to-column piece of a connection's route. */
interface Seg {
  /** Left end (lower column) and right end. */
  a: Node;
  b: Node;
  w: number;
  /** Straightness priority. */
  omega: number;
}

interface Ext {
  seg: Seg;
  other: Node;
  /** Which side of this node the other end lies on. */
  side: -1 | 1;
}

/** Connections merged per pair of visible endpoints. */
interface Link {
  s: Node;
  t: Node;
  w: number;
  undirected: boolean;
  chip: number;
}

/** Width of a connection's label chip in cells, including clearance. */
function chipCells(c: ConnectionNode): number {
  const text = [c.type, c.label].filter((p) => p !== undefined).join(" · ");
  if (text === "" && c.payloads.length === 0) return 0;
  const px = 16 + text.length * 6.5 + (c.payloads.length > 0 ? 18 : 0);
  return Math.ceil((px + 24) / CELL_PX);
}

const isUnder = (path: string, prefix: string) =>
  prefix === "" || path === prefix || path.startsWith(prefix + ".");

/**
 * Lay out a forest: the document's components, or a collapsed container's
 * interior. Returns a placement for every component drawn in it — top-level
 * ones relative to the forest's origin (the first row and column are 0),
 * nested ones relative to their plane. The interiors of collapsed containers
 * are not included; lay those out as forests of their own.
 */
export function layeredLayout(
  items: readonly ComponentNode[],
  prefix: string,
  connections: readonly ConnectionNode[],
  opts: LayeredOptions,
): Map<string, Placement> {
  // ---------------------------------------------------------------- model
  const scopes: Scope[] = []; // preorder: parents before children
  const visible = new Map<string, Node>();
  const hiddenIn = new Map<string, Node>();
  let decl = 0;

  const newScope = (owner: Node | null): Scope => {
    const s: Scope = {
      owner,
      nodes: [],
      layers: [],
      colX: [],
      colW: [],
      gaps: [],
      width: 0,
      contentH: 0,
    };
    scopes.push(s);
    return s;
  };
  const hide = (comps: readonly ComponentNode[], pre: string, box: Node) => {
    for (const c of comps) {
      const path = `${pre}.${c.id}`;
      if (!hiddenIn.has(path)) hiddenIn.set(path, box);
      hide(c.children, path, box);
    }
  };
  const build = (comps: readonly ComponentNode[], pre: string, owner: Node | null) => {
    const scope = newScope(owner);
    for (const c of comps) {
      const path = pre === "" ? c.id : `${pre}.${c.id}`;
      if (visible.has(path)) continue; // duplicate id (invalid doc)
      const plane = c.children.length > 0 && opts.isPlane(path, c);
      const [w, h] = plane ? [0, 0] : opts.boxSize(path, c);
      const node: Node = {
        path,
        decl: decl++,
        scope,
        inner: null,
        dummy: false,
        w,
        h,
        layer: 0,
        ext: [],
        x: 0,
        y: 0,
      };
      visible.set(path, node);
      scope.nodes.push(node);
      if (plane) node.inner = build(c.children, path, node);
      else hide(c.children, path, node);
    }
    return scope;
  };
  const root = build(items, prefix, null);
  if (visible.size === 0) return new Map();

  const chainUp = (n: Node): Scope[] => {
    const out: Scope[] = [];
    for (let s: Scope | null = n.scope; s; s = s.owner?.scope ?? null) out.push(s);
    return out;
  };
  const lcaScope = (a: Node, b: Node): Scope => {
    const up = new Set(chainUp(a));
    for (const s of chainUp(b)) if (up.has(s)) return s;
    return root;
  };
  /** The ancestor-or-self of `n` that is a direct child of `scope`, if any. */
  const inScope = (n: Node, scope: Scope): Node | null => {
    let x: Node | null = n;
    while (x && x.scope !== scope) x = x.scope.owner;
    return x;
  };

  // Merge connections per visible (source, target) pair; drop ones internal to
  // a collapsed box or joining a plane to its own descendant.
  const linkMap = new Map<string, Link>();
  for (const c of connections) {
    const sp = c.source.join(".");
    const tp = c.target.join(".");
    if (!isUnder(sp, prefix) || !isUnder(tp, prefix)) continue;
    const s = visible.get(sp) ?? hiddenIn.get(sp);
    const t = visible.get(tp) ?? hiddenIn.get(tp);
    if (!s || !t || s === t) continue;
    if (isUnder(s.path, t.path) || isUnder(t.path, s.path)) continue;
    const undirected = c.arrow === "--";
    const key = `${s.path}|${t.path}|${undirected}`;
    const chip = chipCells(c);
    const link = linkMap.get(key);
    if (link) {
      link.w++;
      link.chip = Math.max(link.chip, chip);
    } else linkMap.set(key, { s, t, w: 1, undirected, chip });
  }
  const links = [...linkMap.values()].sort(
    (p, q) =>
      p.s.decl - q.s.decl || p.t.decl - q.t.decl || Number(p.undirected) - Number(q.undirected),
  );

  // --------------------------------------------------------- 1. layering
  for (const scope of scopes) assignLayers(scope, links, root, lcaScope, inScope);

  // ------------------------------------------------------ 2. corridors
  const segs: Seg[] = [];
  const gapSegs = new Map<Scope, Seg[][]>();
  const dummy = (scope: Scope, layer: number): Node => {
    const d: Node = {
      path: "",
      decl: decl++,
      scope,
      inner: null,
      dummy: true,
      w: 0,
      h: 1,
      layer,
      ext: [],
      x: 0,
      y: 0,
    };
    scope.layers[layer]!.push(d);
    return d;
  };
  // Lanes are shared: connections leaving one box in the same direction run
  // in one lane until they part (a trunk), connections converging on one box
  // share its last lanes. Keyed by that box, the column and the direction.
  const scopeId = new Map(scopes.map((s, i) => [s, i]));
  const lanes = new Map<string, Node>();
  const lane = (owner: Node, scope: Scope, layer: number, dir: number): Node => {
    const key = `${owner.decl}:${scopeId.get(scope)}:${layer}:${dir}`;
    let d = lanes.get(key);
    if (!d) {
      d = dummy(scope, layer);
      lanes.set(key, d);
    }
    return d;
  };
  const segFor = new Map<string, Seg>();
  const addSeg = (p: Node, q: Node, w: number) => {
    const key = p.decl < q.decl ? `${p.decl}:${q.decl}` : `${q.decl}:${p.decl}`;
    const shared = segFor.get(key);
    if (shared) {
      shared.w += w;
      return;
    }
    const g = lcaScope(p, q);
    const rp = inScope(p, g)!;
    const rq = inScope(q, g)!;
    const [a, b, ra, rb] = rp.layer < rq.layer ? [p, q, rp, rq] : [q, p, rq, rp];
    // Corridor pieces bend last; an edge into a plane's side can take a jog
    // more easily than one between two boxes.
    const omega = a.dummy && b.dummy ? 8 : a.dummy || b.dummy ? 2 : 1;
    const seg: Seg = { a, b, w, omega: a.inner || b.inner ? omega / 2 : omega };
    segs.push(seg);
    segFor.set(key, seg);
    for (let x = a; ; x = x.scope.owner!) {
      x.ext.push({ seg, other: b, side: 1 });
      if (x === ra) break;
    }
    for (let x = b; ; x = x.scope.owner!) {
      x.ext.push({ seg, other: a, side: -1 });
      if (x === rb) break;
    }
    const perGap = gapSegs.get(g) ?? [];
    gapSegs.set(g, perGap);
    (perGap[ra.layer] ??= []).push(seg);
  };
  const requireGap = (scope: Scope, gap: number, cells: number) => {
    if (gap < 0 || gap >= scope.layers.length - 1) return;
    scope.gaps[gap] = Math.max(scope.gaps[gap] ?? COL_GAP, cells);
  };

  for (const link of links) {
    const T = lcaScope(link.s, link.t);
    const ra = inScope(link.s, T)!;
    const rb = inScope(link.t, T)!;
    const dir = rb.layer > ra.layer ? 1 : -1;
    const points: Node[] = [link.s];
    for (let x = link.s; x.scope !== T; x = x.scope.owner!) {
      const S = x.scope;
      if (dir > 0)
        for (let l = x.layer + 1; l < S.layers.length; l++) points.push(lane(link.s, S, l, dir));
      else for (let l = x.layer - 1; l >= 0; l--) points.push(lane(link.s, S, l, dir));
    }
    // Across the common scope: the half nearer the source is the source's
    // trunk, the half nearer the target the target's.
    for (let l = ra.layer + dir; l !== rb.layer; l += dir) {
      const nearSource = Math.abs(l - ra.layer) <= Math.abs(rb.layer - l);
      points.push(lane(nearSource ? link.s : link.t, T, l, dir));
    }
    const entries: Node[][] = [];
    for (let x = link.t; x.scope !== T; x = x.scope.owner!) {
      const S = x.scope;
      const run: Node[] = [];
      if (dir > 0) for (let l = 0; l < x.layer; l++) run.push(lane(link.t, S, l, dir));
      else for (let l = S.layers.length - 1; l > x.layer; l--) run.push(lane(link.t, S, l, dir));
      entries.push(run);
    }
    for (let k = entries.length - 1; k >= 0; k--) points.push(...entries[k]!);
    points.push(link.t);
    for (let i = 0; i + 1 < points.length; i++) addSeg(points[i]!, points[i + 1]!, link.w);

    // The label chip sits in one of the gaps next to an end at this level.
    requireGap(T, dir > 0 ? ra.layer : ra.layer - 1, link.chip);
    requireGap(T, dir > 0 ? rb.layer - 1 : rb.layer, link.chip);
  }

  // ------------------------------------------------------------ 3. order
  const estimate = () => estimateRows(scopes);
  const center = (n: Node) => n.y + n.h / 2;
  const gapLists: Seg[][] = [];
  const gapOf = new Map<Seg, Seg[]>();
  for (const perGap of gapSegs.values())
    for (const list of perGap) {
      if (!list) continue;
      gapLists.push(list);
      for (const seg of list) gapOf.set(seg, list);
    }
  const segIndex = new Map(segs.map((seg, i) => [seg, i]));
  const crossings = (): number =>
    gapLists.reduce((acc, list) => acc + gapCrossings(list, center), 0);
  /** Crossings involving any of `moved` (each pair once). */
  const crossingsOf = (moved: Set<Seg>): number => {
    let total = 0;
    for (const s of moved) {
      const sa = center(s.a);
      const sb = center(s.b);
      const si = segIndex.get(s)!;
      for (const t of gapOf.get(s)!) {
        if (t === s || (moved.has(t) && segIndex.get(t)! < si)) continue;
        if ((sa - center(t.a)) * (sb - center(t.b)) < 0) total += s.w * t.w;
      }
    }
    return total;
  };
  const sortLayer = (layer: Node[], side: -1 | 1) => {
    const key = new Map<Node, number>();
    for (const n of layer) {
      let sum = 0;
      let weight = 0;
      for (const e of n.ext) {
        if (e.side !== side) continue;
        sum += e.seg.w * center(e.other);
        weight += e.seg.w;
      }
      key.set(n, weight > 0 ? sum / weight : center(n));
    }
    layer.sort((p, q) => key.get(p)! - key.get(q)!);
  };
  const snapshot = () => scopes.map((s) => s.layers.map((l) => [...l]));
  /** Swap neighbours i and i+1 of a column in place, keeping the pair's span. */
  const swapRows = (layer: Node[], i: number) => {
    const u = layer[i]!;
    const v = layer[i + 1]!;
    const top = u.y;
    const bottom = v.y + v.h;
    layer[i] = v;
    layer[i + 1] = u;
    moveTo(v, top);
    moveTo(u, bottom - u.h);
  };
  /** Transpose: swap neighbours in a column wherever that removes crossings. */
  const transpose = (): boolean => {
    let improved = false;
    for (const s of scopes)
      for (const layer of s.layers)
        for (let i = 0; i + 1 < layer.length; i++) {
          const moved = new Set([...layer[i]!.ext, ...layer[i + 1]!.ext].map((e) => e.seg));
          const before = crossingsOf(moved);
          if (before === 0) continue;
          swapRows(layer, i);
          if (crossingsOf(moved) < before) improved = true;
          else swapRows(layer, i);
        }
    return improved;
  };

  estimate();
  let best = crossings();
  let bestOrder = snapshot();
  for (let round = 0; round < ORDER_ROUNDS && best > 0; round++) {
    for (const s of scopes)
      for (const layer of s.layers) {
        sortLayer(layer, -1);
        estimate();
      }
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i]!;
      for (let l = s.layers.length - 1; l >= 0; l--) {
        sortLayer(s.layers[l]!, 1);
        estimate();
      }
    }
    const c = crossings();
    if (c < best) {
      best = c;
      bestOrder = snapshot();
    }
  }
  scopes.forEach((s, i) => (s.layers = bestOrder[i]!));
  estimate();
  for (let pass = 0; best > 0 && pass < 4 && transpose(); pass++) estimate();

  // ------------------------------------------------------- 4. coordinates
  assignColumns(scopes);
  solveRows(scopes, segs);
  // Solved rows can reveal crossings the stacked estimate hid (lanes squeezed
  // in differently): transpose once more on real rows, then re-solve.
  if (transpose()) solveRows(scopes, segs);
  legalizeRows(scopes);

  // Output: root boxes normalised to start at 0, nested boxes plane-relative.
  const out = new Map<string, Placement>();
  let minX = Infinity;
  let minY = Infinity;
  for (const n of root.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
  }
  for (const n of visible.values()) {
    const p = n.scope.owner;
    out.set(n.path, {
      at: p ? [n.x - p.x, n.y - p.y] : [n.x - minX, n.y - minY],
      size: [n.w, n.h],
    });
  }
  return out;
}

// ---------------------------------------------------------------- layering

function assignLayers(
  scope: Scope,
  links: readonly Link[],
  root: Scope,
  lcaScope: (a: Node, b: Node) => Scope,
  inScope: (n: Node, s: Scope) => Node | null,
) {
  interface Edge {
    a: Node;
    b: Node;
    w: number;
    undirected: boolean;
  }
  const edges: Edge[] = [];
  const pullW = new Map<Node, number>();
  const pullE = new Map<Node, number>();
  const bump = (m: Map<Node, number>, n: Node, w: number) => m.set(n, (m.get(n) ?? 0) + w);

  for (const link of links) {
    const a = inScope(link.s, scope);
    const b = inScope(link.t, scope);
    if (a && b) {
      if (a !== b) edges.push({ a, b, w: link.w, undirected: link.undirected });
      continue;
    }
    if (!a && !b) continue;
    // Leaves this scope: which side is the far end on? Decided one level up
    // where the connection crosses columns (already layered: top-down order).
    const inner = a ? link.s : link.t;
    const outer = a ? link.t : link.s;
    const T = lcaScope(inner, outer);
    const side = inScope(outer, T)!.layer - inScope(inner, T)!.layer;
    if (side === 0) continue;
    bump(side > 0 ? pullE : pullW, (a ?? b)!, link.w);
  }

  const touched = new Set<Node>();
  for (const e of edges) touched.add(e.a).add(e.b);
  for (const n of [...pullW.keys(), ...pullE.keys()]) touched.add(n);
  const connected = scope.nodes.filter((n) => touched.has(n));
  const free = scope.nodes.filter((n) => !touched.has(n));

  if (connected.length > 0) {
    const id = new Map(connected.map((n, i) => [n, i]));
    const k = connected.length;
    const pulls = scope !== root && pullW.size + pullE.size > 0;
    const solve = (oriented: [Node, Node, number][], mirror: boolean) => {
      const cs: Constraint[] = [];
      for (const [a, b, w] of oriented) {
        const [p, q] = mirror ? [b, a] : [a, b];
        cs.push({ from: id.get(p)!, to: id.get(q)!, minlen: 1, weight: 2 * w });
      }
      if (pulls) {
        const west = k;
        const east = k + 1;
        for (const n of connected) {
          cs.push({ from: west, to: id.get(n)!, minlen: 1, weight: 2 * (pullW.get(n) ?? 0) });
          cs.push({ from: id.get(n)!, to: east, minlen: 1, weight: 2 * (pullE.get(n) ?? 0) });
        }
        // Tie-break toward fewer columns.
        cs.push({ from: west, to: east, minlen: 2, weight: 1 });
      }
      const r = networkSimplex(pulls ? k + 2 : k, cs);
      const cost = cs.reduce((acc, c) => acc + c.weight * (r[c.to]! - r[c.from]!), 0);
      return { r, cost };
    };
    // Which edges a cycle gives up is a guess: try DFS from each entry point
    // and keep the layering with the shortest edges, a reversed edge counting
    // two extra columns.
    let best: { r: number[]; cost: number } | undefined;
    const tried = new Set<string>();
    for (let first = -1; first < Math.min(k, 16); first++) {
      const { oriented, reversed, key } = orient(connected, edges, first);
      if (tried.has(key)) continue;
      tried.add(key);
      for (const mirror of pulls ? [false, true] : [false]) {
        const s = solve(oriented, mirror);
        s.cost += 4 * reversed;
        if (!best || s.cost < best.cost) best = s;
      }
    }
    let min = Infinity;
    for (const n of connected) min = Math.min(min, best!.r[id.get(n)!]!);
    for (const n of connected) n.layer = best!.r[id.get(n)!]! - min;
  }

  // Unconnected children: a grid when nothing else is here, otherwise under
  // the shortest columns.
  if (connected.length === 0) {
    // Boxes are wider than tall, so ~1.4 rows per column reads as square.
    const cols = Math.max(1, Math.round(Math.sqrt(free.length / 1.4)));
    free.forEach((n, i) => (n.layer = i % cols));
  } else {
    const count: number[] = [];
    for (const n of connected) count[n.layer] = (count[n.layer] ?? 0) + 1;
    for (const n of free) {
      let bestLayer = 0;
      for (let l = 1; l < count.length; l++)
        if ((count[l] ?? 0) < (count[bestLayer] ?? 0)) bestLayer = l;
      n.layer = bestLayer;
      count[bestLayer] = (count[bestLayer] ?? 0) + 1;
    }
  }

  const depth = Math.max(-1, ...scope.nodes.map((n) => n.layer)) + 1;
  scope.layers = Array.from({ length: depth }, () => []);
  for (const n of [...connected, ...free]) scope.layers[n.layer]!.push(n);
}

/**
 * Orient a scope's edges into a DAG: DFS from `first` (if ≥ 0), then from
 * entry points and everything else in declaration order, reversing back
 * edges; undirected `--` edges follow the resulting topological order.
 */
function orient(
  nodes: Node[],
  edges: { a: Node; b: Node; w: number; undirected: boolean }[],
  first: number,
): { oriented: [Node, Node, number][]; reversed: number; key: string } {
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const out: number[][] = nodes.map(() => []);
  const indeg = new Array<number>(nodes.length).fill(0);
  edges.forEach((e, i) => {
    if (e.undirected) return;
    out[idx.get(e.a)!]!.push(i);
    indeg[idx.get(e.b)!]!++;
  });
  for (const list of out) list.sort((p, q) => edges[p]!.b.decl - edges[q]!.b.decl);

  const state = new Uint8Array(nodes.length); // 0 new, 1 on stack, 2 done
  const reversed = new Set<number>();
  const post: number[] = [];
  const visit = (start: number) => {
    state[start] = 1;
    const stack: [number, number][] = [[start, 0]];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const [v, i] = top;
      if (i < out[v]!.length) {
        top[1]++;
        const e = out[v]![i]!;
        const w = idx.get(edges[e]!.b)!;
        if (state[w] === 1) reversed.add(e);
        else if (state[w] === 0) {
          state[w] = 1;
          stack.push([w, 0]);
        }
      } else {
        state[v] = 2;
        post.push(v);
        stack.pop();
      }
    }
  };
  if (first >= 0) visit(first);
  for (let v = 0; v < nodes.length; v++) if (indeg[v] === 0 && state[v] === 0) visit(v);
  for (let v = 0; v < nodes.length; v++) if (state[v] === 0) visit(v);

  const pos = new Array<number>(nodes.length);
  post.forEach((v, i) => (pos[v] = post.length - 1 - i));
  let weight = 0;
  let key = "";
  const oriented = edges.map((e, i): [Node, Node, number] => {
    const a = idx.get(e.a)!;
    const b = idx.get(e.b)!;
    const forward = e.undirected ? pos[a]! < pos[b]! : !reversed.has(i);
    if (!e.undirected && !forward) weight += e.w;
    key += forward ? "1" : "0";
    return forward ? [e.a, e.b, e.w] : [e.b, e.a, e.w];
  });
  return { oriented, reversed: weight, key };
}

/**
 * Weighted crossings among one gap's segments: pairs whose ends are in
 * opposite order on the two sides. An inversion count, O(n log n).
 */
function gapCrossings(list: readonly Seg[], center: (n: Node) => number): number {
  if (list.length < 2) return 0;
  const items = list.map((s) => ({ a: center(s.a), b: center(s.b), w: s.w }));
  items.sort((p, q) => p.a - q.a || p.b - q.b);
  const bs = [...new Set(items.map((i) => i.b))].sort((p, q) => p - q);
  const rank = new Map(bs.map((b, i) => [b, i + 1]));
  const tree = new Float64Array(bs.length + 1);
  let total = 0;
  let seen = 0;
  for (const it of items) {
    const r = rank.get(it.b)!;
    let atOrBelow = 0;
    for (let i = r; i > 0; i -= i & -i) atOrBelow += tree[i]!;
    total += it.w * (seen - atOrBelow);
    for (let i = r; i < tree.length; i += i & -i) tree[i] = tree[i]! + it.w;
    seen += it.w;
  }
  return total;
}

/** Move a node (and everything inside it) so its top is at `y`. */
function moveTo(n: Node, y: number) {
  const d = y - n.y;
  const shift = (m: Node) => {
    m.y += d;
    if (m.inner) for (const layer of m.inner.layers) layer.forEach(shift);
  };
  shift(n);
}

// ------------------------------------------------------------------ rows

/** Gap between two boxes stacked in a column; `slack` reserves a row next to planes. */
const rowGap = (u: Node, v: Node, slack: boolean): number =>
  u.dummy && v.dummy
    ? 0
    : u.dummy || v.dummy
      ? LANE_GAP
      : ROW_GAP + (slack && (u.inner || v.inner) ? 1 : 0);

const stackHeight = (layer: readonly Node[]): number => {
  let h = 0;
  layer.forEach((n, i) => (h += n.h + (i > 0 ? rowGap(layer[i - 1]!, n, true) : 0)));
  return h;
};

/** Cheap row estimate for ordering: every column stacked and centered. */
function estimateRows(scopes: readonly Scope[]) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i]!;
    s.contentH = Math.max(0, ...s.layers.map(stackHeight));
    if (s.owner)
      s.owner.h = PLANE_INNER_ORIGIN[1] + Math.max(1, s.contentH) + PLANE_INNER_MARGIN[1];
  }
  for (const s of scopes) {
    const top = s.owner ? s.owner.y + PLANE_INNER_ORIGIN[1] : 0;
    for (const layer of s.layers) {
      let y = top + (s.contentH - stackHeight(layer)) / 2;
      layer.forEach((n, i) => {
        if (i > 0) y += rowGap(layer[i - 1]!, n, true);
        n.y = y;
        y += n.h;
      });
    }
  }
}

/**
 * One network-simplex solve for every row: stacking order and containment as
 * constraints, straight edges and short planes as the objective. Re-solved
 * while plane heights (and so the ports of edges attached to them) move.
 */
function solveRows(scopes: readonly Scope[], segs: readonly Seg[]) {
  const nodes: Node[] = [];
  for (const s of scopes) for (const layer of s.layers) nodes.push(...layer);
  const vid = new Map(nodes.map((n, i) => [n, i]));
  let count = nodes.length;
  const bottom = new Map<Node, number>();
  for (const n of nodes) if (n.inner) bottom.set(n, count++);
  const top = count++;
  const base = count;

  const port = (n: Node) => Math.floor(n.h / 2);
  const lower = (n: Node): [number, number] =>
    n.inner ? [bottom.get(n)!, 0] : [vid.get(n)!, n.h];

  const planeEdges = segs.some((s) => s.a.inner || s.b.inner);
  for (let pass = 0; pass < 3; pass++) {
    const cs: Constraint[] = [];
    for (const s of scopes) {
      for (const layer of s.layers) {
        for (let i = 1; i < layer.length; i++) {
          const [v, off] = lower(layer[i - 1]!);
          cs.push({
            from: v,
            to: vid.get(layer[i]!)!,
            minlen: off + rowGap(layer[i - 1]!, layer[i]!, true),
            weight: 0,
          });
        }
      }
      const owner = s.owner;
      if (owner) {
        cs.push({ from: vid.get(owner)!, to: bottom.get(owner)!, minlen: 3, weight: COMPACT });
        for (const layer of s.layers) {
          if (layer.length === 0) continue;
          cs.push({
            from: vid.get(owner)!,
            to: vid.get(layer[0]!)!,
            minlen: PLANE_INNER_ORIGIN[1],
            weight: 0,
          });
          const [v, off] = lower(layer[layer.length - 1]!);
          const minlen = off + PLANE_INNER_MARGIN[1];
          cs.push({ from: v, to: bottom.get(owner)!, minlen, weight: 0 });
        }
      } else {
        for (const layer of s.layers)
          if (layer.length > 0)
            cs.push({ from: top, to: vid.get(layer[0]!)!, minlen: 0, weight: COMPACT });
      }
    }
    segs.forEach((seg, i) => {
      const aux = base + i;
      const pa = port(seg.a);
      const pb = port(seg.b);
      const w = STRAIGHT * seg.omega * seg.w + tieBreak(i);
      cs.push({ from: aux, to: vid.get(seg.a)!, minlen: Math.max(0, pb - pa), weight: w });
      cs.push({ from: aux, to: vid.get(seg.b)!, minlen: Math.max(0, pa - pb), weight: w });
    });

    const r = networkSimplex(base + segs.length, cs);
    let moved = false;
    for (const n of nodes) {
      n.y = r[vid.get(n)!]!;
      if (n.inner) {
        const h = r[bottom.get(n)!]! - n.y;
        if (h !== n.h) moved = true;
        n.h = h;
      }
    }
    if (!planeEdges || !moved) break;
  }
}

/**
 * Enforce spacing and containment after the solve: odd plane heights (so an
 * edge to a plane's middle can line up with a box's middle), planes wrapping
 * their children, boxes never overlapping.
 */
function legalizeRows(scopes: readonly Scope[]) {
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i]!;
      const p = s.owner;
      if (!p) continue;
      let need = p.h;
      for (const layer of s.layers)
        for (const n of layer) need = Math.max(need, n.y + n.h + PLANE_INNER_MARGIN[1] - p.y);
      if (need % 2 === 0) need++;
      if (need !== p.h) {
        p.h = need;
        changed = true;
      }
    }
    for (const s of scopes) {
      for (const layer of s.layers) {
        for (let i = 1; i < layer.length; i++) {
          const u = layer[i - 1]!;
          const v = layer[i]!;
          const min = u.y + u.h + rowGap(u, v, false);
          if (v.y < min) {
            moveTo(v, min);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------- columns

/** Column widths and x positions, bottom-up so plane widths are known. */
function assignColumns(scopes: readonly Scope[]) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i]!;
    s.colW = s.layers.map((layer) => Math.max(0, ...layer.filter((n) => !n.dummy).map((n) => n.w)));
    s.colX = [];
    let x = 0;
    s.layers.forEach((_, l) => {
      s.colX.push(x);
      x += s.colW[l]! + Math.min(MAX_COL_GAP, s.gaps[l] ?? COL_GAP);
    });
    s.width = s.layers.length > 0 ? s.colX[s.layers.length - 1]! + s.colW[s.layers.length - 1]! : 0;
    if (s.owner)
      s.owner.w = PLANE_INNER_ORIGIN[0] + Math.max(LEAF_SIZE[0], s.width) + PLANE_INNER_MARGIN[0];
  }
  for (const s of scopes) {
    const ox = s.owner ? s.owner.x + PLANE_INNER_ORIGIN[0] : 0;
    s.layers.forEach((layer, l) => {
      for (const n of layer) n.x = ox + s.colX[l]! + Math.floor((s.colW[l]! - n.w) / 2);
    });
  }
}
