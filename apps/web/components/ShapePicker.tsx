"use client";

import { useMemo } from "react";
import { SHAPES, SHAPE_INFO, isShape, type Shape } from "@archer/lang";
import { shapeGeometry } from "@/lib/shapes";
import { cx } from "./ui";

/**
 * Thumbnails are drawn at a default component's proportions (4 × 3 cells),
 * small enough that the shapes' minimum detail sizes keep them legible, and scaled.
 */
const THUMB_W = 40;
const THUMB_H = 30;

/** "Cylinder — databases and other stores": a shape's tooltip. */
export const shapeTitle = (shape: Shape): string =>
  `${SHAPE_INFO[shape].name} — ${SHAPE_INFO[shape].use}`;

/**
 * A shape's outline as a small icon, in currentColor, from the geometry the
 * canvas draws (lib/shapes.ts). Strokes keep their width at any size.
 */
export function ShapeIcon({ shape, width = 20, className }: { shape: Shape; width?: number; className?: string }) {
  const g = useMemo(() => shapeGeometry(shape, THUMB_W, THUMB_H), [shape]);
  const stroke = { stroke: "currentColor", strokeWidth: 1.25, vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      width={width}
      height={(width * THUMB_H) / THUMB_W}
      className={cx("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      {g.parts.map((d, i) => (
        <path key={i} d={d} fill="var(--surface)" strokeLinejoin="round" {...stroke} />
      ))}
      {g.details && <path d={g.details} fill="none" {...stroke} />}
      {g.dots && <path d={g.dots} fill="currentColor" />}
    </svg>
  );
}

/**
 * The inspector's shape control: every shape as a button. Choosing the box
 * clears `shape` (it's the default). A name the language doesn't know
 * selects nothing and says it's drawn as a box.
 */
export function ShapePicker({
  value,
  onChange,
}: {
  /** The component's `shape` as written (undefined: none). */
  value: string | undefined;
  onChange: (shape: Shape | null) => void;
}) {
  const current: Shape | null = value === undefined ? "box" : isShape(value) ? value : null;
  return (
    <div>
      <div role="group" aria-label="Shape" className="grid grid-cols-8 gap-1">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            title={shapeTitle(s)}
            aria-label={SHAPE_INFO[s].name}
            aria-pressed={s === current}
            onClick={() => {
              if (s !== current) onChange(s === "box" ? null : s);
            }}
            className={cx(
              "flex h-7 items-center justify-center rounded-sm transition-colors duration-75",
              s === current
                ? "bg-surface-3 text-ink ring-1 ring-line-2"
                : "text-ink-3 hover:bg-surface-2 hover:text-ink-2",
            )}
          >
            <ShapeIcon shape={s} width={22} />
          </button>
        ))}
      </div>
      <p className="truncate pt-1 text-xs text-ink-3">
        {current ? (
          <>
            <span className="text-ink-2">{SHAPE_INFO[current].name}</span> · {SHAPE_INFO[current].use}
          </>
        ) : (
          <>
            Unknown shape <span className="mono">{value}</span> · drawn as a box
          </>
        )}
      </p>
    </div>
  );
}
