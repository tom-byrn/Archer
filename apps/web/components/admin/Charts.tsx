"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatDuration, formatNumber } from "@/lib/adminMetrics";
import { cx } from "../ui";

/**
 * The admin dashboard's charts: daily columns (one series, or several
 * stacked), drawn in SVG from the `--viz-*` tokens, with a hover tooltip per
 * day. Values are formatted as counts or durations.
 */

export type ValueFormat = "count" | "duration";

export interface Series {
  name: string;
  /** A CSS color, normally var(--viz-N). */
  color: string;
}

export interface Column {
  ts: number;
  values: number[];
}

const fmt = (v: number, f: ValueFormat) => (f === "duration" ? formatDuration(v) : formatNumber(v));

/** A round axis maximum at or above `v`. */
function niceMax(v: number, f: ValueFormat): number {
  if (v <= 0) return f === "duration" ? 60_000 : 4;
  if (f === "duration") {
    const steps = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 3_600_000, 2 * 3_600_000, 5 * 3_600_000, 10 * 3_600_000, 24 * 3_600_000];
    for (const s of steps) if (v <= s) return s;
    return Math.ceil(v / (24 * 3_600_000)) * 24 * 3_600_000;
  }
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * mag) return Math.max(2, m * mag);
  return 10 * mag;
}

const dateLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const HEIGHT = 168;
const PAD = { top: 8, right: 4, bottom: 22, left: 40 };
const GAP = 2;

export function DailyChart({
  columns,
  series,
  format = "count",
  label,
}: {
  columns: Column[];
  series: Series[];
  format?: ValueFormat;
  /** Names the chart for assistive tech. */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = columns.map((c) => c.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals), format);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const step = columns.length ? plotW / columns.length : 0;
  const barW = Math.max(1, Math.min(28, step - Math.max(2, step * 0.28)));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(columns.length / Math.max(1, Math.floor(plotW / 64))));
  const h = hover !== null ? columns[hover] : null;

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-xs" style={{ background: s.color }} />
              {s.name}
              <span className="tabular-nums text-ink-3">
                {fmt(columns.reduce((a, c) => a + (c.values[i] ?? 0), 0), format)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div ref={box} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={label}
            className="block"
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--line)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : "2 3"}
                />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">
                  {fmt(t, format)}
                </text>
              </g>
            ))}
            {columns.map((c, i) => {
              const x = PAD.left + i * step + (step - barW) / 2;
              let base = 0;
              const segments = c.values.map((v, si) => {
                if (v <= 0) return null;
                const top = base + v;
                const y0 = y(base);
                const y1 = y(top);
                base = top;
                const isTop = c.values.slice(si + 1).every((n) => n <= 0);
                // 2px surface gap between stacked segments; the top one gets the rounded end.
                const hgt = Math.max(1, y0 - y1 - (si > 0 ? GAP : 0));
                const r = isTop ? Math.min(4, barW / 2, hgt) : 0;
                const yTop = y1;
                return (
                  <path
                    key={si}
                    d={roundedTop(x, yTop, barW, hgt, r)}
                    fill={series[si]?.color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              });
              return (
                <g key={c.ts}>
                  {segments}
                  <rect
                    x={PAD.left + i * step}
                    y={PAD.top}
                    width={step}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                  {(i % labelEvery === 0 || i === columns.length - 1) &&
                    (i === columns.length - 1 || columns.length - 1 - i >= labelEvery / 2) && (
                      <text
                        x={PAD.left + i * step + step / 2}
                        y={HEIGHT - 6}
                        textAnchor="middle"
                        className="fill-ink-3 text-[10px]"
                      >
                        {dateLabel(c.ts)}
                      </text>
                    )}
                </g>
              );
            })}
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(0, PAD.left + hover * step + step / 2 - 64), Math.max(0, width - 150)),
            }}
          >
            <div className="pb-1 font-medium text-ink">{dateLabel(h.ts)}</div>
            {series.map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5 text-ink-2">
                <span aria-hidden className="h-2 w-2 rounded-xs" style={{ background: s.color }} />
                <span>{s.name}</span>
                <span className="ml-auto pl-3 font-medium tabular-nums text-ink">{fmt(h.values[i] ?? 0, format)}</span>
              </div>
            ))}
            {series.length > 1 && (
              <div className="mt-1 flex border-t border-line pt-1 text-ink-2">
                Total
                <span className="ml-auto pl-3 font-medium tabular-nums text-ink">{fmt(totals[hover]!, format)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A bar with only its top corners rounded, anchored to the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Ranked horizontal bars (top pages, tools, devices): a label, a bar scaled
 * to the largest value, and the value. Plain HTML, one series.
 */
export function BarList({
  items,
  format = "count",
  empty = "Nothing yet.",
  color = "var(--viz-1)",
}: {
  items: { label: React.ReactNode; value: number; hint?: string; key?: string }[];
  format?: ValueFormat;
  empty?: string;
  color?: string;
}) {
  if (items.length === 0) return <p className="py-3 text-sm text-ink-3">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <li key={item.key ?? idx} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3" title={item.hint}>
          <div className="relative min-w-0">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-sm opacity-20"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
            <div className="relative truncate px-2 py-1 text-sm text-ink">{item.label}</div>
          </div>
          <span className="text-sm tabular-nums text-ink-2">{fmt(item.value, format)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A headline number with a label and an optional line of context. */
export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5", className)}>
      <span className="eyebrow truncate">{label}</span>
      <span className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-ink">{value}</span>
      {sub && <span className="truncate text-xs text-ink-3">{sub}</span>}
    </div>
  );
}
