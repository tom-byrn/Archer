import type { Edge, Node } from "@xyflow/react";
import {
  effectiveDisplay,
  findComponent,
  layoutMap,
  pathToString,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type DisplayMode,
} from "@archer/lang";
import {
  BOX_COST,
  bendOf,
  chipWidth,
  routeEdge,
  separateBends,
  untangle,
  type EdgeRoute,
  type Obstacle,
  type Rect,
  type RoutedEdge,
} from "./edgeRoute";

/** One grid cell in pixels. */
export const CELL = 40;
/** Height of a plane's title bar in pixels (see ArchPlaneNode). */
const PLANE_TITLE = 32;

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
  /** `src` field is set (renders a link affordance). */
  src?: string;
}

export interface ArchNodeData extends Record<string, unknown> {
  path: string;
  label: string;
  typeTag?: string;
  desc?: string;
  display: DisplayMode;
  childCount: number;
  payloadCount: number;
  accent?: string;
  glyphKey?: string;
  marks?: NodeMarks;
}

export type ArchNode = Node<ArchNodeData>;

export interface ArchEdgeData extends Record<string, unknown> {
  /** Index into `doc.connections`. */
  index: number;
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
}

export type ArchEdge = Edge<ArchEdgeData>;

export interface ToFlowOptions {
  /** Render only this component's subtree (drill-down view). */
  focus?: string[];
  /** Resolve a type tag to visuals (catalog + user library). */
  resolveType?: (tag: string) => { color: string; glyph: string } | undefined;
  /** OS dark mode (kept for API compatibility; colors are token-driven). */
  isDark?: boolean;
  /** Per-path overlay badges (diff status, agent-touched, drift). */
  marks?: (path: string, component: ComponentNode) => NodeMarks | undefined;
  /** Per-connection diff status, keyed by `connectionKey()` from @archer/lang. */
  edgeDiff?: Map<string, "added" | "removed" | "changed">;
}

/**
 * Compile a (fully laid out) doc into React Flow nodes/edges.
 * - `plane` containers render children inside them (positions are parent-relative).
 * - `icon` containers collapse: descendants are hidden and their edges remap to
 *   the collapsed ancestor.
 * - With `focus`, the focused component's children become the view's roots and
 *   only edges internal to the subtree are drawn.
 */
export function toFlow(
  doc: ArchDoc,
  opts: ToFlowOptions = {},
): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const layout = layoutMap(doc);
  const nodes: ArchNode[] = [];
  /** path -> deepest visible ancestor path (itself when visible). */
  const visibleAncestor = new Map<string, string>();

  const focus = opts.focus ?? [];
  const rootPrefix = focus.join(".");
  const rootItems =
    focus.length === 0 ? doc.components : (findComponent(doc, focus)?.children ?? []);

  /** Absolute rect (px) of each visible node, for edge routing. */
  const rects = new Map<string, Rect & { plane: boolean }>();

  const walk = (
    items: ComponentNode[],
    prefix: string,
    parentVisible: boolean,
    collapsedAncestor: string | null,
    originPx: [number, number],
  ) => {
    for (const c of items) {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const entry = layout.get(path);
      const display = effectiveDisplay(c, entry);
      const isVisible = parentVisible && collapsedAncestor === null;
      visibleAncestor.set(path, collapsedAncestor ?? path);

      const at = entry?.at ?? [0, 0];
      const size = entry?.size ?? [4, 3];
      const absPx: [number, number] = [
        originPx[0] + at[0] * CELL,
        originPx[1] + at[1] * CELL,
      ];
      if (isVisible) {
        const isPlane = display === "plane" && c.children.length > 0;
        rects.set(path, {
          x: absPx[0],
          y: absPx[1],
          w: size[0] * CELL,
          h: size[1] * CELL,
          plane: isPlane,
        });
        nodes.push({
          id: path,
          type: isPlane ? "archPlane" : "archComponent",
          position: { x: at[0] * CELL, y: at[1] * CELL },
          width: size[0] * CELL,
          height: size[1] * CELL,
          ...(prefix !== rootPrefix ? { parentId: prefix } : {}),
          data: {
            path,
            label: c.name ?? c.id,
            typeTag: c.type,
            desc: c.desc,
            display,
            childCount: c.children.length,
            payloadCount: c.payloads.length,
            ...(c.type !== undefined ? (() => {
              const v = opts.resolveType?.(c.type!);
              return v ? { accent: v.color, glyphKey: v.glyph } : {};
            })() : {}),
            ...(() => {
              const m = opts.marks?.(path, c);
              return m && Object.keys(m).length > 0 ? { marks: m } : {};
            })(),
          },
        });
      }

      const childCollapsed =
        collapsedAncestor ??
        (display === "icon" && c.children.length > 0 ? path : null);
      walk(c.children, path, isVisible, childCollapsed, absPx);
    }
  };
  walk(rootItems, rootPrefix, true, null, [0, 0]);

  // Edges avoid boxes and plane title bars; an unrelated plane's body is a
  // soft obstacle, so edges go around it when there is room.
  const drawn = [...rects.entries()];
  const obstaclesFor = (source: string, target: string): Obstacle[] => {
    const out: Obstacle[] = [];
    for (const [p, r] of drawn) {
      if (p === source || p === target) continue;
      if (!r.plane) {
        out.push({ x: r.x, y: r.y, w: r.w, h: r.h, cost: BOX_COST });
        continue;
      }
      out.push({ x: r.x, y: r.y, w: r.w, h: PLANE_TITLE, cost: BOX_COST / 4 });
      if (!source.startsWith(p + ".") && !target.startsWith(p + "."))
        out.push({ x: r.x, y: r.y, w: r.w, h: r.h, cost: BOX_COST / 20 });
    }
    return out;
  };

  // Route every edge first, then untangle shared handles and keep parallel
  // bends from merging.
  const routed: {
    c: ArchDoc["connections"][number];
    i: number;
    source: string;
    target: string;
    edge?: RoutedEdge;
  }[] = [];
  doc.connections.forEach((c, i) => {
    const source = visibleAncestor.get(pathToString(c.source));
    const target = visibleAncestor.get(pathToString(c.target));
    if (source === undefined || target === undefined || source === target) return;
    const s = rects.get(source);
    const t = rects.get(target);
    if (!s || !t) {
      routed.push({ c, i, source, target });
      return;
    }
    const route = routeEdge(
      s,
      t,
      obstaclesFor(source, target),
      chipWidth(c.type, c.label, c.payloads.length),
    );
    const headAtTarget = c.arrow !== "--";
    routed.push({ c, i, source, target, edge: { source, target, s, t, route, headAtTarget } });
  });
  const withRoutes = routed.flatMap((r) => (r.edge ? [r.edge] : []));
  untangle(withRoutes, obstaclesFor);
  separateBends(withRoutes.map((e) => bendOf(e.route, e.s, e.t, e.source, e.target)));

  const edges: ArchEdge[] = [];
  for (const { c, i, source, target, edge } of routed) {
    const route: EdgeRoute | undefined = edge?.route;
    const sourceHandle = `s${route?.from ?? "r"}`;
    const targetHandle = `t${route?.to ?? "l"}`;
    edges.push({
      id: `c${i}:${source}->${target}`,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "archEdge",
      data: {
        index: i,
        arrow: c.arrow,
        ...(c.type !== undefined ? { protocol: c.type } : {}),
        ...(c.label !== undefined ? { label: c.label } : {}),
        payloadCount: c.payloads.length,
        ...(() => {
          const d = opts.edgeDiff?.get(edgeKey(c));
          return d ? { diff: d } : {};
        })(),
        ...(route && !route.corner ? { mid: route.mid, horizontal: route.horizontal } : {}),
      },
    });
  }

  return { nodes, edges };
}
