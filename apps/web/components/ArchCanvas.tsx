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
  type OnNodeDrag,
  type OnReconnect,
  type ResizeParams,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { isShape, type Shape } from "@archer/lang";
import { CELL, type ArchEdge, type ArchNode } from "@/lib/toFlow";
import { DND_MIME, DND_PLANE_MIME, DND_SHAPE_MIME } from "./Palette";
import { OpenContext, ResizeContext, edgeTypes, nodeTypes } from "./nodes";
import { Icon } from "./ui";
import "./canvas.css";

export interface DragEndInfo {
  topLeft: { x: number; y: number };
  center: { x: number; y: number };
  sizeGrid: [number, number];
}

/** What a right-click landed on. */
export type ContextTarget =
  /** A component or plane, and where on it (flow px). */
  | { kind: "node"; path: string; at?: { x: number; y: number } }
  | { kind: "edge"; index: number }
  /** Empty canvas, at this point in flow px. */
  | { kind: "pane"; at: { x: number; y: number } };

/** Something being dragged over the canvas, for drop feedback. */
export interface Dragging {
  /** Nodes being dragged (empty for something from the palette). */
  paths: string[];
  /** It may go into a component dropped onto (components may; planes may not). */
  nest: boolean;
}

export interface CanvasCallbacks {
  /** One or more nodes dropped after a drag (outermost only: what's on a plane rides along). */
  onNodesDragEnd: (moves: { path: string; info: DragEndInfo }[]) => void;
  /** Open a component: show what's nested in it (double-click, or its corner button). */
  onDrillIn: (path: string) => void;
  /** A context node (a component outside the canvas) was clicked: go to it. */
  onOpenContext?: (path: string) => void;
  /** `additive`: shift/⌘/ctrl was held, so toggle it in the selection. */
  onSelectNode: (path: string, additive?: boolean) => void;
  onSelectEdge: (index: number, additive?: boolean) => void;
  onClearSelection: () => void;
  onConnect: (source: string, target: string) => void;
  /** Delete key: selected nodes plus selected and attached edges, as one edit. */
  onDelete: (paths: string[], edgeIndices: number[]) => void;
  /** A palette item dropped: a type (undefined: untyped), drawn as `shape` when given. */
  onDropType: (tag: string | undefined, flowPos: { x: number; y: number }, shape?: Shape) => void;
  /** The palette's plane dropped. */
  onDropPlane?: (flowPos: { x: number; y: number }) => void;
  /**
   * While something is dragged over the canvas: the node it would land on or
   * in, to highlight (null: loose on the canvas). `point` is in flow px.
   */
  dropTargetAt?: (point: { x: number; y: number }, dragging: Dragging) => string | null;
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
  /** Draw this connection (key) lit, as picked out elsewhere (the inspector's list). */
  highlightedEdge?: string | null;
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
  highlightedEdge = null,
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
  /** The node a drag would land on or in (drop feedback). */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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

  // Hover highlighting: the hovered node/edge and what it connects stay lit
  // (lit edges show their label chips); everything else fades.
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

  // The connections of every component drawn as selected (`selectedPath`
  // too) show their label chips.
  const selectedEnds = useMemo(
    () => (selectedPath ? new Set([...selNodeSet, selectedPath]) : selNodeSet),
    [selNodeSet, selectedPath],
  );

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => {
        const resizable = n.id === soleSelected;
        const target = n.id === dropTarget;
        const changed = resizable !== !!n.data.resizable || target !== !!n.data.dropTarget;
        return {
          ...n,
          ...(changed ? { data: { ...n.data, resizable, dropTarget: target } } : {}),
          className: joinCls(
            lit !== null && !lit.nodes.has(n.id) && "dim",
            selectedPath === n.id && "arch-selected",
          ),
        };
      }),
    [nodes, lit, selectedPath, soleSelected, dropTarget],
  );
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const on = lit === null ? undefined : lit.edges.has(e.id);
        const ends = selectedEnds.has(e.source) || selectedEnds.has(e.target);
        const spot = highlightedEdge !== null && e.data?.key === highlightedEdge;
        return {
          ...e,
          ...(e.data &&
          (on !== e.data.lit || ends !== !!e.data.endSelected || spot !== !!e.data.highlighted)
            ? { data: { ...e.data, lit: on, endSelected: ends, highlighted: spot } }
            : {}),
          className: joinCls(on === false && "dim"),
        };
      }),
    [edges, lit, selectedEnds, highlightedEdge],
  );

  /** Report where dragged nodes landed: absolute position in this view, center, and grid size. */
  /** Top-left of a node in the canvas's own coordinates (positions are relative to its plane). */
  const absolute = useCallback(
    (node: Node, byId: Map<string, Node>) => {
      let x = node.position.x;
      let y = node.position.y;
      let parent = node.parentId ? byId.get(node.parentId) : undefined;
      while (parent) {
        x += parent.position.x;
        y += parent.position.y;
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return { x, y };
    },
    [],
  );

  // Drop feedback while nodes are dragged: highlight where the first one would land.
  const onNodeDrag: OnNodeDrag<ArchNode> = useCallback(
    (_e, node, dragged) => {
      if (!callbacks.dropTargetAt) return;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const { x, y } = absolute(node, byId);
      const w = node.width ?? node.measured?.width ?? CELL * 4;
      const h = node.height ?? node.measured?.height ?? CELL * 3;
      const paths = (dragged.length > 0 ? dragged : [node]).map((n) => n.id);
      const nest = (dragged.length > 0 ? dragged : [node]).every((n) => n.type !== "archPlane");
      const target = callbacks.dropTargetAt({ x: x + w / 2, y: y + h / 2 }, { paths, nest });
      setDropTarget((t) => (t === target ? t : target));
    },
    [callbacks, nodes, absolute],
  );

  const commitDrag = useCallback(
    (dragged: Node[]) => {
      setBusy(false);
      setDropTarget(null);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const ids = new Set(dragged.map((n) => n.id));
      const moves = dragged
        // A child whose parent moved too rides along; it hasn't moved inside it.
        .filter((n) => !n.parentId || !isAncestorIn(n.parentId, ids, byId))
        .map((node) => {
          const { x, y } = absolute(node, byId);
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
    [callbacks, nodes, absolute],
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
      setDropTarget(null);
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (e.dataTransfer.types.includes(DND_PLANE_MIME)) {
        e.preventDefault();
        callbacks.onDropPlane?.(pos);
        return;
      }
      const tag = e.dataTransfer.getData(DND_MIME);
      const shape = e.dataTransfer.getData(DND_SHAPE_MIME);
      if (tag === null) return;
      e.preventDefault();
      callbacks.onDropType(tag === "" ? undefined : tag, pos, isShape(shape) ? shape : undefined);
    },
    [callbacks, screenToFlowPosition],
  );

  // Drop feedback while something from the palette is dragged over the canvas.
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!callbacks.dropTargetAt) return;
      const nest = !e.dataTransfer.types.includes(DND_PLANE_MIME);
      const target = callbacks.dropTargetAt(
        screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        { paths: [], nest },
      );
      setDropTarget((t) => (t === target ? t : target));
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
      <OpenContext.Provider value={embedded ? null : callbacks.onDrillIn}>
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
          onNodeDrag={onNodeDrag}
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
          onNodeClick={(e, n) =>
            n.type === "archContext"
              ? callbacks.onOpenContext?.(n.data.path)
              : callbacks.onSelectNode(n.id, isAdditive(e))
          }
          onNodeDoubleClick={(_e, n) => {
            if (n.type === "archComponent") callbacks.onDrillIn(n.id);
          }}
          onEdgeClick={(e, edge) => {
            const i = (edge.data as { index?: number } | undefined)?.index;
            if (i !== undefined) callbacks.onSelectEdge(i, isAdditive(e));
          }}
          onPaneClick={() => callbacks.onClearSelection()}
          onSelectionEnd={() =>
            callbacks.onSelectMany?.(getNodes().filter((n) => n.selected).map((n) => n.id))
          }
          onNodeContextMenu={(e, n) => {
            if (n.type === "archContext") e.preventDefault();
            else
              openMenu(e, {
                kind: "node",
                path: n.id,
                at: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              });
          }}
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
          onDragOver={readOnly ? undefined : onDragOver}
          onDragLeave={() => setDropTarget(null)}
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
      </OpenContext.Provider>
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
