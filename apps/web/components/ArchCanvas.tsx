"use client";

import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type OnConnect,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { CELL, type ArchEdge, type ArchNode } from "@/lib/toFlow";
import { DND_MIME } from "./Palette";
import { edgeTypes, nodeTypes } from "./nodes";
import { Icon } from "./ui";
import "./canvas.css";

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

export interface ArchCanvasProps {
  nodes: ArchNode[];
  edges: ArchEdge[];
  title: string;
  callbacks: CanvasCallbacks;
  isDark?: boolean;
  /** Highlight this node as selected (in addition to React Flow's own selection). */
  selectedPath?: string | null;
  /** Receives a function that downloads the canvas as a PNG. */
  exportRef?: MutableRefObject<(() => void) | null>;
  /** Diff / history view: no dragging, connecting, dropping or deleting. */
  readOnly?: boolean;
  /**
   * Inline on a scrolling page (the landing sandbox): fixed viewport, the
   * wheel scrolls the page instead of zooming, no controls, no deleting.
   */
  embedded?: boolean;
}

type Hover = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

const joinCls = (...parts: Array<string | undefined | false>) =>
  parts.filter(Boolean).join(" ") || undefined;

/** React Flow's zoom and fit-view buttons, drawn with the app's icons instead of its own. */
function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const maxZoomReached = useStore((s) => s.transform[2] >= s.maxZoom);
  const minZoomReached = useStore((s) => s.transform[2] <= s.minZoom);
  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false} position="bottom-left">
      <ControlButton
        className="react-flow__controls-zoomin"
        title="Zoom in"
        aria-label="Zoom in"
        disabled={maxZoomReached}
        onClick={() => void zoomIn()}
      >
        <Icon.Plus />
      </ControlButton>
      <ControlButton
        className="react-flow__controls-zoomout"
        title="Zoom out"
        aria-label="Zoom out"
        disabled={minZoomReached}
        onClick={() => void zoomOut()}
      >
        <Icon.Minus />
      </ControlButton>
      <ControlButton
        className="react-flow__controls-fitview"
        title="Fit view"
        aria-label="Fit view"
        onClick={() => void fitView()}
      >
        <Icon.FitView />
      </ControlButton>
    </Controls>
  );
}

function CanvasInner({
  nodes: derivedNodes,
  edges: derivedEdges,
  title,
  callbacks,
  selectedPath,
  exportRef,
  readOnly = false,
  embedded = false,
}: ArchCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchNode>(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArchEdge>(derivedEdges);
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const [hover, setHover] = useState<Hover>(null);
  const [busy, setBusy] = useState(false); // dragging or connecting

  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);
  useEffect(() => setEdges(derivedEdges), [derivedEdges, setEdges]);

  // PNG export, exposed to the chrome via exportRef.
  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = () => {
      const bounds = getNodesBounds(getNodes());
      const width = Math.min(2400, Math.max(800, Math.ceil(bounds.width) + 160));
      const height = Math.min(1800, Math.max(600, Math.ceil(bounds.height) + 160));
      const viewport = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
      const el = document.querySelector<HTMLElement>(".react-flow__viewport");
      if (!el) return;
      const ground =
        getComputedStyle(document.documentElement).getPropertyValue("--ground").trim() ||
        "#f7f5f1";
      void toPng(el, {
        backgroundColor: ground,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      }).then((dataUrl) => {
        const a = document.createElement("a");
        a.download = `${title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase() || "archer"}.png`;
        a.href = dataUrl;
        a.click();
      });
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef, getNodes, title]);

  // Hover dimming: everything not connected to the hovered node/edge fades.
  const lit = useMemo(() => {
    if (hover === null || busy) return null;
    const litNodes = new Set<string>();
    const litEdges = new Set<string>();
    if (hover.kind === "node") {
      litNodes.add(hover.id);
      for (const e of edges) {
        if (e.source === hover.id || e.target === hover.id) {
          litEdges.add(e.id);
          litNodes.add(e.source);
          litNodes.add(e.target);
        }
      }
    } else {
      const e = edges.find((x) => x.id === hover.id);
      if (!e) return null;
      litEdges.add(e.id);
      litNodes.add(e.source);
      litNodes.add(e.target);
    }
    // Keep ancestors (planes) of lit nodes visible so context isn't lost.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const id of [...litNodes]) {
      let p = byId.get(id)?.parentId;
      while (p) {
        litNodes.add(p);
        p = byId.get(p)?.parentId;
      }
    }
    return { nodes: litNodes, edges: litEdges };
  }, [hover, busy, nodes, edges]);

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        className: joinCls(
          lit !== null && !lit.nodes.has(n.id) && "dim",
          selectedPath === n.id && "arch-selected",
        ),
      })),
    [nodes, lit, selectedPath],
  );
  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        className: joinCls(lit !== null && !lit.edges.has(e.id) && "dim"),
      })),
    [edges, lit],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      setBusy(false);
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
      nodes={styledNodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStart={() => setBusy(true)}
      onNodeDragStop={onNodeDragStop}
      onConnectStart={() => setBusy(true)}
      onConnectEnd={() => setBusy(false)}
      onConnect={onConnect}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onNodeMouseEnter={(_e, n) => setHover({ kind: "node", id: n.id })}
      onNodeMouseLeave={() => setHover(null)}
      onEdgeMouseEnter={(_e, edge) => setHover({ kind: "edge", id: edge.id })}
      onEdgeMouseLeave={() => setHover(null)}
      onNodeClick={(_e, n) => callbacks.onSelectNode(n.id)}
      onNodeDoubleClick={(_e, n) => callbacks.onDrillIn(n.id)}
      onEdgeClick={(_e, edge) => {
        const i = (edge.data as { index?: number } | undefined)?.index;
        if (i !== undefined) callbacks.onSelectEdge(i);
      }}
      onPaneClick={() => callbacks.onClearSelection()}
      onDrop={readOnly ? undefined : onDrop}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.15}
      snapToGrid
      snapGrid={[CELL, CELL]}
      connectionRadius={36}
      deleteKeyCode={readOnly || embedded ? null : ["Backspace", "Delete"]}
      selectionKeyCode={null}
      preventScrolling={!embedded}
      zoomOnScroll={!embedded}
      zoomOnPinch={!embedded}
      zoomOnDoubleClick={!embedded}
      panOnDrag={!embedded}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={CELL} size={1.5} color="var(--dot)" />
      {!embedded && <CanvasControls />}
    </ReactFlow>
  );
}

export function ArchCanvas(props: ArchCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
