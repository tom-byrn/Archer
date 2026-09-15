"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getSmoothStepPath,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import { GLYPHS, lookupType } from "@archer/catalog";
import type { ArchEdge, ArchNode } from "@/lib/toFlow";
import { displayColor, useIsDark } from "@/lib/useIsDark";

/** Neutral fallback for untyped components (matches `--ink-3`-ish gray). */
const NEUTRAL = "#8a8479";

/** Append an alpha byte to a #rrggbb color. */
const alpha = (hex: string, a: number): string =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;

export function Glyph({
  tag,
  color,
  glyph,
  size = 22,
  className,
}: {
  tag?: string;
  color?: string;
  glyph?: string;
  size?: number;
  className?: string;
}) {
  const isDark = useIsDark();
  const entry = lookupType(tag);
  const g = GLYPHS[glyph ?? entry?.glyph ?? "box"] ?? GLYPHS.box!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color: displayColor(color ?? entry?.color, isDark) ?? "var(--ink-3)" }}
      dangerouslySetInnerHTML={{ __html: g }}
    />
  );
}

// One source + one target handle per side, so edges attach on the side facing
// the other endpoint (ids chosen by toFlow) and users can start a connection
// from any side.
const SIDES = [
  ["t", Position.Top],
  ["r", Position.Right],
  ["b", Position.Bottom],
  ["l", Position.Left],
] as const;

const EdgeHandles = () => (
  <>
    {SIDES.map(([id, position]) => (
      <Handle key={`t${id}`} id={`t${id}`} type="target" position={position} className="arch-handle" />
    ))}
    {SIDES.map(([id, position]) => (
      <Handle key={`s${id}`} id={`s${id}`} type="source" position={position} className="arch-handle" />
    ))}
  </>
);

export function ArchComponentNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const tile = accent ?? NEUTRAL;
  const collapsed = data.display === "icon" && data.childCount > 0;
  return (
    <div
      style={{ width, height }}
      className="arch-node arch-node-component flex items-center gap-2.5 rounded-md border bg-surface px-2.5"
    >
      <EdgeHandles />
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm"
        style={{ backgroundColor: alpha(tile, 0.14) }}
      >
        <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={18} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold leading-tight text-ink">
          {data.label}
        </div>
        <div className="truncate text-xs leading-tight text-ink-3">
          <span className={data.typeTag ? "mono" : undefined}>
            {data.typeTag ?? "component"}
          </span>
          {collapsed ? ` · ${data.childCount} inside` : ""}
        </div>
      </div>
    </div>
  );
}

export function ArchPlaneNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const typed = accent !== undefined;
  const color = accent ?? NEUTRAL;
  return (
    <div
      style={{
        width,
        height,
        borderColor: alpha(color, 0.35),
        backgroundColor: typed ? alpha(color, 0.05) : undefined,
      }}
      className={`arch-node arch-node-plane rounded-lg border ${typed ? "" : "arch-plane-untyped"}`}
    >
      <EdgeHandles />
      <div
        className="flex h-8 items-center gap-2 px-2.5"
        style={{ borderBottom: `1px solid ${alpha(color, 0.2)}` }}
      >
        <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={16} />
        <span className="truncate text-sm font-semibold text-ink">{data.label}</span>
        {data.typeTag && (
          <span className="mono truncate text-xs text-ink-3">{data.typeTag}</span>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  archComponent: ArchComponentNode,
  archPlane: ArchPlaneNode,
};

/* ---------------------------------------------------------------- Edges */

const ARROW = 7; // half-width of the arrowhead, px

/** Arrowhead polygon pointing INTO the node at (x, y) from side `side`. */
function arrowhead(x: number, y: number, side: Position): string {
  switch (side) {
    case Position.Left:
      return `${x},${y} ${x - ARROW * 2},${y - ARROW} ${x - ARROW * 2},${y + ARROW}`;
    case Position.Right:
      return `${x},${y} ${x + ARROW * 2},${y - ARROW} ${x + ARROW * 2},${y + ARROW}`;
    case Position.Top:
      return `${x},${y} ${x - ARROW},${y - ARROW * 2} ${x + ARROW},${y - ARROW * 2}`;
    default:
      return `${x},${y} ${x - ARROW},${y + ARROW * 2} ${x + ARROW},${y + ARROW * 2}`;
  }
}

export function ArchEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ArchEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  const arrow = data?.arrow ?? "->";
  const hasLabel = data?.protocol !== undefined || data?.label !== undefined;
  return (
    <>
      <BaseEdge id={id} path={path} className="arch-edge-path" interactionWidth={16} />
      {arrow !== "--" && (
        <polygon className="arch-edge-arrow" points={arrowhead(targetX, targetY, targetPosition)} />
      )}
      {arrow === "<->" && (
        <polygon className="arch-edge-arrow" points={arrowhead(sourceX, sourceY, sourcePosition)} />
      )}
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={`arch-edge-chip nodrag nopan pointer-events-auto absolute flex h-[18px] items-center gap-1 rounded-sm border bg-surface px-1.5 text-xs leading-none ${
              selected ? "border-accent" : "border-line"
            }`}
          >
            {data?.protocol !== undefined && (
              <span className="mono text-ink-2">{data.protocol}</span>
            )}
            {data?.protocol !== undefined && data?.label !== undefined && (
              <span className="text-ink-3">·</span>
            )}
            {data?.label !== undefined && <span className="text-ink">{data.label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  archEdge: ArchEdgeComponent,
};
