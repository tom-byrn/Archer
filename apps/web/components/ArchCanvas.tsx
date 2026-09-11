"use client";

import { useCallback, useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type OnConnect,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { CELL, type ArchNode } from "@/lib/toFlow";
import { DND_MIME } from "./Palette";
import { nodeTypes } from "./nodes";

export interface DragEndInfo {
  topLeft: { x: number; y: number };
  center: { x: number; y: number };
  sizeGrid: [number, number];
}

export interface CanvasCallbacks {
  onNodeDragEnd: (path: string, info: DragEndInfo) => void;
  onDrillIn: (path: string) => void;
  onSelectNode: (path: string) => void;
  onSelectEdge: (index: number) => void;
  onClearSelection: () => void;
  onConnect: (source: string, target: string) => void;
  onDeleteNodes: (paths: string[]) => void;
  onDeleteEdges: (indices: number[]) => void;
  onDropType: (tag: string | undefined, flowPos: { x: number; y: number }) => void;
}

function ExportButton({ title }: { title: string }) {
  const { getNodes } = useReactFlow();
  const onExport = useCallback(() => {
    const bounds = getNodesBounds(getNodes());
    const width = Math.min(2400, Math.max(800, Math.ceil(bounds.width) + 160));
    const height = Math.min(1800, Math.max(600, Math.ceil(bounds.height) + 160));
    const viewport = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el) return;
    void toPng(el, {
      backgroundColor: "#f1f5f9",
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    }).then((dataUrl) => {
      const a = document.createElement("a");
      a.download = `${title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase() || "archlang"}.png`;
      a.href = dataUrl;
      a.click();
    });
  }, [getNodes, title]);

  return (
    <button
      onClick={onExport}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      Export PNG
    </button>
  );
}

function CanvasInner({
  nodes: derivedNodes,
  edges: derivedEdges,
  title,
  callbacks,
}: {
  nodes: ArchNode[];
  edges: Edge[];
  title: string;
  callbacks: CanvasCallbacks;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);
  useEffect(() => setEdges(derivedEdges), [derivedEdges, setEdges]);

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      // Absolute position within the current view = position + ancestor chain.
      const byId = new Map(nodes.map((n) => [n.id, n]));
      let x = node.position.x;
      let y = node.position.y;
      let parent = node.parentId ? byId.get(node.parentId) : undefined;
      while (parent) {
        x += parent.position.x;
        y += parent.position.y;
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      const w = node.width ?? node.measured?.width ?? CELL * 4;
      const h = node.height ?? node.measured?.height ?? CELL * 3;
      callbacks.onNodeDragEnd(node.id, {
        topLeft: { x, y },
        center: { x: x + w / 2, y: y + h / 2 },
        sizeGrid: [Math.round(w / CELL), Math.round(h / CELL)],
      });
    },
    [callbacks, nodes],
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (conn.source && conn.target) callbacks.onConnect(conn.source, conn.target);
    },
    [callbacks],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => callbacks.onDeleteNodes(deleted.map((n) => n.id)),
    [callbacks],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) =>
      callbacks.onDeleteEdges(
        deleted
          .map((e) => (e.data as { index?: number } | undefined)?.index)
          .filter((i): i is number => i !== undefined),
      ),
    [callbacks],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const tag = e.dataTransfer.getData(DND_MIME);
      if (tag === null) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      callbacks.onDropType(tag === "" ? undefined : tag, pos);
    },
    [callbacks, screenToFlowPosition],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onNodeClick={(_e, n) => callbacks.onSelectNode(n.id)}
      onNodeDoubleClick={(_e, n) => callbacks.onDrillIn(n.id)}
      onEdgeClick={(_e, edge) => {
        const i = (edge.data as { index?: number } | undefined)?.index;
        if (i !== undefined) callbacks.onSelectEdge(i);
      }}
      onPaneClick={() => callbacks.onClearSelection()}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
      minZoom={0.15}
      snapToGrid
      snapGrid={[CELL, CELL]}
      connectionRadius={36}
      deleteKeyCode={["Backspace", "Delete"]}
      selectionKeyCode={null}
    >
      <Background variant={BackgroundVariant.Dots} gap={CELL} size={1.5} color="#cbd5e1" />
      <Controls showInteractive={false} />
      <Panel position="top-right">
        <ExportButton title={title} />
      </Panel>
    </ReactFlow>
  );
}

export function ArchCanvas(props: {
  nodes: ArchNode[];
  edges: Edge[];
  title: string;
  callbacks: CanvasCallbacks;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
