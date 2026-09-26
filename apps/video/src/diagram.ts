/**
 * Real Archer diagrams, laid out for the 3D sets: the document is parsed and
 * laid out by @archer/lang, and edges are routed by the app's own router
 * (apps/web/lib/edgeRoute.ts, as `lib/svg.ts` does it), so every box, route
 * and label chip sits where the canvas would put it. Catalog glyphs, never
 * vendor logos: marketing surfaces keep glyphs, like the landing page and
 * the OG image. Pure: no DOM.
 */
import {
  autoLayout,
  effectiveDisplay,
  layoutMap,
  parse,
  pathToString,
  type ArchDoc,
  type ComponentNode,
} from "@archer/lang";
import { lookupType } from "@archer/catalog";
import {
  BOX_COST,
  bendOf,
  chipWidth,
  routeEdge,
  separateBends,
  untangle,
  type Obstacle,
  type RoutedEdge,
  type Side,
} from "../../web/lib/edgeRoute";
import { displayColor } from "../../web/lib/svg";

/** One canvas grid cell, in canvas pixels (the layout block's unit). */
const CELL = 40;

/** Untyped components' tile color (nodes.tsx NEUTRAL). */
const NEUTRAL = "#8a8479";
/** A plane's title bar height. */
const PLANE_TITLE = 32;
/** Corner radius of a stepped edge (the canvas' smooth-step borderRadius). */
const RADIUS = 8;

export interface Box {
  path: string;
  node: ComponentNode;
  x: number;
  y: number;
  w: number;
  h: number;
  plane: boolean;
  name: string;
  type?: string;
  color: string;
  glyph: string;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Edge {
  key: string;
  source: string;
  target: string;
  points: Pt[];
  d: string;
  /** Side of the target the edge arrives on. */
  to: Side;
  arrow: "->" | "--" | "<->";
  chip?: Pt & { type?: string; label?: string };
}

export interface Diagram {
  doc: ArchDoc;
  boxes: Box[];
  edges: Edge[];
  bounds: { x: number; y: number; w: number; h: number };
}

/** Orthogonal polyline → path with rounded corners. */
export function rounded(points: Pt[], r = RADIUS): string {
  const [first, ...rest] = points;
  let d = `M${first!.x} ${first!.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i]!;
    const next = rest[i + 1];
    const prev = points[i]!;
    if (!next) {
      d += `L${p.x} ${p.y}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const k = Math.min(r, inLen / 2, outLen / 2);
    if (k < 0.5) {
      d += `L${p.x} ${p.y}`;
      continue;
    }
    const a = { x: p.x - ((p.x - prev.x) / inLen) * k, y: p.y - ((p.y - prev.y) / inLen) * k };
    const b = { x: p.x + ((next.x - p.x) / outLen) * k, y: p.y + ((next.y - p.y) / outLen) * k };
    d += `L${a.x} ${a.y}Q${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  return d;
}

/** Drop repeated points and points in the middle of a straight run. */
function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

/** Lay out and route `source`: component boxes and edges in canvas pixels. */
export function layoutDiagram(source: string): Diagram {
  const parsed = parse(source);
  const doc = autoLayout(parsed.doc);
  const layout = layoutMap(doc);
  const boxes: Box[] = [];
  const visibleAncestor = new Map<string, string>();

  const walk = (
    items: ComponentNode[],
    prefix: string,
    collapsed: string | null,
    origin: [number, number],
  ) => {
    for (const c of items) {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const entry = layout.get(path);
      const display = effectiveDisplay(c, entry);
      visibleAncestor.set(path, collapsed ?? path);
      const at = entry?.at ?? [0, 0];
      const size = entry?.size ?? [4, 3];
      const abs: [number, number] = [origin[0] + at[0] * CELL, origin[1] + at[1] * CELL];
      if (collapsed === null) {
        const type = c.type ? lookupType(c.type) : undefined;
        boxes.push({
          path,
          node: c,
          x: abs[0],
          y: abs[1],
          w: size[0] * CELL,
          h: size[1] * CELL,
          plane: display === "plane" && c.children.length > 0,
          name: c.name ?? c.id,
          type: c.type,
          color: type ? displayColor(type.color, true) : NEUTRAL,
          glyph: type?.glyph ?? "box",
        });
      }
      const childCollapsed = collapsed ?? (display === "icon" && c.children.length > 0 ? path : null);
      walk(c.children, path, childCollapsed, abs);
    }
  };
  walk(doc.components, "", null, [0, 0]);

  const byPath = new Map(boxes.map((b) => [b.path, b]));
  const obstaclesFor = (source: string, target: string): Obstacle[] => {
    const list: Obstacle[] = [];
    for (const b of boxes) {
      if (b.path === source || b.path === target) continue;
      const r = { x: b.x, y: b.y, w: b.w, h: b.h };
      if (!b.plane) {
        list.push({ ...r, cost: BOX_COST });
        continue;
      }
      list.push({ ...r, h: PLANE_TITLE, cost: BOX_COST / 4 });
      if (!source.startsWith(b.path + ".") && !target.startsWith(b.path + "."))
        list.push({ ...r, cost: BOX_COST / 20 });
    }
    return list;
  };

  const routed: (RoutedEdge & { c: ArchDoc["connections"][number] })[] = [];
  for (const c of doc.connections) {
    const sb = byPath.get(visibleAncestor.get(pathToString(c.source)) ?? "");
    const tb = byPath.get(visibleAncestor.get(pathToString(c.target)) ?? "");
    if (!sb || !tb || sb === tb) continue;
    const sr = { x: sb.x, y: sb.y, w: sb.w, h: sb.h };
    const tr = { x: tb.x, y: tb.y, w: tb.w, h: tb.h };
    const route = routeEdge(sr, tr, obstaclesFor(sb.path, tb.path), chipWidth(c.type, c.label, c.payloads.length));
    routed.push({ c, source: sb.path, target: tb.path, s: sr, t: tr, route, headAtTarget: c.arrow !== "--" });
  }
  untangle(routed, obstaclesFor);
  separateBends(routed.map((e) => bendOf(e.route, e.s, e.t, e.source, e.target)));

  const leafRects = boxes.filter((b) => !b.plane);
  const chipRects: { x: number; y: number; w: number; h: number }[] = [];
  const edges: Edge[] = [];
  for (const { c, source, target, s: sr, t: tr, route } of routed) {
    let points: Pt[];
    const candidates: Pt[] = [];
    if (route.corner) {
      const right = route.from === "r";
      const down = route.to === "t";
      const p1 = { x: right ? sr.x + sr.w : sr.x, y: sr.y + sr.h / 2 };
      const p2 = { x: tr.x + tr.w / 2, y: down ? tr.y : tr.y + tr.h };
      points = [p1, { x: p2.x, y: p1.y }, p2];
      candidates.push({ x: (p1.x + p2.x) / 2, y: p1.y }, { x: p2.x, y: (p1.y + p2.y) / 2 });
    } else if (route.horizontal) {
      const right = route.from === "r";
      const p1 = { x: right ? sr.x + sr.w : sr.x, y: sr.y + sr.h / 2 };
      const p2 = { x: right ? tr.x : tr.x + tr.w, y: tr.y + tr.h / 2 };
      const mx = route.mid;
      points = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
      candidates.push(
        { x: mx, y: (p1.y + p2.y) / 2 },
        { x: (p1.x + mx) / 2, y: p1.y },
        { x: (mx + p2.x) / 2, y: p2.y },
      );
    } else {
      const down = route.from === "b";
      const p1 = { x: sr.x + sr.w / 2, y: down ? sr.y + sr.h : sr.y };
      const p2 = { x: tr.x + tr.w / 2, y: down ? tr.y : tr.y + tr.h };
      const my = route.mid;
      points = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
      candidates.push(
        { x: (p1.x + p2.x) / 2, y: my },
        { x: p1.x, y: (p1.y + my) / 2 },
        { x: p2.x, y: (my + p2.y) / 2 },
      );
    }
    points = simplify(points);
    const edge: Edge = {
      key: `${source}->${target}`,
      source,
      target,
      points,
      d: rounded(points),
      to: route.to,
      arrow: c.arrow,
    };
    if (c.type || c.label) {
      const text = [c.type, c.label].filter(Boolean).join(" · ");
      const lw = Math.round(text.length * 6 + 16);
      const clear = (p: Pt) => {
        const r = { x: p.x - lw / 2, y: p.y - 9, w: lw, h: 18 };
        const hits = (b: { x: number; y: number; w: number; h: number }) =>
          r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h;
        return !leafRects.some(hits) && !chipRects.some(hits);
      };
      const spot = candidates.find(clear) ?? candidates[0]!;
      chipRects.push({ x: spot.x - lw / 2, y: spot.y - 9, w: lw, h: 18 });
      edge.chip = { ...spot, type: c.type, label: c.label };
    }
    edges.push(edge);
  }

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { doc, boxes, edges, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}
