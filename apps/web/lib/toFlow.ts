import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import {
  effectiveDisplay,
  layoutMap,
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type DisplayMode,
} from "@archlang/lang";

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
}

export type ArchNode = Node<ArchNodeData>;

/**
 * Compile a (fully laid out) doc into React Flow nodes/edges.
 * - `plane` containers render children inside them (positions are parent-relative).
 * - `icon` containers collapse: descendants are hidden and their edges remap to
 *   the collapsed ancestor.
 */
export function toFlow(doc: ArchDoc): { nodes: ArchNode[]; edges: Edge[] } {
  const layout = layoutMap(doc);
  const nodes: ArchNode[] = [];
  /** path -> deepest visible ancestor path (itself when visible). */
  const visibleAncestor = new Map<string, string>();

  const walk = (
    items: ComponentNode[],
    prefix: string,
    parentVisible: boolean,
    collapsedAncestor: string | null,
  ) => {
    for (const c of items) {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const entry = layout.get(path);
      const display = effectiveDisplay(c, entry);
      const isVisible = parentVisible && collapsedAncestor === null;
      visibleAncestor.set(path, collapsedAncestor ?? path);

      if (isVisible) {
        const at = entry?.at ?? [0, 0];
        const size = entry?.size ?? [4, 3];
        const isPlane = display === "plane" && c.children.length > 0;
        nodes.push({
          id: path,
          type: isPlane ? "archPlane" : "archComponent",
          position: { x: at[0] * CELL, y: at[1] * CELL },
          width: size[0] * CELL,
          height: size[1] * CELL,
          ...(prefix !== "" ? { parentId: prefix } : {}),
          draggable: false,
          data: {
            path,
            label: c.name ?? c.id,
            typeTag: c.type,
            desc: c.desc,
            display,
            childCount: c.children.length,
            payloadCount: c.payloads.length,
          },
        });
      }

      const childCollapsed =
        collapsedAncestor ??
        (display === "icon" && c.children.length > 0 ? path : null);
      walk(c.children, path, isVisible, childCollapsed);
    }
  };
  walk(doc.components, "", true, null);

  const edges: Edge[] = [];
  doc.connections.forEach((c, i) => {
    const source = visibleAncestor.get(pathToString(c.source));
    const target = visibleAncestor.get(pathToString(c.target));
    if (source === undefined || target === undefined || source === target) return;
    const labelParts = [
      ...(c.type !== undefined ? [`@${c.type}`] : []),
      ...(c.label !== undefined ? [c.label] : []),
    ];
    edges.push({
      id: `c${i}:${source}->${target}`,
      source,
      target,
      type: "smoothstep",
      label: labelParts.length > 0 ? labelParts.join("  ") : undefined,
      labelStyle: { fontSize: 11, fill: "#475569" },
      labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.9 },
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
