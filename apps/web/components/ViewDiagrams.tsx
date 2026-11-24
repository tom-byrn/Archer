"use client";

import { useId, useMemo } from "react";
import { findComponent, type ArchDoc, type FlowNode, type MachineNode, type ModelNode } from "@archer/lang";
import {
  ENTITY_HEAD,
  FIELD_ROW,
  LANE_HEAD,
  layoutFlow,
  layoutMachine,
  layoutModel,
  routeEdges,
  type Box,
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
}

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

export function FlowDiagram({ doc, flow, selected, onSelect, className }: DiagramProps & { flow: FlowNode }) {
  const layout = useMemo(() => layoutFlow(flow), [flow]);
  const routes = useMemo(() => routeEdges(flow.edges, layout.boxes), [flow.edges, layout.boxes]);
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
        const b = layout.boxes.get(n.id)!;
        const on = selected === nodeKey(n.id);
        const label = n.name ?? (n.node === "step" || n.node === "decision" ? n.id : undefined);
        const ring = on ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--ground)]" : "";
        const pick = (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect?.(nodeKey(n.id));
        };
        if (n.node === "start" || n.node === "end")
          return (
            <button key={n.id} type="button" onClick={pick} title={n.name ?? n.id} aria-label={`${n.node} ${n.name ?? n.id}`} className="absolute" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
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
            <button key={n.id} type="button" onClick={pick} className="absolute flex items-center justify-center" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
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
            onClick={pick}
            className={cx(
              "absolute flex items-center justify-center rounded-lg border bg-surface px-3 text-center text-sm leading-tight text-ink shadow-sm",
              on ? "border-accent ring-1 ring-accent" : "border-line-2",
            )}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- State machine */

export function StatesDiagram({ doc, machine, selected, onSelect, className }: DiagramProps & { machine: MachineNode }) {
  const layout = useMemo(() => layoutMachine(machine), [machine]);
  const routes = useMemo(() => routeEdges(machine.transitions, layout.boxes), [machine.transitions, layout.boxes]);
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
            const b = layout.boxes.get(s.id)!;
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
        const b: Box = layout.boxes.get(s.id)!;
        const on = selected === nodeKey(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(nodeKey(s.id));
            }}
            className={cx(
              "absolute flex items-center justify-center rounded-full bg-surface px-4 text-sm font-medium text-ink shadow-sm",
              s.final ? "border-[3px] border-double" : "border",
              on ? "border-accent ring-1 ring-accent" : "border-line-2",
            )}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            <span className="truncate">{s.name ?? s.id}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- Data model */

export function ModelDiagram({ doc, model, selected, onSelect, className }: DiagramProps & { model: ModelNode }) {
  const layout = useMemo(() => layoutModel(model), [model]);
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
        return (
          <button
            key={e.id}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect?.(nodeKey(e.id));
            }}
            className={cx(
              "absolute flex flex-col overflow-hidden rounded-lg border bg-surface text-left shadow-sm",
              sel ? "border-accent ring-1 ring-accent" : "border-line-2",
            )}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
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
