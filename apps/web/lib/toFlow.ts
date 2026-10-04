import type { Edge, Node } from "@xyflow/react";
import {
  EMPTY_PLANE_SIZE,
  LEAF_SIZE,
  PLANE_INNER_MARGIN,
  findComponent,
  layoutMap,
  pathToString,
  planeTree,
  resolveColor,
  scopeAt,
  shapeOf,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type PlaneNode,
  type Shape,
} from "@archer/lang";
import { isIcon } from "@archer/catalog/icons";
import {
  BOX_COST,
  assignPorts,
  bendOf,
  chipWidth,
  routeEdge,
  separateBends,
  untangle,
  type EdgeRoute,
  type Obstacle,
  type Rect,
  type RoutedEdge,
  type Side,
} from "./edgeRoute";
import { outlineInset, shapeGeometry } from "./shapes";

/** One grid cell in pixels. */
export const CELL = 40;
/** Smallest a plain component can be resized to, in grid cells. */
export const MIN_LEAF_SIZE: [number, number] = [3, 2];
/** Smallest a plane can be resized to, in grid cells. */
export const MIN_PLANE_SIZE: [number, number] = [4, 3];
/** Height of a plane's title bar in pixels (see ArchPlaneNode). */
const PLANE_TITLE = 32;
/** A context node's footprint, and its distance from what the view shows, in cells. */
const CONTEXT_SIZE: [number, number] = [4, 2];
const CONTEXT_GAP = 3;
/** Prefix of a context node's id (component paths never contain a colon). */
export const CONTEXT_PREFIX = "ctx:";

/** Position-independent identity of a connection (mirrors @archer/lang connectionKey). */
const edgeKey = (c: ArchDoc["connections"][number]): string =>
  [pathToString(c.source), c.arrow, pathToString(c.target), c.type ?? "", c.label ?? ""].join("|");

/** Overlay badges drawn on a node (all optional; absent = plain node). */
export interface NodeMarks {
  /** Diff view: how this component differs from the comparison base. */
  diff?: "added" | "removed" | "changed";
  /** An agent changed this component since the user last reviewed. */
  touched?: boolean;
  /** Latest drift report says the code is out of sync with this component. */
  drift?: "missing" | "changed";
  /** The component's `src` entries, when it has any (renders a link affordance). */
  src?: readonly string[];
}

export interface ArchNodeData extends Record<string, unknown> {
  /**
   * What it is: a component (a box, or its shape), a plane (a titled region
   * things sit on), or context (a component outside the canvas that
   * something on it connects to; only shown inside a component).
   */
  kind: "component" | "plane" | "context";
  /** Its path (for context, the outside component's). */
  path: string;
  label: string;
  typeTag?: string;
  desc?: string;
  /** Drawn as this shape (lib/shapes.ts) instead of the card; components only. */
  shape?: Exclude<Shape, "box">;
  /** Components nested in it, shown when it's opened; components only. */
  childCount: number;
  payloadCount: number;
  /** Its type's color. */
  accent?: string;
  glyphKey?: string;
  /**
   * Its own color (`color <name>` or `color "#rrggbb"`, when it's one the
   * language knows) as #rrggbb, drawn instead of its type's, with the card
   * or outline tinted by it; components and context only.
   */
  color?: string;
  /**
   * The icon it picked (`icon <name>`, when the name is known), drawn instead
   * of its type's glyph or logo; components and context only.
   */
  icon?: string;
  marks?: NodeMarks;
  /**
   * Smallest size a resize may leave it, in grid cells: a plane must still
   * hold what's on it.
   */
  minSize: [number, number];
  /** Show resize handles (set by the canvas on the one selected node). */
  resizable?: boolean;
  /** Drag feedback, set by the canvas: what's dragged would land on (or in) this. */
  dropTarget?: boolean;
  /** Context only: which side of the canvas it stands on. */
  side?: "left" | "right";
}

export type ArchNode = Node<ArchNodeData>;

export interface ArchEdgeData extends Record<string, unknown> {
  /** Index into `doc.connections`. */
  index: number;
  /** Position-independent identity (`connectionKey`), which selection is keyed on. */
  key: string;
  arrow: Arrow;
  /** Protocol tag without the `@`, e.g. "http". */
  protocol?: string;
  label?: string;
  /** Payload blocks carried on the edge (message schema, request shape…). */
  payloadCount: number;
  /** Diff view: connection added, removed, or (payloads) changed relative to the base. */
  diff?: "added" | "removed" | "changed";
  /** Where the middle segment runs (`routeEdge`): x for left/right routes, y for top/bottom. */
  mid?: number;
  horizontal?: boolean;
  /**
   * Where the edge meets its boxes (`assignPorts`), relative to the handles
   * in the middles of their sides, in px: [source along, source inward,
   * target along, target inward] — along the side, then in from it to a
   * shape's outline. Unset: all 0.
   */
  ports?: [number, number, number, number];
  /**
   * Hover highlighting, set by the canvas: true while the pointer is over the
   * edge or a component it connects (its label chip shows), false while it's
   * over something else (the edge fades), unset otherwise.
   */
  lit?: boolean;
  /** One end is a context node (a component outside the canvas). */
  context?: boolean;
  /**
   * Several labelled connections between the same two boxes (nested parts
   * reaching one outside component, say) share a path: this chip's place in
   * their stack, [index, count], so the chips sit apart instead of on top of
   * each other.
   */
  stack?: [number, number];
  /** Set by the canvas while a component it connects is selected: its label chip shows. */
  endSelected?: boolean;
}

export type ArchEdge = Edge<ArchEdgeData>;

export interface ToFlowOptions {
  /** The canvas to draw: inside this component (drill-down); the top level when empty. */
  focus?: string[];
  /** Resolve a type tag to visuals (catalog + user library). */
  resolveType?: (tag: string) => { color: string; glyph: string } | undefined;
  /** Dark theme (kept for API compatibility; colors are token-driven). */
  isDark?: boolean;
  /** Per-path overlay badges (diff status, agent-touched, drift). */
  marks?: (path: string, item: ComponentNode | PlaneNode) => NodeMarks | undefined;
  /** Per-connection diff status, keyed by `connectionKey()` from @archer/lang. */
  edgeDiff?: Map<string, "added" | "removed" | "changed">;
  /**
   * Inside a component, draw the components outside it that connect in, as
   * context nodes at the canvas's sides (default true).
   */
  context?: boolean;
}

/** Whether `path` is strictly inside the component at `focus` (everything is, at the top level). */
const inside = (path: readonly string[], focus: readonly string[]) =>
  path.length > focus.length && focus.every((seg, i) => path[i] === seg);

/**
 * Compile a (fully laid out) doc into React Flow nodes/edges for one canvas:
 * the top level, or the inside of the component at `focus`.
 * - Planes are regions; what sits on one is its child node (positions are
 *   relative to it). Planes come first, so they're drawn under everything.
 * - Components are boxes. A connection to something nested in a component on
 *   this canvas is drawn to that component.
 * - Inside a component, a connection to something outside it is drawn to a
 *   context node for that outside component, beside the canvas.
 */
export function toFlow(
  doc: ArchDoc,
  opts: ToFlowOptions = {},
): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const focus = opts.focus ?? [];
  const scope = scopeAt(doc, focus);
  if (!scope) return { nodes: [], edges: [] };
  const layout = layoutMap(doc);
  const tree = planeTree(scope);
  const pre = focus.join(".");
  const pathOf = (id: string) => (pre === "" ? id : `${pre}.${id}`);

  const planes: ArchNode[] = [];
  const boxes: ArchNode[] = [];
  /** Canvas rect (px) of each node, for edge routing. */
  const rects = new Map<string, Rect & { plane: boolean; shape?: Exclude<Shape, "box"> }>();
  /** Planes each node sits on, innermost first (for edge routing). */
  const onPlanes = new Map<string, string[]>();
  const style = (item: ComponentNode | PlaneNode, path: string) => ({
    ...(item.type !== undefined
      ? (() => {
          const v = opts.resolveType?.(item.type!);
          return v ? { accent: v.color, glyphKey: v.glyph } : {};
        })()
      : {}),
    ...(() => {
      const color = item.kind === "component" ? resolveColor(item.color) : undefined;
      return color !== undefined ? { color } : {};
    })(),
    ...(() => {
      const m = opts.marks?.(path, item);
      return m && Object.keys(m).length > 0 ? { marks: m } : {};
    })(),
  });

  const walk = (on: PlaneNode | undefined, parentId: string | undefined, originPx: [number, number], chain: string[]) => {
    for (const item of tree.itemsOn(on)) {
      const path = pathOf(item.id);
      if (rects.has(path)) continue; // duplicate id (invalid doc)
      const isPlane = item.kind === "plane";
      const entry = layout.get(path);
      const at = entry?.at ?? [0, 0];
      const size = entry?.size ?? (isPlane ? EMPTY_PLANE_SIZE : LEAF_SIZE);
      const absPx: [number, number] = [originPx[0] + at[0] * CELL, originPx[1] + at[1] * CELL];
      rects.set(path, { x: absPx[0], y: absPx[1], w: size[0] * CELL, h: size[1] * CELL, plane: isPlane });
      onPlanes.set(path, chain);
      const base = {
        id: path,
        position: { x: at[0] * CELL, y: at[1] * CELL },
        width: size[0] * CELL,
        height: size[1] * CELL,
        ...(parentId !== undefined ? { parentId } : {}),
      };
      if (isPlane) {
        const minSize: [number, number] = [...MIN_PLANE_SIZE];
        for (const x of tree.itemsOn(item)) {
          const e = layout.get(pathOf(x.id));
          if (!e?.at || !e.size) continue;
          minSize[0] = Math.max(minSize[0], e.at[0] + e.size[0] + PLANE_INNER_MARGIN[0]);
          minSize[1] = Math.max(minSize[1], e.at[1] + e.size[1] + PLANE_INNER_MARGIN[1]);
        }
        planes.push({
          ...base,
          type: "archPlane",
          data: {
            kind: "plane",
            path,
            label: item.name ?? item.id,
            typeTag: item.type,
            desc: item.desc,
            childCount: 0,
            payloadCount: 0,
            minSize,
            ...style(item, path),
          },
        });
        walk(item, path, absPx, [path, ...chain]);
      } else {
        const shape = shapeOf(item);
        if (shape !== "box") rects.set(path, { ...rects.get(path)!, shape });
        boxes.push({
          ...base,
          type: "archComponent",
          data: {
            kind: "component",
            path,
            label: item.name ?? item.id,
            typeTag: item.type,
            desc: item.desc,
            ...(shape !== "box" ? { shape } : {}),
            ...(isIcon(item.icon) ? { icon: item.icon } : {}),
            childCount: item.children.length,
            payloadCount: item.payloads.length,
            minSize: [...MIN_LEAF_SIZE],
            ...style(item, path),
          },
        });
      }
    }
  };
  walk(undefined, undefined, [0, 0], []);

  // The box on this canvas each connection end is drawn as: a component here,
  // or the one here it's nested in.
  const boxOf = (p: readonly string[]): string | undefined => {
    if (!inside(p, focus)) return undefined;
    const key = p.slice(0, focus.length + 1).join(".");
    return rects.get(key)?.plane === false ? key : undefined;
  };

  // Inside a component: what outside it connects in, beside the canvas.
  const context: ArchNode[] = [];
  const contextOf = new Map<string, string>();
  if (focus.length > 0 && opts.context !== false && rects.size > 0) {
    const outside = new Map<string, { partners: string[]; incoming: boolean }>();
    for (const c of doc.connections) {
      const s = boxOf(c.source);
      const t = boxOf(c.target);
      if ((s === undefined) === (t === undefined)) continue;
      const far = pathToString(s === undefined ? c.source : c.target);
      if (!findComponent(doc, far.split("."))) continue;
      const o = outside.get(far) ?? { partners: [], incoming: true };
      o.partners.push((s ?? t)!);
      // Incoming when the outside end starts it; `--` and `<->` count as outgoing.
      if (!(s === undefined && c.arrow === "->")) o.incoming = false;
      outside.set(far, o);
    }
    if (outside.size > 0) {
      const all = [...rects.values()];
      const minX = Math.min(...all.map((r) => r.x));
      const maxX = Math.max(...all.map((r) => r.x + r.w));
      const [w, h] = CONTEXT_SIZE;
      for (const side of ["left", "right"] as const) {
        const list = [...outside.entries()]
          .filter(([, o]) => (side === "left") === o.incoming)
          .map(([far, o]) => {
            const ys = o.partners.map((p) => rects.get(p)!).map((r) => r.y + r.h / 2);
            const mid = ys.reduce((a, b) => a + b, 0) / ys.length;
            return { far, y: Math.round((mid - (h * CELL) / 2) / CELL) };
          })
          .sort((a, b) => a.y - b.y || (a.far < b.far ? -1 : 1));
        // Stack them down the side, each as near its partners' middle as it can.
        let next = -Infinity;
        const x = side === "left" ? Math.floor(minX / CELL) - CONTEXT_GAP - w : Math.ceil(maxX / CELL) + CONTEXT_GAP;
        for (const item of list) {
          const y = Math.max(item.y, next);
          next = y + h + 1;
          const node = findComponent(doc, item.far.split("."))!;
          const id = CONTEXT_PREFIX + item.far;
          contextOf.set(item.far, id);
          rects.set(id, { x: x * CELL, y: y * CELL, w: w * CELL, h: h * CELL, plane: false });
          onPlanes.set(id, []);
          context.push({
            id,
            type: "archContext",
            position: { x: x * CELL, y: y * CELL },
            width: w * CELL,
            height: h * CELL,
            draggable: false,
            selectable: false,
            connectable: false,
            deletable: false,
            data: {
              kind: "context",
              path: item.far,
              label: node.name ?? node.id,
              typeTag: node.type,
              ...(isIcon(node.icon) ? { icon: node.icon } : {}),
              side,
              childCount: node.children.length,
              payloadCount: node.payloads.length,
              minSize: [...CONTEXT_SIZE],
              ...style(node, item.far),
            },
          });
        }
      }
    }
  }

  // Edges avoid boxes and plane title bars; an unrelated plane's body is a
  // soft obstacle, so edges go around it when there is room.
  const drawn = [...rects.entries()];
  const obstaclesFor = (source: string, target: string): Obstacle[] => {
    const out: Obstacle[] = [];
    const related = new Set([...(onPlanes.get(source) ?? []), ...(onPlanes.get(target) ?? [])]);
    for (const [p, r] of drawn) {
      if (p === source || p === target) continue;
      if (!r.plane) {
        out.push({ x: r.x, y: r.y, w: r.w, h: r.h, cost: BOX_COST });
        continue;
      }
      out.push({ x: r.x, y: r.y, w: r.w, h: PLANE_TITLE, cost: BOX_COST / 4 });
      if (!related.has(p)) out.push({ x: r.x, y: r.y, w: r.w, h: r.h, cost: BOX_COST / 20 });
    }
    return out;
  };

  // Route every edge first, then untangle shared sides, give each edge its
  // own ports and keep parallel bends from merging.
  const routed: {
    c: ArchDoc["connections"][number];
    i: number;
    source: string;
    target: string;
    context: boolean;
    edge?: RoutedEdge;
  }[] = [];
  doc.connections.forEach((c, i) => {
    let source = boxOf(c.source);
    let target = boxOf(c.target);
    const isContext = (source === undefined) !== (target === undefined);
    if (isContext) {
      source ??= contextOf.get(pathToString(c.source));
      target ??= contextOf.get(pathToString(c.target));
    }
    if (source === undefined || target === undefined || source === target) return;
    const s = rects.get(source);
    const t = rects.get(target);
    if (!s || !t) {
      routed.push({ c, i, source, target, context: isContext });
      return;
    }
    const route = routeEdge(
      s,
      t,
      obstaclesFor(source, target),
      chipWidth(c.type, c.label, c.payloads.length),
    );
    const headAtTarget = c.arrow !== "--";
    routed.push({ c, i, source, target, context: isContext, edge: { source, target, s, t, route, headAtTarget } });
  });
  const withRoutes = routed.flatMap((r) => (r.edge ? [r.edge] : []));
  untangle(withRoutes, obstaclesFor);
  const ports = assignPorts(withRoutes, obstaclesFor);
  const portOf = new Map(withRoutes.map((e, i) => [e, ports[i]!]));
  separateBends(withRoutes.map((e, i) => bendOf(e.route, e.s, e.t, ports[i])));

  const pair = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const chips = new Map<string, number>();
  const labelled = (c: ArchDoc["connections"][number]) =>
    c.type !== undefined || c.label !== undefined || c.payloads.length > 0;
  for (const { c, source, target } of routed)
    if (labelled(c)) chips.set(pair(source, target), (chips.get(pair(source, target)) ?? 0) + 1);
  const stacked = new Map<string, number>();

  const edges: ArchEdge[] = [];
  for (const { c, i, source, target, context: isContext, edge } of routed) {
    const k = pair(source, target);
    const count = labelled(c) ? (chips.get(k) ?? 1) : 1;
    const slot = count > 1 ? (stacked.get(k) ?? 0) : 0;
    if (count > 1) stacked.set(k, slot + 1);
    const route: EdgeRoute | undefined = edge?.route;
    const port = edge && portOf.get(edge);
    // A port beside a shape's middle ends on its outline, which may sit
    // deeper (or shallower) than the handle's anchor there.
    const deeper = (box: string, side: Side | undefined, offset: number) => {
      const r = rects.get(box);
      if (!r?.shape || !side || offset === 0) return 0;
      const g = shapeGeometry(r.shape, r.w, r.h);
      return outlineInset(g, r.w, r.h, side, offset) - g.anchors[side];
    };
    const ends: [number, number, number, number] | undefined = port && [
      port.from,
      deeper(source, route?.from, port.from),
      port.to,
      deeper(target, route?.to, port.to),
    ];
    const sourceHandle = `s${route?.from ?? "r"}`;
    const targetHandle = `t${route?.to ?? "l"}`;
    edges.push({
      id: `c${i}:${source}->${target}`,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "archEdge",
      ...(isContext ? { reconnectable: false } : {}),
      data: {
        index: i,
        key: edgeKey(c),
        arrow: c.arrow,
        ...(c.type !== undefined ? { protocol: c.type } : {}),
        ...(c.label !== undefined ? { label: c.label } : {}),
        payloadCount: c.payloads.length,
        ...(() => {
          const d = opts.edgeDiff?.get(edgeKey(c));
          return d ? { diff: d } : {};
        })(),
        ...(route && !route.corner ? { mid: route.mid, horizontal: route.horizontal } : {}),
        ...(ends && ends.some((v) => v !== 0) ? { ports: ends } : {}),
        ...(isContext ? { context: true } : {}),
        ...(count > 1 ? { stack: [slot, count] as [number, number] } : {}),
      },
    });
  }

  return { nodes: [...planes, ...boxes, ...context], edges };
}
