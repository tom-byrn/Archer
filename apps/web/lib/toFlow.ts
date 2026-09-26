import type { Edge, Node } from "@xyflow/react";
import {
  PLANE_INNER_MARGIN,
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
  groupEdges,
  placeChips,
  routeEdge,
  routePieces,
  separateBends,
  untangle,
  type ChipSpot,
  type EdgeGroup,
  type EdgeRoute,
  type Obstacle,
  type Rect,
  type RoutedEdge,
} from "./edgeRoute";

/** One grid cell in pixels. */
export const CELL = 40;
/** Smallest a plain component can be resized to, in grid cells. */
export const MIN_LEAF_SIZE: [number, number] = [3, 2];
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
  /**
   * Smallest size a resize may leave it, in grid cells: a plane must still
   * hold its children.
   */
  minSize: [number, number];
  /** Show resize handles (set by the canvas on the one selected node). */
  resizable?: boolean;
  /**
   * Drilled in: this box stands for a component outside the view that connects
   * into it (its id is `CONTEXT` + its path). `where` names its parent.
   */
  context?: { where?: string };
}

export type ArchNode = Node<ArchNodeData>;

/**
 * Boxes (not planes) sit above every edge, so a line the router can't keep
 * clear of a box passes behind it rather than across its label. React Flow
 * lifts an edge to the z of a nested end (a plane's depth); this is above that.
 */
const BOX_Z = 3;

/** Id prefix of the context boxes drawn around a drilled-into view. */
export const CONTEXT = "ctx:";
/** A context box's size, in grid cells. */
const CONTEXT_SIZE: [number, number] = [4, 2];

export interface ArchEdgeData extends Record<string, unknown> {
  /** The connections this edge draws, as indices into `doc.connections` (see `groupEdges`). */
  indices: number[];
  /** Their position-independent identities (`connectionKey`), which selection is keyed on. */
  keys: string[];
  arrow: Arrow;
  /** Protocol tag without the `@`, e.g. "http" (a summary's: only when all share it). */
  protocol?: string;
  label?: string;
  /** Payload blocks carried on the edge (message schema, request shape…). */
  payloadCount: number;
  /**
   * An end is a collapsed container standing in for a component inside it.
   * `members` then spells out each connection drawn ("Worker → Postgres · sql").
   */
  summary?: boolean;
  members?: string[];
  /** Diff view: connection added, removed, or (payloads) changed relative to the base. */
  diff?: "added" | "removed" | "changed";
  /** Where the middle segment runs (`routeEdge`): x for left/right routes, y for top/bottom. */
  mid?: number;
  horizontal?: boolean;
  /** Where its chip sits along the route (`placeChips`). */
  chip?: ChipSpot;
  /** Set by the canvas while something is hovered: part of it, or faded out. */
  emphasis?: "lit" | "dim";
}

export type ArchEdge = Edge<ArchEdgeData>;

export interface ToFlowOptions {
  /** Render only this component's subtree (drill-down view). */
  focus?: string[];
  /** Resolve a type tag to visuals (catalog + user library). */
  resolveType?: (tag: string) => { color: string; glyph: string } | undefined;
  /** Dark theme (kept for API compatibility; colors are token-driven). */
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
 *   the collapsed ancestor, merged into one edge per pair of boxes (`groupEdges`).
 * - With `focus`, the focused component's children become the view's roots.
 *   Whatever outside connects to them is drawn beside the view as a context
 *   box, the way the level it lives on draws it (a collapsed container stands
 *   in for what's inside it), so the view doesn't lose its place in the whole.
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
  /** Display name of every component in view, drawn or folded away (edge tooltips). */
  const names = new Map<string, string>();

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
      names.set(path, c.name ?? c.id);

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
        const minSize: [number, number] = [...MIN_LEAF_SIZE];
        if (isPlane) {
          for (const child of c.children) {
            const e = layout.get(`${path}.${child.id}`);
            if (!e?.at || !e.size) continue;
            minSize[0] = Math.max(minSize[0], e.at[0] + e.size[0] + PLANE_INNER_MARGIN[0]);
            minSize[1] = Math.max(minSize[1], e.at[1] + e.size[1] + PLANE_INNER_MARGIN[1]);
          }
        }
        nodes.push({
          id: path,
          type: isPlane ? "archPlane" : "archComponent",
          ...(isPlane ? {} : { zIndex: BOX_Z }),
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
            minSize,
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

  /** The context box for a path outside the focused container (undefined: it's that container, or around it). */
  const contextOf = (path: string): string | undefined => {
    const segs = path.split(".");
    let k = 0;
    while (k < focus.length && k < segs.length && segs[k] === focus[k]) k++;
    if (k >= segs.length) return undefined;
    // From where it branches off the focus down, through every open plane.
    let box = segs.slice(0, k + 1);
    for (;;) {
      const c = findComponent(doc, box);
      if (!c || box.length >= segs.length || c.children.length === 0) break;
      if (effectiveDisplay(c, layout.get(box.join("."))) !== "plane") break;
      box = segs.slice(0, box.length + 1);
    }
    return CONTEXT + box.join(".");
  };
  const groups = groupEdges(
    doc.connections,
    (p, other) =>
      visibleAncestor.get(p) ??
      (focus.length > 0 && visibleAncestor.has(other) ? contextOf(p) : undefined),
  );
  if (focus.length > 0 && rects.size > 0) placeContext(doc, layout, groups, rects, nodes, opts);

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
  const routed = groups.map((g) => {
    const s = rects.get(g.source);
    const t = rects.get(g.target);
    if (!s || !t) return { g };
    const route = routeEdge(s, t, obstaclesFor(g.source, g.target), chipWidth(g));
    const edge: RoutedEdge = {
      source: g.source,
      target: g.target,
      s,
      t,
      route,
      headAtTarget: g.arrow !== "--",
    };
    return { g, edge };
  });
  const withRoutes = routed.flatMap((r) => (r.edge ? [r.edge] : []));
  untangle(withRoutes, obstaclesFor);
  separateBends(withRoutes.map((e) => bendOf(e.route, e.s, e.t, e.source, e.target)));
  const chips = placeChips(
    routed.map(({ g, edge }) => ({
      pieces: edge ? routePieces(edge.route, edge.s, edge.t) : [],
      width: chipWidth(g),
    })),
    drawn.filter(([, r]) => !r.plane).map(([, r]) => r),
    drawn.filter(([, r]) => r.plane).map(([, r]) => ({ ...r, h: PLANE_TITLE })),
  );

  const describe = (c: ArchDoc["connections"][number]) => {
    const name = (p: string[]) =>
      names.get(pathToString(p)) ?? findComponent(doc, p)?.name ?? pathToString(p);
    const arrow = c.arrow === "->" ? "→" : c.arrow === "<->" ? "↔" : "—";
    return [`${name(c.source)} ${arrow} ${name(c.target)}`, c.type, c.label]
      .filter((p) => p !== undefined)
      .join(" · ");
  };

  const edges: ArchEdge[] = [];
  for (const [n, { g, edge }] of routed.entries()) {
    const route: EdgeRoute | undefined = edge?.route;
    const chip = chips[n];
    const conns = g.indices.map((i) => doc.connections[i]!);
    const keys = conns.map(edgeKey);
    const diffs = new Set(keys.map((k) => opts.edgeDiff?.get(k)));
    const diff = diffs.size === 1 ? [...diffs][0] : "changed";
    edges.push({
      id: `c${g.indices[0]}:${g.source}->${g.target}`,
      source: g.source,
      target: g.target,
      sourceHandle: `s${route?.from ?? "r"}`,
      targetHandle: `t${route?.to ?? "l"}`,
      type: "archEdge",
      // Several connections drawn as one: re-point them by opening the container.
      ...(g.indices.length > 1 ? { reconnectable: false } : {}),
      data: {
        indices: g.indices,
        keys,
        arrow: g.arrow,
        ...(g.type !== undefined ? { protocol: g.type } : {}),
        ...(g.label !== undefined ? { label: g.label } : {}),
        payloadCount: g.payloads,
        ...(g.summary ? { summary: true, members: conns.map(describe) } : {}),
        ...(diff ? { diff } : {}),
        ...(route && !route.corner ? { mid: route.mid, horizontal: route.horizontal } : {}),
        ...(chip ? { chip } : {}),
      },
    });
  }

  return { nodes, edges };
}

/**
 * Put the context boxes of a drilled-into view beside it: a box that only
 * feeds into the view on its left, the rest on its right, each level with the
 * middle of what it connects to, stacked without overlapping, far enough out
 * for the widest label between them.
 */
function placeContext(
  doc: ArchDoc,
  layout: ReturnType<typeof layoutMap>,
  groups: readonly EdgeGroup[],
  rects: Map<string, Rect & { plane: boolean }>,
  nodes: ArchNode[],
  opts: ToFlowOptions,
) {
  const links = new Map<string, { inside: string[]; feeds: boolean; fed: boolean; chip: number }>();
  for (const g of groups) {
    const fromOutside = g.source.startsWith(CONTEXT);
    if (fromOutside === g.target.startsWith(CONTEXT)) continue;
    const id = fromOutside ? g.source : g.target;
    const link = links.get(id) ?? { inside: [], feeds: false, fed: false, chip: 0 };
    links.set(id, link);
    link.inside.push(fromOutside ? g.target : g.source);
    if (fromOutside || g.arrow === "<->") link.feeds = true;
    if (!fromOutside || g.arrow === "<->") link.fed = true;
    link.chip = Math.max(link.chip, chipWidth(g));
  }
  if (links.size === 0) return;

  const view = [...rects.values()];
  const left = Math.min(...view.map((r) => r.x));
  const right = Math.max(...view.map((r) => r.x + r.w));
  const [w, h] = [CONTEXT_SIZE[0] * CELL, CONTEXT_SIZE[1] * CELL];
  const snap = (v: number) => Math.round(v / CELL) * CELL;

  for (const west of [true, false]) {
    const side = [...links].filter(([, l]) => (l.feeds && !l.fed) === west);
    if (side.length === 0) continue;
    const gap = snap(Math.max(4 * CELL, ...side.map(([, l]) => l.chip + 2 * CELL)) + CELL / 2);
    const x = west ? left - gap - w : right + gap;
    const wanted = side
      .map(([id, l]) => {
        const ys = l.inside
          .map((p) => rects.get(p))
          .filter((r): r is Rect & { plane: boolean } => r !== undefined)
          .map((r) => r.y + r.h / 2)
          .sort((a, b) => a - b);
        return { id, y: snap((ys[Math.floor((ys.length - 1) / 2)] ?? 0) - h / 2) };
      })
      .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    let floor = -Infinity;
    for (const { id, y: want } of wanted) {
      const y = Math.max(want, floor);
      floor = y + h + CELL;
      const segs = id.slice(CONTEXT.length).split(".");
      const c = findComponent(doc, segs);
      if (!c) continue;
      const parent = segs.length > 1 ? findComponent(doc, segs.slice(0, -1)) : undefined;
      const look = c.type !== undefined ? opts.resolveType?.(c.type) : undefined;
      rects.set(id, { x, y, w, h, plane: false });
      nodes.push({
        id,
        type: "archContext",
        zIndex: BOX_Z,
        position: { x, y },
        width: w,
        height: h,
        draggable: false,
        selectable: false,
        deletable: false,
        data: {
          path: segs.join("."),
          label: c.name ?? c.id,
          typeTag: c.type,
          desc: c.desc,
          display: effectiveDisplay(c, layout.get(segs.join("."))),
          childCount: c.children.length,
          payloadCount: c.payloads.length,
          minSize: [...MIN_LEAF_SIZE],
          context: parent ? { where: parent.name ?? parent.id } : {},
          ...(look ? { accent: look.color, glyphKey: look.glyph } : {}),
        },
      });
    }
  }
}
