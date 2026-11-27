"use client";

import { useId, useMemo } from "react";
import { findComponent, type ArchDoc, type SequenceNode } from "@archer/lang";
import { HEAD_H, HEAD_W, layoutSequence, type SeqMessage } from "../lib/sequenceLayout";
import { Glyph } from "./nodes";
import { cx } from "./ui";

/**
 * A sequence drawn as a diagram: the participants' cards along the top (with
 * their own glyph, logo, icon and color), lifelines down from them, and the
 * steps in order. Lines are one SVG; cards and labels are HTML over it, so
 * they theme and wrap like the rest of the app. Click a message, note or
 * fragment to select it.
 */
export function SequenceDiagram({
  doc,
  sequence,
  selected,
  onSelect,
  warned,
  current,
  className,
}: {
  doc: ArchDoc;
  sequence: SequenceNode;
  /** Address key of the selected step. */
  selected: string | null;
  onSelect?: (key: string | null) => void;
  /** Steps (address keys) the validator warns about: calls with no connection. */
  warned?: ReadonlySet<string>;
  /** The message number playback is on. */
  current?: number | null;
  className?: string;
}) {
  const layout = useMemo(() => layoutSequence(sequence), [sequence]);
  const uid = useId().replace(/:/g, "");
  const marker = (kind: "solid" | "open", tone: "edge" | "accent" | "warn") => `seq-${uid}-${kind}-${tone}`;
  const tone = (m: SeqMessage): "edge" | "accent" | "warn" =>
    m.key === selected || m.number === current ? "accent" : warned?.has(m.key) ? "warn" : "edge";
  const strokeOf = { edge: "var(--edge-strong)", accent: "var(--accent)", warn: "var(--warn)" } as const;

  return (
    <div
      className={cx("relative select-none", className)}
      style={{ width: layout.width, height: layout.height }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <svg
        width={layout.width}
        height={layout.height}
        className="absolute inset-0"
        role="img"
        aria-label={`Sequence diagram: ${sequence.name ?? sequence.id}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect?.(null);
        }}
      >
        <defs>
          {(["edge", "accent", "warn"] as const).map((t) => (
            <g key={t}>
              <marker
                id={marker("solid", t)}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 Z" style={{ fill: strokeOf[t] }} />
              </marker>
              <marker
                id={marker("open", t)}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M1 1 L9 5 L1 9" style={{ fill: "none", stroke: strokeOf[t], strokeWidth: 1.6 }} />
              </marker>
            </g>
          ))}
        </defs>

        {layout.lifelines.map((l) => (
          <line
            key={l.key}
            x1={l.x}
            x2={l.x}
            y1={HEAD_H}
            y2={layout.height - 16}
            style={{ stroke: "var(--line-2)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
          />
        ))}

        {layout.frames.map((f) => {
          const on = f.key === selected;
          return (
            <g key={f.key}>
              <rect
                x={f.x}
                y={f.y}
                width={f.w}
                height={f.h}
                rx={4}
                style={{
                  fill: "color-mix(in srgb, var(--surface-2) 45%, transparent)",
                  stroke: on ? "var(--accent)" : "var(--edge)",
                  strokeWidth: on ? 1.5 : 1,
                }}
              />
              {f.branches.slice(1).map((b) => (
                <line
                  key={b.index}
                  x1={f.x}
                  x2={f.x + f.w}
                  y1={b.y + 4}
                  y2={b.y + 4}
                  style={{ stroke: "var(--edge)", strokeDasharray: "5 4" }}
                />
              ))}
            </g>
          );
        })}

        {layout.messages.map((m) => {
          const t = tone(m);
          const reply = m.arrow === "-->";
          const head = `url(#${marker(m.arrow === "->" ? "solid" : "open", t)})`;
          const style = {
            stroke: strokeOf[t],
            strokeWidth: t === "accent" ? 2.25 : 1.5,
            fill: "none",
            ...(reply ? { strokeDasharray: "5 4" } : {}),
          };
          const dir = m.x2 >= m.x1 ? 1 : -1;
          return m.self ? (
            <path
              key={m.key}
              d={`M${m.x1} ${m.y} H${m.x1 + 36} V${m.y2} H${m.x1 + 2}`}
              style={style}
              markerEnd={head}
            />
          ) : (
            <line key={m.key} x1={m.x1} x2={m.x2 - dir * 2} y1={m.y} y2={m.y} style={style} markerEnd={head} />
          );
        })}

        {layout.messages.map((m) => {
          const x = m.self ? m.x1 - 6 : Math.min(m.x1, m.x2);
          const w = m.self ? 60 : Math.abs(m.x2 - m.x1);
          return (
            <rect
              key={`hit-${m.key}`}
              x={x}
              y={m.y - 26}
              width={w}
              height={m.self ? 54 : 34}
              className="cursor-pointer"
              style={{ fill: "transparent" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(m.key);
              }}
            />
          );
        })}
      </svg>

      {layout.frames.map((f) => (
        <div key={f.key} className="pointer-events-none absolute" style={{ left: f.x, top: f.y, width: f.w }}>
          {f.branches.map((b) => (
            <button
              key={b.index}
              type="button"
              onClick={() => onSelect?.(f.key)}
              className={cx(
                "pointer-events-auto absolute left-0 flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-br-md border-b border-r px-2 text-xs",
                b.index === 0 ? "bg-surface-3" : "bg-transparent border-transparent",
                f.key === selected ? "border-accent" : "border-[var(--edge)]",
              )}
              style={{ top: b.y - f.y + (b.index === 0 ? 0 : 6) }}
            >
              {b.index === 0 ? (
                <span className="mono font-semibold text-ink">{f.fragment}</span>
              ) : (
                <span className="mono font-semibold text-ink-2">else</span>
              )}
              {b.guard !== undefined && <span className="text-ink-2">[{b.guard}]</span>}
            </button>
          ))}
        </div>
      ))}

      {layout.messages.map((m) => {
        const on = m.key === selected || m.number === current;
        return (
          <button
            key={`label-${m.key}`}
            type="button"
            onClick={() => onSelect?.(m.key)}
            className="absolute flex h-5 items-baseline gap-1.5 whitespace-nowrap pt-0.5 text-left text-xs"
            style={{ left: m.labelX, top: m.labelY - 14 }}
            title={warnedTitle(warned?.has(m.key))}
          >
            <span
              className={cx(
                "mono tabular-nums",
                on ? "font-semibold text-ink" : warned?.has(m.key) ? "text-warn" : "text-ink-3",
              )}
            >
              {m.number}
            </span>
            <span className={cx(on ? "font-semibold text-ink" : "text-ink", m.label === undefined && "text-ink-3")}>
              {m.label ?? (m.arrow === "-->" ? "reply" : "call")}
            </span>
            {m.type !== undefined && <span className="mono text-xs text-ink-3">@{m.type}</span>}
          </button>
        );
      })}

      {layout.notes.map((n) => (
        <button
          key={n.key}
          type="button"
          onClick={() => onSelect?.(n.key)}
          className={cx(
            "absolute rounded-sm border px-2.5 py-1.5 text-left text-xs leading-4 text-ink",
            n.key === selected ? "border-accent" : "border-line-2",
          )}
          style={{
            left: n.x,
            top: n.y,
            width: n.w,
            minHeight: n.h,
            background: "color-mix(in srgb, var(--warn) 10%, var(--surface))",
          }}
        >
          {n.text}
        </button>
      ))}

      {layout.lifelines.map((l) => {
        const c = findComponent(doc, l.path);
        return (
          <div
            key={l.key}
            className={cx(
              "absolute flex items-center gap-2 rounded-lg border bg-surface px-2.5 shadow-sm",
              c ? "border-line-2" : "border-dashed border-danger",
            )}
            style={{ left: l.x - HEAD_W / 2, top: 0, width: HEAD_W, height: HEAD_H }}
            title={l.key}
          >
            {c && <Glyph tag={c.type} color={c.color} icon={c.icon} size={20} className="shrink-0" />}
            <span className="min-w-0 truncate text-sm font-medium text-ink">{c?.name ?? l.key}</span>
          </div>
        );
      })}
    </div>
  );
}

const warnedTitle = (warned: boolean | undefined) =>
  warned ? "No connection carries this call. Add one so the architecture shows it." : undefined;
