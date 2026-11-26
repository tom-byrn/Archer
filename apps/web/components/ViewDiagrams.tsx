"use client";

import { useId, useMemo, useRef, useState } from "react";
import { findComponent, type ArchDoc, type FlowNode, type MachineNode, type ModelNode } from "@archer/lang";
import {
  ENTITY_HEAD,
  FIELD_ROW,
  LANE_HEAD,
  layoutFlow,
  layoutMachine,
  layoutModel,
  routeEdges,
  VIEW_CELL,
  type Box,
  type Placed,
  type RoutedEdge,
} from "../lib/graphLayout";
import { Glyph } from "./nodes";
import { cx } from "./ui";

/**
 * Diagrams for flows, state machines and data models. Like the sequence
 * diagram: lines in one SVG, nodes and labels as HTML over it. Selection is a
 * key: `n:<id>` for a node, state or entity, `e:<index>` for an edge or
 * transition.
 */

export const nodeKey = (id: string) => `n:${id}`;
export const edgeKey = (index: number) => `e:${index}`;

interface DiagramProps {
  doc: ArchDoc;
  selected: string | null;
  onSelect?: (key: string | null) => void;
  className?: string;
  /** Placed positions by node id (grid cells), from the layout block. */
  placed?: Placed;
  /**
   * Drag a node to place it (absent: nodes don't move). `at` is in grid
   * cells; for a flow, `lane` is the lane it was dropped in (a component
   * path, or null for no lane).
   */
  onPlace?: (id: string, at: [number, number], lane?: string | null) => void;
  /** Light this node (playback, simulation). */
  current?: string | null;
}

/**
 * Drag to place: a node follows the pointer, and on release reports where it
 * landed. A press that doesn't move is a click (select). Returns the boxes as
 * they are mid-drag, so edges follow the node.
 */
function useNodeDrag(
  boxes: Map<string, Box>,
  onSelect: ((key: string | null) => void) | undefined,
  onDrop: ((id: string, box: Box) => void) | undefined,
) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const live = useMemo(() => {
    if (!drag) return boxes;
    const b = boxes.get(drag.id);
    if (!b) return boxes;
    const out = new Map(boxes);
    out.set(drag.id, { ...b, x: b.x + drag.dx, y: b.y + drag.dy });
    return out;
  }, [boxes, drag]);
  const bind = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!onDrop || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { id, x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== id) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      s.moved = true;
      setDrag({ id, dx, dy });
    },
    onPointerUp: () => {
      const s = start.current;
      start.current = null;
      if (s?.moved && drag) {
        const b = live.get(id);
        setDrag(null);
        if (b) onDrop?.(id, b);
      } else setDrag(null);
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      // A drag ends with a click on the same element: not a selection.
      if (drag) return;
      onSelect?.(nodeKey(id));
    },
    style: onDrop ? { cursor: drag?.id === id ? "grabbing" : "grab", touchAction: "none" as const } : undefined,
  });
  return { boxes: live, bind, dragging: drag?.id ?? null };
}

const toCells = (b: Box): [number, number] => [Math.round(b.x / VIEW_CELL), Math.round(b.y / VIEW_CELL)];

/** Edge lines with arrowheads, and their wide invisible hit paths. */
function Edges({
  routes,
  selected,
  onSelect,
  marker,
}: {
  routes: RoutedEdge[];
  selected: string | null;
  onSelect?: (key: string | null) => void;
  marker: (on: boolean) => string;
}) {
  return (
    <>
      {routes.map((r) => {
        const on = selected === edgeKey(r.index);
        return (
          <g key={r.index}>
            <path
              d={r.d}
              markerEnd={`url(#${marker(on)})`}
              style={{ fill: "none", stroke: on ? "var(--accent)" : "var(--edge-strong)", strokeWidth: on ? 2.25 : 1.5, strokeLinejoin: "round" }}
            />
            <path
              d={r.d}
              className="cursor-pointer"
              style={{ fill: "none", stroke: "transparent", strokeWidth: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(edgeKey(r.index));
              }}
            />
          </g>
        );
      })}
    </>
  );
}

function Markers({ id }: { id: (on: boolean) => string }) {
  return (
    <defs>
      {[false, true].map((on) => (
        <marker key={String(on)} id={id(on)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" style={{ fill: on ? "var(--accent)" : "var(--edge-strong)" }} />
        </marker>
      ))}
    </defs>
  );
}

function EdgeLabels({ routes, selected, onSelect }: { routes: RoutedEdge[]; selected: string | null; onSelect?: (key: string | null) => void }) {
  return (
    <>
      {routes.map((r) =>
        r.label ? (
          <button
            key={`l${r.index}`}
            type="button"
            onClick={() => onSelect?.(edgeKey(r.index))}
            className={cx(
              "absolute -translate-y-1/2 whitespace-nowrap rounded-sm bg-ground px-1 text-xs",
              selected === edgeKey(r.index) ? "font-semibold text-accent" : "text-ink-2",
            )}
            style={{ left: r.label.x, top: r.label.y }}
          >
            {r.label.text}
          </button>
        ) : null,
      )}
    </>
  );
}

const clear = (onSelect?: (k: string | null) => void) => (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onSelect?.(null);
};

/* ---------------------------------------------------------------- Flow */

export function FlowDiagram({ doc, flow, selected, onSelect, className, placed, onPlace, current }: DiagramProps & { flow: FlowNode }) {
  const layout = useMemo(() => layoutFlow(flow, placed), [flow, placed]);
  const drag = useNodeDrag(layout.boxes, onSelect, onPlace && ((id, b) => {
    const cy = b.y + b.h / 2;
    const i = layout.lanes.findIndex((l) => cy >= l.y && cy < l.y + l.h);
    const lane = i < 0 ? undefined : layout.laneKeys[i]!;
    onPlace(id, toCells(b), lane);
  }));
  const routes = useMemo(() => routeEdges(flow.edges, drag.boxes), [flow.edges, drag.boxes]);
  const uid = useId().replace(/:/g, "");
  const marker = (on: boolean) => `flow-${uid}-${on ? "on" : "off"}`;
  return (
    <div className={cx("relative select-none", className)} style={{ width: layout.width, height: layout.height }} onClick={clear(onSelect)}>
      <svg width={layout.width} height={layout.height} className="absolute inset-0" role="img" aria-label={`Flow: ${flow.name ?? flow.id}`} onClick={clear(onSelect)}>
        <Markers id={marker} />
        {layout.lanes.map((l, i) => (
          <rect
            key={i}
            x={32}
            y={l.y}
            width={layout.width - 64}
            height={l.h}
            style={{ fill: i % 2 ? "transparent" : "color-mix(in srgb, var(--surface-2) 55%, transparent)", stroke: "var(--line)", strokeWidth: 1 }}
          />
        ))}
        {layout.lanes.map((l, i) => (
          <line key={`d${i}`} x1={32 + LANE_HEAD} x2={32 + LANE_HEAD} y1={l.y} y2={l.y + l.h} style={{ stroke: "var(--line)" }} />
        ))}
        <Edges routes={routes} selected={selected} onSelect={onSelect} marker={marker} />
      </svg>

      {layout.lanes.map((l, i) => {
        const key = layout.laneKeys[i];
        const c = key ? findComponent(doc, key.split(".")) : undefined;
        return (
          <div key={i} className="absolute flex items-center gap-2 px-3 text-sm" style={{ left: 32, top: l.y, width: LANE_HEAD, height: l.h }}>
            {key === null ? (
              <span className="text-ink-3">No lane</span>
            ) : (
              <>
                {c && <Glyph tag={c.type} color={c.color} icon={c.icon} size={18} className="shrink-0" />}
                <span className={cx("min-w-0 truncate font-medium", c ? "text-ink" : "text-danger")}>{c?.name ?? key}</span>
              </>
            )}
          </div>
        );
      })}

      <EdgeLabels routes={routes} selected={selected} onSelect={onSelect} />

      {flow.nodes.map((n) => {
        const b = drag.boxes.get(n.id)!;
        const on = selected === nodeKey(n.id) || current === n.id;
        const bound = drag.bind(n.id);
        const label = n.name ?? (n.node === "step" || n.node === "decision" ? n.id : undefined);
        const ring = on ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--ground)]" : "";
        if (n.node === "start" || n.node === "end")
          return (
            <button key={n.id} type="button" {...bound} title={n.name ?? n.id} aria-label={`${n.node} ${n.name ?? n.id}`} className="absolute" style={{ ...bound.style, left: b.x, top: b.y, width: b.w, height: b.h }}>
              <span
                className={cx("block h-full w-full rounded-full", ring, n.node === "start" ? "bg-ink" : "border-2 border-ink p-[4px]")}
              >
                {n.node === "end" && <span className="block h-full w-full rounded-full bg-ink" />}
              </span>
              {n.name && (
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-xs text-ink-2">{n.name}</span>
              )}
            </button>
          );
        if (n.node === "decision")
          return (
            <button key={n.id} type="button" {...bound} className="absolute flex items-center justify-center" style={{ ...bound.style, left: b.x, top: b.y, width: b.w, height: b.h }}>
              <svg width={b.w} height={b.h} className="absolute inset-0" aria-hidden>
                <path
                  d={`M${b.w / 2} 1 L${b.w - 1} ${b.h / 2} L${b.w / 2} ${b.h - 1} L1 ${b.h / 2} Z`}
                  style={{ fill: "var(--surface)", stroke: on ? "var(--accent)" : "var(--line-2)", strokeWidth: on ? 2 : 1.25 }}
                />
              </svg>
              <span className="relative max-w-[70%] text-center text-sm leading-tight text-ink">{label}</span>
            </button>
          );
        return (
          <button
            key={n.id}
            type="button"
            {...bound}
            className={cx(
              "absolute flex items-center justify-center rounded-lg border bg-surface px-3 text-center text-sm leading-tight text-ink shadow-sm",
              on ? "border-accent ring-1 ring-accent" : "border-line-2",
            )}
            style={{ ...bound.style, left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- State machine */

export function StatesDiagram({ doc, machine, selected, onSelect, className, placed, onPlace, current }: DiagramProps & { machine: MachineNode }) {
  const layout = useMemo(() => layoutMachine(machine, placed), [machine, placed]);
  const drag = useNodeDrag(layout.boxes, onSelect, onPlace && ((id, b) => onPlace(id, toCells(b))));
  const routes = useMemo(() => routeEdges(machine.transitions, drag.boxes), [machine.transitions, drag.boxes]);
  const uid = useId().replace(/:/g, "");
  const marker = (on: boolean) => `st-${uid}-${on ? "on" : "off"}`;
  const of = machine.of ? findComponent(doc, machine.of) : undefined;
  return (
    <div className={cx("relative select-none", className)} style={{ width: layout.width, height: layout.height }} onClick={clear(onSelect)}>
      <svg width={layout.width} height={layout.height} className="absolute inset-0" role="img" aria-label={`State machine: ${machine.name ?? machine.id}`} onClick={clear(onSelect)}>
        <Markers id={marker} />
        {machine.states
          .filter((s) => s.initial)
          .map((s) => {
            const b = drag.boxes.get(s.id)!;
            const y = b.y + b.h / 2;
            return (
              <g key={`init-${s.id}`}>
                <circle cx={b.x - 34} cy={y} r={7} style={{ fill: "var(--ink)" }} />
                <path d={`M${b.x - 27} ${y} H${b.x - 2}`} markerEnd={`url(#${marker(false)})`} style={{ stroke: "var(--edge-strong)", strokeWidth: 1.5 }} />
              </g>
            );
          })}
        <Edges routes={routes} selected={selected} onSelect={onSelect} marker={marker} />
      </svg>
      {machine.of && (
        <div className="absolute left-8 top-2 flex items-center gap-1.5 text-xs text-ink-3">
          States of
          {of && <Glyph tag={of.type} color={of.color} icon={of.icon} size={14} />}
          <span className={of ? "text-ink-2" : "text-danger"}>{of?.name ?? machine.of.join(".")}</span>
        </div>
      )}
      <EdgeLabels routes={routes} selected={selected} onSelect={onSelect} />
      {machine.states.map((s) => {
        const b: Box = drag.boxes.get(s.id)!;
        const on = selected === nodeKey(s.id) || current === s.id;
        const bound = drag.bind(s.id);
        return (
          <button
            key={s.id}
            type="button"
            {...bound}
            className={cx(
              "absolute flex items-center justify-center rounded-full bg-surface px-4 text-sm font-medium text-ink shadow-sm",
              s.final ? "border-[3px] border-double" : "border",
              on ? "border-accent ring-1 ring-accent" : "border-line-2",
              current === s.id && "bg-accent-soft",
            )}
            style={{ ...bound.style, left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            <span className="truncate">{s.name ?? s.id}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- Data model */

export function ModelDiagram({ doc, model, selected, onSelect, className, placed, onPlace }: DiagramProps & { model: ModelNode }) {
  const base = useMemo(() => layoutModel(model, placed), [model, placed]);
  const drag = useNodeDrag(base.boxes, onSelect, onPlace && ((id, b) => onPlace(id, toCells(b))));
  // Mid-drag, the references re-route around the moved table.
  const layout = useMemo(() => {
    if (drag.boxes === base.boxes || !drag.dragging) return base;
    const at = drag.boxes.get(drag.dragging)!;
    return layoutModel(model, new Map([...(placed ?? new Map()), [drag.dragging, [at.x / VIEW_CELL, at.y / VIEW_CELL] as const]]));
  }, [base, drag.boxes, drag.dragging, model, placed]);
  const on = model.on ? findComponent(doc, model.on) : undefined;
  const crow = (p: { x: number; y: number; dir: 1 | -1 }) =>
    `M${p.x} ${p.y - 6} L${p.x + p.dir * 10} ${p.y} L${p.x} ${p.y + 6} M${p.x + p.dir * 12} ${p.y - 6} V${p.y + 6}`;
  const bar = (p: { x: number; y: number; dir: 1 | -1 }) => `M${p.x + p.dir * 6} ${p.y - 6} V${p.y + 6} M${p.x + p.dir * 10} ${p.y - 6} V${p.y + 6}`;
  return (
    <div className={cx("relative select-none", className)} style={{ width: layout.width, height: layout.height }} onClick={clear(onSelect)}>
      <svg width={layout.width} height={layout.height} className="absolute inset-0" role="img" aria-label={`Data model: ${model.name ?? model.id}`} onClick={clear(onSelect)}>
        {layout.refs.map((r) => {
          const lit = selected === nodeKey(r.entity);
          const style = { fill: "none", stroke: lit ? "var(--accent)" : "var(--edge-strong)", strokeWidth: lit ? 2 : 1.4 };
          return (
            <g key={`${r.entity}.${r.field}`}>
              <path d={r.d} style={style} />
              <path d={crow(r.many)} style={style} />
              <path d={bar(r.one)} style={style} />
            </g>
          );
        })}
      </svg>
      {model.on && (
        <div className="absolute left-8 top-2 flex items-center gap-1.5 text-xs text-ink-3">
          Model of
          {on && <Glyph tag={on.type} color={on.color} icon={on.icon} size={14} />}
          <span className={on ? "text-ink-2" : "text-danger"}>{on?.name ?? model.on.join(".")}</span>
        </div>
      )}
      {model.entities.map((e) => {
        const b = layout.boxes.get(e.id)!;
        const sel = selected === nodeKey(e.id);
        const bound = drag.bind(e.id);
        return (
          <button
            key={e.id}
            type="button"
            {...bound}
            className={cx(
              "absolute flex flex-col overflow-hidden rounded-lg border bg-surface text-left shadow-sm",
              sel ? "border-accent ring-1 ring-accent" : "border-line-2",
            )}
            style={{ ...bound.style, left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            <span className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3 text-sm font-semibold text-ink" style={{ height: ENTITY_HEAD }}>
              <span className="truncate">{e.name ?? e.id}</span>
              {e.name !== undefined && <span className="mono ml-auto text-xs font-normal text-ink-3">{e.id}</span>}
            </span>
            {e.fields.length === 0 ? (
              <span className="px-3 text-xs text-ink-3" style={{ lineHeight: `${FIELD_ROW}px` }}>No fields</span>
            ) : (
              e.fields.map((f) => (
                <span key={f.name} className="flex items-center gap-2 px-3 text-xs" style={{ height: FIELD_ROW }}>
                  <span className={cx("mono min-w-0 truncate", f.pk ? "font-semibold text-ink" : "text-ink")}>
                    {f.name}
                    {f.optional && <span className="text-ink-3">?</span>}
                  </span>
                  {f.pk && <span className="rounded-xs bg-accent-soft px-1 text-xs text-accent">PK</span>}
                  {f.ref && <span className="rounded-xs bg-surface-3 px-1 text-xs text-ink-2">FK</span>}
                  {f.unique && !f.pk && <span className="rounded-xs bg-surface-3 px-1 text-xs text-ink-2">UQ</span>}
                  <span className="mono ml-auto shrink-0 text-ink-3">{f.type}</span>
                </span>
              ))
            )}
          </button>
        );
      })}
    </div>
  );
}
