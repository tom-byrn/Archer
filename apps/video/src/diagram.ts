/**
 * Real Archer diagrams, animatable: the document is parsed and laid out by
 * @archer/lang, edges are routed by the app's own router (apps/web/lib/
 * edgeRoute.ts, as `lib/svg.ts` does it), and each box, edge and chip comes
 * out as its own element, drawn the way the canvas draws it
 * (components/nodes.tsx). Catalog glyphs, never vendor logos: marketing
 * surfaces keep glyphs, like the landing page and the OG image.
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
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
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
import { CELL } from "./camera";
import { h, s, svgFrom } from "./dom";
import { gsap, master } from "./engine";

/** Untyped components' tile color (nodes.tsx NEUTRAL). */
const NEUTRAL = "#8a8479";
/** A plane's title bar height. */
const PLANE_TITLE = 32;
/** Corner radius of a stepped edge (the canvas' smooth-step borderRadius). */
const RADIUS = 8;
/** Arrowhead half-width (nodes.tsx ARROW). */
const ARROW = 7;

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

const alpha = (hex: string, a: number): string =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;

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

/* ------------------------------------------------------------------ DOM */

export function glyph(key: string, color?: string): SVGSVGElement {
  const el = svgFrom(`<svg viewBox="${GLYPH_VIEWBOX}">${GLYPHS[key] ?? GLYPHS.box!}</svg>`);
  if (color) el.style.color = color;
  return el;
}

/** A card node (nodes.tsx ArchCardNode) for `box`, positioned in canvas pixels. */
export function nodeEl(box: Pick<Box, "x" | "y" | "w" | "h" | "name" | "type" | "color" | "glyph">): HTMLDivElement {
  return h(
    "div",
    { class: "node", style: { left: box.x, top: box.y, width: box.w, height: box.h } },
    h("div", { class: "tile", style: { background: alpha(box.color, 0.14) } }, glyph(box.glyph, box.color)),
    h(
      "div",
      { class: "label" },
      h("div", { class: "name" }, box.name),
      h("div", { class: "sub" }, box.type ? h("span", { class: "mono" }, box.type) : "component"),
    ),
  );
}

function planeEl(box: Box): HTMLDivElement {
  const typed = box.type !== undefined;
  return h(
    "div",
    {
      class: "plane",
      style: {
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderColor: alpha(box.color, 0.35),
        background: typed ? alpha(box.color, 0.05) : "rgba(28, 30, 33, 0.5)",
      },
    },
    h(
      "div",
      { class: "bar", style: { borderBottomColor: alpha(box.color, 0.2) } },
      glyph(box.glyph, typed ? box.color : "var(--ink-3)"),
      h("span", { class: "name" }, box.name),
      box.type ? h("span", { class: "type" }, box.type) : null,
    ),
  );
}

/** Arrowhead polygon pointing into the target at `tip`, arriving on side `side` (nodes.tsx). */
export function arrowPoints(tip: Pt, side: Side): string {
  const { x, y } = tip;
  switch (side) {
    case "l":
      return `${x},${y} ${x - ARROW * 2},${y - ARROW} ${x - ARROW * 2},${y + ARROW}`;
    case "r":
      return `${x},${y} ${x + ARROW * 2},${y - ARROW} ${x + ARROW * 2},${y + ARROW}`;
    case "t":
      return `${x},${y} ${x - ARROW},${y - ARROW * 2} ${x + ARROW},${y - ARROW * 2}`;
    default:
      return `${x},${y} ${x - ARROW},${y + ARROW * 2} ${x + ARROW},${y + ARROW * 2}`;
  }
}

export function chipEl(chip: NonNullable<Edge["chip"]>): HTMLDivElement {
  const el = h(
    "div",
    { class: "chip", style: { left: chip.x, top: chip.y } },
    chip.type ? h("span", { class: "t" }, chip.type) : null,
    chip.type && chip.label ? h("span", { class: "dot" }, "·") : null,
    chip.label ? h("span", { class: "l" }, chip.label) : null,
  );
  // Centred on its point; GSAP owns the transform so scale tweens keep it.
  gsap.set(el, { xPercent: -50, yPercent: -50 });
  return el;
}

export interface EdgeView {
  edge: Edge;
  path: SVGPathElement;
  head: SVGPolygonElement | null;
  chip: HTMLDivElement | null;
}

export interface DiagramView {
  diagram: Diagram;
  root: HTMLDivElement;
  nodes: Map<string, HTMLDivElement>;
  planes: Map<string, HTMLDivElement>;
  edges: Map<string, EdgeView>;
  /** Everything laid over the nodes (badges, overlays) goes here. */
  top: HTMLDivElement;
}

export function renderDiagram(diagram: Diagram, opts: { chips?: boolean } = {}): DiagramView {
  const root = h("div", { class: "abs dg" });
  const planesLayer = h("div", { class: "abs" });
  const svg = s("svg", {
    class: "edges",
    width: diagram.bounds.x + diagram.bounds.w + 200,
    height: diagram.bounds.y + diagram.bounds.h + 200,
  });
  const nodesLayer = h("div", { class: "abs" });
  const chipsLayer = h("div", { class: "abs" });
  const top = h("div", { class: "abs" });
  root.append(planesLayer, svg, nodesLayer, chipsLayer, top);

  const nodes = new Map<string, HTMLDivElement>();
  const planes = new Map<string, HTMLDivElement>();
  for (const b of diagram.boxes) {
    if (b.plane) {
      const el = planeEl(b);
      planes.set(b.path, el);
      planesLayer.append(el);
    } else {
      const el = nodeEl(b);
      nodes.set(b.path, el);
      nodesLayer.append(el);
    }
  }
  const edges = new Map<string, EdgeView>();
  for (const e of diagram.edges) {
    const path = s("path", { class: "edge", d: e.d });
    const tip = e.points[e.points.length - 1]!;
    const head = e.arrow === "--" ? null : s("polygon", { class: "head", points: arrowPoints(tip, e.to) });
    svg.append(path);
    if (head) svg.append(head);
    const chip = opts.chips !== false && e.chip ? chipEl(e.chip) : null;
    if (chip) chipsLayer.append(chip);
    edges.set(e.key, { edge: e, path, head, chip });
  }
  return { diagram, root, nodes, planes, edges, top };
}

/** Center of a box in canvas pixels. */
export function centerOf(view: DiagramView, path: string): Pt {
  const b = view.diagram.boxes.find((x) => x.path === path);
  if (!b) throw new Error(`no box ${path}`);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/* ------------------------------------------------------------ Animation */

/** Hide everything, ready to be built up by `popNode` / `drawEdge`. */
export function hideAll(view: DiagramView): void {
  gsap.set([...view.nodes.values(), ...view.planes.values()], { opacity: 0, scale: 0.6 });
  for (const e of view.edges.values()) {
    gsap.set(e.path, { drawSVG: "0% 0%" });
    if (e.head) gsap.set(e.head, { opacity: 0, scale: 0, svgOrigin: headOrigin(e) });
    if (e.chip) gsap.set(e.chip, { opacity: 0, scale: 0.5 });
  }
}

const headOrigin = (e: EdgeView): string => {
  const tip = e.edge.points[e.edge.points.length - 1]!;
  return `${tip.x} ${tip.y}`;
};

/** A component lands: it grows in with a little overshoot. */
export function popNode(view: DiagramView, path: string, t: number, dur = 0.5): void {
  const el = view.nodes.get(path) ?? view.planes.get(path);
  if (!el) throw new Error(`no node ${path}`);
  master.fromTo(
    el,
    { opacity: 0, scale: 0.6 },
    { opacity: 1, scale: 1, duration: dur, ease: "back.out(2.2)", immediateRender: false },
    t,
  );
}

/** An edge draws from its source to its target, then its head and chip pop. */
export function drawEdge(view: DiagramView, key: string, t: number, dur = 0.35): number {
  const e = view.edges.get(key);
  if (!e) throw new Error(`no edge ${key}`);
  master.fromTo(
    e.path,
    { drawSVG: "0% 0%" },
    { drawSVG: "0% 100%", duration: dur, ease: "power2.inOut", immediateRender: false },
    t,
  );
  if (e.head)
    master.fromTo(
      e.head,
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(3)", immediateRender: false },
      t + dur - 0.06,
    );
  if (e.chip)
    master.fromTo(
      e.chip,
      { opacity: 0, scale: 0.5 },
      { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.5)", immediateRender: false },
      t + dur * 0.6,
    );
  return t + dur;
}
