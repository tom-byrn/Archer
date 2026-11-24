import {
  pathToString,
  type FlowNode,
  type FlowNodeKind,
  type MachineNode,
  type ModelNode,
} from "@archer/lang";
import { textWidth } from "./sequenceLayout";

/**
 * Geometry for the graph-shaped views (spec §6.2–6.4): flows, state machines
 * and data models. Pure, like `sequenceLayout`. Nodes go in columns by rank
 * (longest path from where the graph starts, back edges ignored), and, for a
 * flow, in the lane of the component that does them.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RankNode {
  id: string;
  w: number;
  h: number;
  lane?: number;
}

const MARGIN = 32;
const COL_GAP = 88;
const ROW_GAP = 28;
const LANE_PAD = 28;

/** Rank by longest path over forward edges; back edges (found by DFS from the sources) don't count. */
function ranks(ids: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const out = new Map<string, string[]>();
  for (const id of ids) out.set(id, []);
  for (const e of edges) if (out.has(e.from) && out.has(e.to) && e.from !== e.to) out.get(e.from)!.push(e.to);
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) if (e.from !== e.to && indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to)! + 1);
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id)!) {
      if (state.get(to) === 1) back.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (indeg.get(id) === 0 && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  const rank = new Map(ids.map((id) => [id, 0]));
  // Longest path: relax in topological order of the forward graph.
  const fwd = edges.filter((e) => e.from !== e.to && !back.has(`${e.from}>${e.to}`) && rank.has(e.from) && rank.has(e.to));
  const deg = new Map(ids.map((id) => [id, 0]));
  for (const e of fwd) deg.set(e.to, deg.get(e.to)! + 1);
  const queue = ids.filter((id) => deg.get(id) === 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of fwd) {
      if (e.from !== id) continue;
      rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(id)! + 1));
      deg.set(e.to, deg.get(e.to)! - 1);
      if (deg.get(e.to) === 0) queue.push(e.to);
    }
  }
  return rank;
}

interface RankLayout {
  boxes: Map<string, Box>;
  /** Each lane's band (flows): top and height. */
  lanes: { y: number; h: number }[];
  width: number;
  height: number;
}

/**
 * Columns by rank, rows by lane (when given), and within a cell nodes stacked
 * in order of their predecessors' positions.
 */
/** Grid cell of a view's placed positions (`at` in the layout block), as on the canvas. */
export const VIEW_CELL = 40;

/** Placed positions by node id, in grid cells. */
export type Placed = ReadonlyMap<string, readonly [number, number]>;

function rankLayout(
  nodes: RankNode[],
  edges: { from: string; to: string; label?: string }[],
  laneCount: number,
  left: number,
  placed: Placed = new Map(),
  /** A flow: only a placed node's column counts; its lane is its row. */
  xOnly = false,
): RankLayout {
  // Wide enough that a forward edge's label fits on its last leg.
  const gap = Math.max(COL_GAP, ...edges.map((e) => (e.label ? textWidth(e.label) + 64 : 0)));
  const rank = ranks(nodes.map((n) => n.id), edges);
  const cols = Math.max(0, ...nodes.map((n) => rank.get(n.id)! + 1));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...nodes.filter((n) => rank.get(n.id) === c).map((n) => n.w)));
  const colX: number[] = [];
  let x = left;
  for (let c = 0; c < cols; c++) {
    colX.push(x);
    x += colW[c]! + gap;
  }
  const lanes = Math.max(1, laneCount);
  // Cells: (lane, column) → nodes, in order (predecessor barycenter, then document order).
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const cell = (n: RankNode) => `${n.lane ?? 0}:${rank.get(n.id)}`;
  const cells = new Map<string, RankNode[]>();
  for (const n of nodes) {
    const k = cell(n);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(n);
  }
  for (const list of cells.values()) {
    const bary = (n: RankNode) => {
      const preds = edges.filter((e) => e.to === n.id && e.from !== n.id).map((e) => order.get(e.from) ?? 0);
      return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : order.get(n.id)!;
    };
    list.sort((a, b) => bary(a) - bary(b) || order.get(a.id)! - order.get(b.id)!);
  }
  // Lane heights: the tallest stack in any of its cells.
  const laneH = Array.from({ length: lanes }, (_, l) => {
    let h = 0;
    for (let c = 0; c < cols; c++) {
      const list = cells.get(`${l}:${c}`) ?? [];
      h = Math.max(h, list.reduce((sum, n) => sum + n.h, 0) + Math.max(0, list.length - 1) * ROW_GAP);
    }
    return Math.max(h, 40) + LANE_PAD * 2;
  });
  const laneY: number[] = [];
  let y = MARGIN;
  for (let l = 0; l < lanes; l++) {
    laneY.push(y);
    y += laneH[l]!;
  }
  const boxes = new Map<string, Box>();
  for (const [k, list] of cells) {
    const [l, c] = k.split(":").map(Number) as [number, number];
    const stack = list.reduce((sum, n) => sum + n.h, 0) + Math.max(0, list.length - 1) * ROW_GAP;
    let top = laneY[l]! + (laneH[l]! - stack) / 2;
    for (const n of list) {
      boxes.set(n.id, { x: colX[c]! + (colW[c]! - n.w) / 2, y: top, w: n.w, h: n.h });
      top += n.h + ROW_GAP;
    }
  }
  let width = Math.max(x - gap + MARGIN, left + 200);
  let height = y + MARGIN + 40;
  for (const [id, at] of placed) {
    const b = boxes.get(id);
    if (!b) continue;
    b.x = Math.max(left, at[0] * VIEW_CELL);
    if (!xOnly) b.y = Math.max(MARGIN, at[1] * VIEW_CELL);
    width = Math.max(width, b.x + b.w + MARGIN);
    if (!xOnly) height = Math.max(height, b.y + b.h + MARGIN + 40);
  }
  return {
    boxes,
    lanes: laneY.map((ly, i) => ({ y: ly, h: laneH[i]! })),
    width,
    height,
  };
}

/* --------------------------------------------------------------- Edges */

export interface RoutedEdge {
  index: number;
  d: string;
  /** Where its label goes (its left end, centred vertically on the point). */
  label?: { x: number; y: number; text: string };
}

const midRight = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const midLeft = (b: Box) => ({ x: b.x, y: b.y + b.h / 2 });

/**
 * Right-angled routes: forward edges leave a node's right side and enter the
 * next one's left; edges back (or within a column) run under both; a node to
 * itself loops over its top. `bottom` stacks the routes that run underneath.
 */
export function routeEdges(
  edges: { from: string; to: string; label?: string }[],
  boxes: Map<string, Box>,
): RoutedEdge[] {
  const under = new Map<string, number>();
  return edges.flatMap((e, index) => {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b) return [];
    const text = e.label;
    if (e.from === e.to) {
      // On the left shoulder: edges from below or above come in at the middle.
      const x1 = a.x + a.w * 0.34;
      const x2 = a.x + a.w * 0.14;
      const top = a.y - 26;
      return [{
        index,
        d: `M${x1} ${a.y} V${top} H${x2} V${a.y - 2}`,
        ...(text ? { label: { x: x2 - 4 - Math.ceil(text.length * 6.6), y: top, text } } : {}),
      }];
    }
    if (b.x > a.x + a.w - 1) {
      const s = midRight(a);
      const t = midLeft(b);
      const mx = Math.round(s.x + Math.min(36, (t.x - s.x) / 2));
      return [{
        index,
        d: s.y === t.y ? `M${s.x} ${s.y} H${t.x - 2}` : `M${s.x} ${s.y} H${mx} V${t.y} H${t.x - 2}`,
        // On the last leg, so labels of edges leaving one node (a decision's) don't collide.
        ...(text ? { label: s.y === t.y ? { x: s.x + 8, y: s.y - 10, text } : { x: mx + 8, y: t.y - 10, text } } : {}),
      }];
    }
    // Back, or in the same column: under both, or over both when going
    // under would cut through a box (another state stacked below).
    const sx = a.x + a.w / 2;
    const tx = b.x + b.w / 2 + 8;
    const lo = Math.min(sx, tx);
    const hi = Math.max(sx, tx);
    const others = [...boxes.values()].filter((x) => x !== a && x !== b);
    const spanned = others.filter((x) => x.x < hi && x.x + x.w > lo);
    const hits = (x: number, y1: number, y2: number) =>
      others.some((o) => x > o.x && x < o.x + o.w && Math.max(y1, y2) > o.y && Math.min(y1, y2) < o.y + o.h);
    const k = under.get(`${lo}`) ?? 0;
    under.set(`${lo}`, k + 1);
    const yb = Math.max(a.y + a.h, b.y + b.h, ...spanned.map((x) => x.y + x.h)) + 22 + k * 14;
    const yt = Math.min(a.y, b.y, ...spanned.map((x) => x.y)) - 22 - k * 14;
    const below = !hits(sx, a.y + a.h, yb) && !hits(tx, b.y + b.h, yb);
    const above = !hits(sx, a.y, yt) && !hits(tx, b.y, yt);
    if (!below && above)
      return [{
        index,
        d: `M${sx} ${a.y} V${yt} H${tx} V${b.y - 2}`,
        ...(text ? { label: { x: lo + 10, y: yt - 10, text } } : {}),
      }];
    return [{
      index,
      d: `M${sx} ${a.y + a.h} V${yb} H${tx} V${b.y + b.h + 2}`,
      ...(text ? { label: { x: lo + 10, y: yb + 10, text } } : {}),
    }];
  });
}

/* --------------------------------------------------------------- Flows */

export const FLOW_SIZES: Record<FlowNodeKind, (name: string) => { w: number; h: number }> = {
  start: () => ({ w: 28, h: 28 }),
  end: () => ({ w: 30, h: 30 }),
  step: (name) => ({ w: Math.max(128, Math.min(220, textWidth(name) + 32)), h: 44 }),
  decision: (name) => ({ w: Math.max(120, Math.min(220, textWidth(name) + 64)), h: 68 }),
};

export const LANE_HEAD = 168;

export interface FlowLayout extends RankLayout {
  /** Lanes top to bottom: a component's path, or null for nodes in no lane. */
  laneKeys: (string | null)[];
}

export function layoutFlow(flow: FlowNode, placed?: Placed): FlowLayout {
  const laneKeys: (string | null)[] = [];
  for (const n of flow.nodes) {
    const k = n.lane ? pathToString(n.lane) : null;
    if (k !== null && !laneKeys.includes(k)) laneKeys.push(k);
  }
  if (flow.nodes.some((n) => !n.lane) || laneKeys.length === 0) laneKeys.push(null);
  const nodes = flow.nodes.map((n) => ({
    id: n.id,
    ...FLOW_SIZES[n.node](n.name ?? n.id),
    lane: laneKeys.indexOf(n.lane ? pathToString(n.lane) : null),
  }));
  return { ...rankLayout(nodes, flow.edges, laneKeys.length, MARGIN + LANE_HEAD + 24, placed, true), laneKeys };
}

/* ------------------------------------------------------- State machines */

export const stateSize = (name: string) => ({ w: Math.max(112, Math.min(220, textWidth(name) + 40)), h: 40 });

export function layoutMachine(m: MachineNode, placed?: Placed): RankLayout {
  const nodes = m.states.map((s) => ({ id: s.id, ...stateSize(s.name ?? s.id) }));
  // The initial state goes first: its marker sits left of it.
  return rankLayout(nodes, m.transitions, 1, MARGIN + 44, placed);
}

/* ---------------------------------------------------------- Data models */

export const ENTITY_HEAD = 34;
export const FIELD_ROW = 24;

export const entitySize = (e: ModelNode["entities"][number]) => {
  const widest = Math.max(
    textWidth(e.name ?? e.id) + 40,
    ...e.fields.map((f) => textWidth(`${f.name}  ${f.type}`) + 64),
  );
  return { w: Math.max(180, Math.min(320, widest)), h: ENTITY_HEAD + Math.max(1, e.fields.length) * FIELD_ROW + 8 };
};

export interface ModelLayout extends RankLayout {
  /** One per reference: from the field's row to the entity (or field) it names. */
  refs: { entity: string; field: string; d: string; many: { x: number; y: number; dir: 1 | -1 }; one: { x: number; y: number; dir: 1 | -1 } }[];
}

export function layoutModel(m: ModelNode, placed?: Placed): ModelLayout {
  const nodes = m.entities.map((e) => ({ id: e.id, ...entitySize(e) }));
  // Referenced entities go left of what refers to them.
  const edges = m.entities.flatMap((e) =>
    e.fields.filter((f) => f.ref && f.ref.entity !== e.id).map((f) => ({ from: f.ref!.entity, to: e.id })),
  );
  const base = rankLayout(nodes, edges, 1, MARGIN, placed);
  const rowY = (box: Box, i: number) => box.y + ENTITY_HEAD + i * FIELD_ROW + FIELD_ROW / 2;
  const refs: ModelLayout["refs"] = [];
  let k = 0;
  for (const e of m.entities) {
    const from = base.boxes.get(e.id)!;
    e.fields.forEach((f, i) => {
      if (!f.ref) return;
      const target = m.entities.find((x) => x.id === f.ref!.entity);
      const to = target ? base.boxes.get(target.id) : undefined;
      if (!target || !to) return;
      const fi = f.ref.field !== undefined ? target.fields.findIndex((x) => x.name === f.ref!.field) : -1;
      const ty = fi >= 0 ? rowY(to, fi) : to.y + ENTITY_HEAD / 2;
      const fy = rowY(from, i);
      let d: string;
      let many: ModelLayout["refs"][number]["many"];
      let one: ModelLayout["refs"][number]["one"];
      if (to.x + to.w < from.x) {
        const mx = Math.round((to.x + to.w + from.x) / 2);
        d = `M${from.x} ${fy} H${mx} V${ty} H${to.x + to.w}`;
        many = { x: from.x, y: fy, dir: -1 };
        one = { x: to.x + to.w, y: ty, dir: 1 };
      } else if (from.x + from.w < to.x) {
        const mx = Math.round((from.x + from.w + to.x) / 2);
        d = `M${from.x + from.w} ${fy} H${mx} V${ty} H${to.x}`;
        many = { x: from.x + from.w, y: fy, dir: 1 };
        one = { x: to.x, y: ty, dir: -1 };
      } else {
        // Same column (or itself): out to the right and back.
        const rx = Math.max(from.x + from.w, to.x + to.w) + 24 + 10 * k++;
        d = `M${from.x + from.w} ${fy} H${rx} V${ty} H${to.x + to.w}`;
        many = { x: from.x + from.w, y: fy, dir: 1 };
        one = { x: to.x + to.w, y: ty, dir: 1 };
      }
      refs.push({ entity: e.id, field: f.name, d, many, one });
    });
  }
  return { ...base, width: base.width + 24 + 10 * k, refs };
}
