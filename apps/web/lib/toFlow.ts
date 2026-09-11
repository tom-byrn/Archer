import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import {
  effectiveDisplay,
  findComponent,
  layoutMap,
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type DisplayMode,
} from "@archer/lang";

/** One grid cell in pixels. */
export const CELL = 40;

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
}

export type ArchNode = Node<ArchNodeData>;

export interface ToFlowOptions {
  /** Render only this component's subtree (drill-down view). */
  focus?: string[];
  /** Resolve a type tag to visuals (catalog + user library). */
  resolveType?: (tag: string) => { color: string; glyph: string } | undefined;
  /** OS dark mode — edge labels are drawn with inline colors. */
  isDark?: boolean;
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
): { nodes: ArchNode[]; edges: Edge[] } {
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

  const edges: Edge[] = [];
  doc.connections.forEach((c, i) => {
    const source = visibleAncestor.get(pathToString(c.source));
    const target = visibleAncestor.get(pathToString(c.target));
    if (source === undefined || target === undefined || source === target) return;
    const labelParts = [
      ...(c.type !== undefined ? [`@${c.type}`] : []),
      ...(c.label !== undefined ? [c.label] : []),
    ];
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
      type: "smoothstep",
      label: labelParts.length > 0 ? labelParts.join("  ") : undefined,
      labelStyle: { fontSize: 11, fill: opts.isDark ? "#cbd5e1" : "#475569" },
      labelBgStyle: { fill: opts.isDark ? "#12151c" : "#f8fafc", fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      ...(c.arrow !== "--"
        ? { markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" } }
        : {}),
      ...(c.arrow === "<->"
        ? { markerStart: { type: MarkerType.ArrowClosed, color: "#64748b" } }
        : {}),
      data: { index: i },
    });
  });

  return { nodes, edges };
}
