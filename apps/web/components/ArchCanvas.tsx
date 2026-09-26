"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from "react";
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
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type Node,
  type OnConnect,
  type OnReconnect,
  type ResizeParams,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { isShape, type Shape } from "@archer/lang";
import { CELL, type ArchEdge, type ArchNode } from "@/lib/toFlow";
import { DND_MIME, DND_SHAPE_MIME } from "./Palette";
import { ResizeContext, edgeTypes, nodeTypes } from "./nodes";
import { Icon } from "./ui";
import "./canvas.css";

export interface DragEndInfo {
  topLeft: { x: number; y: number };
  center: { x: number; y: number };
  sizeGrid: [number, number];
}

/** What a right-click landed on. */
export type ContextTarget =
  | { kind: "node"; path: string }
  | { kind: "edge"; index: number }
  /** Empty canvas, at this point in flow px. */
  | { kind: "pane"; at: { x: number; y: number } };

export interface CanvasCallbacks {
  /** One or more nodes dropped after a drag (outermost only: children ride along). */
  onNodesDragEnd: (moves: { path: string; info: DragEndInfo }[]) => void;
  onDrillIn: (path: string) => void;
  /** `additive`: shift/⌘/ctrl was held, so toggle it in the selection. */
  onSelectNode: (path: string, additive?: boolean) => void;
  onSelectEdge: (index: number, additive?: boolean) => void;
  onClearSelection: () => void;
  onConnect: (source: string, target: string) => void;
  /** Delete key: selected nodes plus selected and attached edges, as one edit. */
  onDelete: (paths: string[], edgeIndices: number[]) => void;
  /** A palette item dropped: a type (undefined: untyped), drawn as `shape` when given. */
  onDropType: (tag: string | undefined, flowPos: { x: number; y: number }, shape?: Shape) => void;
  /** Box selection finished (shift-drag on the canvas). */
  onSelectMany?: (paths: string[]) => void;
  /** An edge's end was dragged onto another node. */
  onReconnect?: (index: number, end: "source" | "target", path: string) => void;
  /** A resize finished; grid cells, `at` relative to the node's parent. */
  onResize?: (path: string, rect: { at: [number, number]; size: [number, number] }) => void;
  /** Right-click; `client` is where to open a menu. */
  onContextMenu?: (target: ContextTarget, client: { x: number; y: number }) => void;
}

/** The editor's selection, which the canvas mirrors (component paths, connection keys). */
export interface CanvasSelection {
  nodes: readonly string[];
  edges: readonly string[];
}

/** Imperative bits the editor needs from the canvas. */
export interface CanvasApi {
  /** Where pasted components should land: the pointer when it's over the canvas, else the view's center (flow px). */
  pasteAnchor: () => { x: number; y: number };
  /** Zoom to show the whole view. */
  fitView: () => void;
}

export interface ArchCanvasProps {
  nodes: ArchNode[];
  edges: ArchEdge[];
  title: string;
  callbacks: CanvasCallbacks;
  isDark?: boolean;
  /** Highlight this node as selected (in addition to React Flow's own selection). */
  selectedPath?: string | null;
  /**
   * The full selection, owned by the caller: the canvas shows it, survives
   * edits with it, and reports clicks and box selections through callbacks.
   */
  selection?: CanvasSelection;
  /** Pan and zoom to this node once it's on the canvas (bump `nonce` to repeat). */
  reveal?: { path: string; nonce: number } | null;
  /** The reveal happened; the caller clears it so a later remount doesn't repeat it. */
  onRevealed?: () => void;
  /** Receives a function that downloads the canvas as a PNG. */
  exportRef?: MutableRefObject<(() => void) | null>;
  apiRef?: MutableRefObject<CanvasApi | null>;
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

const EMPTY: readonly string[] = [];

/** Shift, ⌘ or ctrl held: add to / remove from the selection instead of replacing it. */
const isAdditive = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
  e.shiftKey || e.metaKey || e.ctrlKey;

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
  selection,
  reveal,
  onRevealed,
  exportRef,
  apiRef,
  readOnly = false,
  embedded = false,
}: ArchCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchNode>(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArchEdge>(derivedEdges);
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const [hover, setHover] = useState<Hover>(null);
  const [busy, setBusy] = useState(false); // dragging, connecting, reconnecting or resizing
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const editable = !readOnly && !embedded;

  // Controlled selection: React Flow keeps its own `selected` flags, so copy
  // the caller's selection onto every fresh set of nodes and edges, and
  // re-apply it when only the selection changes.
  const controlled = selection !== undefined;
  const selNodes = selection?.nodes ?? EMPTY;
  const selEdges = selection?.edges ?? EMPTY;
  const selNodeSet = useMemo(() => new Set(selNodes), [selNodes]);
  const selEdgeSet = useMemo(() => new Set(selEdges), [selEdges]);
  const selRef = useRef({ nodes: selNodeSet, edges: selEdgeSet });
  selRef.current = { nodes: selNodeSet, edges: selEdgeSet };

  const flagNodes = useCallback(
    (list: ArchNode[]) =>
      list.map((n) => {
        const on = selRef.current.nodes.has(n.id);
        return !!n.selected === on ? n : { ...n, selected: on };
      }),
    [],
  );
  const flagEdges = useCallback(
    (list: ArchEdge[]) =>
      list.map((e) => {
        const on = e.data !== undefined && selRef.current.edges.has(e.data.key);
        return !!e.selected === on ? e : { ...e, selected: on };
      }),
    [],
  );

  useEffect(
    () => setNodes(controlled ? flagNodes(derivedNodes) : derivedNodes),
    [derivedNodes, setNodes, controlled, flagNodes],
  );
  useEffect(
    () => setEdges(controlled ? flagEdges(derivedEdges) : derivedEdges),
    [derivedEdges, setEdges, controlled, flagEdges],
  );
  useEffect(() => {
    if (!controlled) return;
    setNodes(flagNodes);
    setEdges(flagEdges);
  }, [controlled, selNodeSet, selEdgeSet, setNodes, setEdges, flagNodes, flagEdges]);

  // After a box selection React Flow lays an overlay over the selected nodes
  // that swallows clicks, double-clicks and resize handles under it. Dragging
  // any selected node already moves them all, so keep the overlay off.
  const store = useStoreApi();
  const overlay = useStore((s) => s.nodesSelectionActive);
  useEffect(() => {
    if (controlled && overlay) store.setState({ nodesSelectionActive: false });
  }, [controlled, overlay, store]);

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

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      pasteAnchor: () => {
        if (pointer.current) return screenToFlowPosition(pointer.current);
        const r = wrapper.current?.getBoundingClientRect();
        return r
          ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
          : { x: 0, y: 0 };
      },
      fitView: () => void fitView({ padding: 0.2, maxZoom: 1, duration: 250 }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, screenToFlowPosition, fitView]);

  // Bring a node into view (find / go to). Waits for the first fit-view on a
  // freshly drilled-into level so it isn't immediately overridden.
  useEffect(() => {
    if (!reveal || !initialized) return;
    if (!getNodes().some((n) => n.id === reveal.path)) return;
    const t = setTimeout(() => {
      void fitView({ nodes: [{ id: reveal.path }], duration: 300, maxZoom: 1, padding: 0.8 });
      onRevealed?.();
    }, 60);
    return () => clearTimeout(t);
  }, [reveal, initialized, getNodes, fitView, onRevealed]);

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

  // Resize handles go on the node when it's the only thing selected.
  const soleSelected =
    editable && callbacks.onResize && selNodes.length === 1 && selEdges.length === 0
      ? selNodes[0]
      : undefined;

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => {
        const resizable = n.id === soleSelected;
        return {
          ...n,
          ...(resizable !== !!n.data.resizable ? { data: { ...n.data, resizable } } : {}),
          className: joinCls(
            lit !== null && !lit.nodes.has(n.id) && "dim",
            selectedPath === n.id && "arch-selected",
          ),
        };
      }),
    [nodes, lit, selectedPath, soleSelected],
  );
  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        className: joinCls(lit !== null && !lit.edges.has(e.id) && "dim"),
      })),
    [edges, lit],
  );

  /** Report where dragged nodes landed: absolute position in this view, center, and grid size. */
  const commitDrag = useCallback(
    (dragged: Node[]) => {
      setBusy(false);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const ids = new Set(dragged.map((n) => n.id));
      const moves = dragged
        // A child whose parent moved too rides along; it hasn't moved inside it.
        .filter((n) => !n.parentId || !isAncestorIn(n.parentId, ids, byId))
        .map((node) => {
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
          return {
            path: node.id,
            info: {
              topLeft: { x, y },
              center: { x: x + w / 2, y: y + h / 2 },
              sizeGrid: [Math.round(w / CELL), Math.round(h / CELL)] as [number, number],
            },
          };
        });
      if (moves.length > 0) callbacks.onNodesDragEnd(moves);
    },
    [callbacks, nodes],
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (conn.source && conn.target) callbacks.onConnect(conn.source, conn.target);
    },
    [callbacks],
  );

  const onReconnect: OnReconnect<ArchEdge> = useCallback(
    (old, conn) => {
      const index = old.data?.index;
      if (index === undefined || !callbacks.onReconnect) return;
      if (conn.source && conn.source !== old.source)
        callbacks.onReconnect(index, "source", conn.source);
      else if (conn.target && conn.target !== old.target)
        callbacks.onReconnect(index, "target", conn.target);
    },
    [callbacks],
  );

  const onDelete = useCallback(
    ({ nodes: deleted, edges: deletedEdges }: { nodes: Node[]; edges: Edge[] }) =>
      callbacks.onDelete(
        deleted.map((n) => n.id),
        deletedEdges
          .map((e) => (e.data as { index?: number } | undefined)?.index)
          .filter((i): i is number => i !== undefined),
      ),
    [callbacks],
  );

  const onResizeEnd = useCallback(
    (id: string, p: ResizeParams) => {
      setBusy(false);
      callbacks.onResize?.(id, {
        at: [Math.round(p.x / CELL), Math.round(p.y / CELL)],
        size: [Math.round(p.width / CELL), Math.round(p.height / CELL)],
      });
    },
    [callbacks],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const tag = e.dataTransfer.getData(DND_MIME);
      const shape = e.dataTransfer.getData(DND_SHAPE_MIME);
      if (tag === null) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      callbacks.onDropType(tag === "" ? undefined : tag, pos, isShape(shape) ? shape : undefined);
    },
    [callbacks, screenToFlowPosition],
  );

  const menu = editable ? callbacks.onContextMenu : undefined;
  const openMenu = (e: ReactMouseEvent | MouseEvent, target: ContextTarget) => {
    if (!menu) return;
    e.preventDefault();
    menu(target, { x: e.clientX, y: e.clientY });
  };

  return (
    <ResizeContext.Provider value={editable && callbacks.onResize ? onResizeEnd : null}>
      <ReactFlow
        ref={wrapper}
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        onNodeDragStart={(e, node) => {
          setBusy(true);
          // Dragging an unselected node selects it (React Flow does the same internally).
          if (controlled && !selRef.current.nodes.has(node.id))
            callbacks.onSelectNode(node.id, isAdditive(e));
        }}
        onNodeDragStop={(_e, node, dragged) => commitDrag(dragged.length > 0 ? dragged : [node])}
        onConnectStart={() => setBusy(true)}
        onConnectEnd={() => setBusy(false)}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={() => setBusy(true)}
        onReconnectEnd={() => setBusy(false)}
        edgesReconnectable={editable && callbacks.onReconnect !== undefined}
        onDelete={onDelete}
        onNodeMouseEnter={(_e, n) => setHover({ kind: "node", id: n.id })}
        onNodeMouseLeave={() => setHover(null)}
        onEdgeMouseEnter={(_e, edge) => setHover({ kind: "edge", id: edge.id })}
        onEdgeMouseLeave={() => setHover(null)}
        onNodeClick={(e, n) => callbacks.onSelectNode(n.id, isAdditive(e))}
        onNodeDoubleClick={(_e, n) => callbacks.onDrillIn(n.id)}
        onEdgeClick={(e, edge) => {
          const i = (edge.data as { index?: number } | undefined)?.index;
          if (i !== undefined) callbacks.onSelectEdge(i, isAdditive(e));
        }}
        onPaneClick={() => callbacks.onClearSelection()}
        onSelectionEnd={() =>
          callbacks.onSelectMany?.(getNodes().filter((n) => n.selected).map((n) => n.id))
        }
        onNodeContextMenu={(e, n) => openMenu(e, { kind: "node", path: n.id })}
        onEdgeContextMenu={(e, edge) => {
          const i = (edge.data as { index?: number } | undefined)?.index;
          if (i !== undefined) openMenu(e, { kind: "edge", index: i });
        }}
        onPaneContextMenu={(e) =>
          openMenu(e, {
            kind: "pane",
            at: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          })
        }
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
        reconnectRadius={14}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        // Box selection: hold shift and drag on empty canvas. Dragging alone pans.
        selectionKeyCode={controlled && editable ? "Shift" : null}
        multiSelectionKeyCode={controlled && editable ? ["Shift", "Meta", "Control"] : null}
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
    </ResizeContext.Provider>
  );
}

/** Is `id` (or any of its ancestors) one of `ids`? */
function isAncestorIn(id: string, ids: ReadonlySet<string>, byId: Map<string, Node>): boolean {
  for (let cur: string | undefined = id; cur; cur = byId.get(cur)?.parentId) {
    if (ids.has(cur)) return true;
  }
  return false;
}

export function ArchCanvas(props: ArchCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
