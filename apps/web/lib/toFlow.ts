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
import type { EdgeTraffic } from "./traffic";

/** One grid cell in pixels. */
export const CELL = 40;

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
  /** Faded while something else is highlighted (set by the canvas, for the label chip). */
  dim?: boolean;
  /** Play traffic: the requests crossing this connection (set by the canvas). */
  traffic?: EdgeTraffic;
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

  /** Absolute center (px) of each visible node, for edge-side selection. */
  const centers = new Map<string, { x: number; y: number }>();

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
        centers.set(path, {
          x: absPx[0] + (size[0] * CELL) / 2,
          y: absPx[1] + (size[1] * CELL) / 2,
        });
        const isPlane = display === "plane" && c.children.length > 0;
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

  const edges: ArchEdge[] = [];
  doc.connections.forEach((c, i) => {
    const source = visibleAncestor.get(pathToString(c.source));
    const target = visibleAncestor.get(pathToString(c.target));
    if (source === undefined || target === undefined || source === target) return;
    // Attach the edge on the sides facing each other (dominant axis wins).
    const sc = centers.get(source);
    const tc = centers.get(target);
    let sourceHandle = "sr";
    let targetHandle = "tl";
    if (sc && tc) {
      const dx = tc.x - sc.x;
      const dy = tc.y - sc.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        sourceHandle = dx >= 0 ? "sr" : "sl";
        targetHandle = dx >= 0 ? "tl" : "tr";
      } else {
        sourceHandle = dy >= 0 ? "sb" : "st";
        targetHandle = dy >= 0 ? "tt" : "tb";
      }
    }
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
      },
    });
  });

  return { nodes, edges };
}
