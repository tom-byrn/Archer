"use client";

import { useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { CELL, type ArchNode } from "@/lib/toFlow";
import { nodeTypes } from "./nodes";

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

export function ArchCanvas({
  nodes,
  edges,
  title,
}: {
  nodes: ArchNode[];
  edges: Edge[];
  title: string;
}) {
  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        minZoom={0.15}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={CELL} size={1.5} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <ExportButton title={title} />
        </Panel>
      </ReactFlow>
    </ReactFlowProvider>
  );
}
