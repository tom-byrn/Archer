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
import type { ArchEdge, ArchNode, NodeMarks } from "@/lib/toFlow";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { Icon, cx } from "./ui";

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

/** Root class for a node's diff status (styled in canvas.css). */
const diffClass = (marks: NodeMarks | undefined): string | undefined =>
  marks?.diff ? `arch-diff-${marks.diff}` : undefined;

/**
 * Overlay badges: agent-touched sits top-right; drift sits top-left.
 * Pointer-events off so dragging is unaffected.
 */
function Badges({ marks }: { marks: NodeMarks | undefined }) {
  if (!marks) return null;
  return (
    <>
      {marks.touched && (
        <span className="arch-badges arch-badges-right">
          <span
            className="arch-badge bg-accent text-accent-ink"
            title="Changed by an agent since you last reviewed"
          >
            <Icon.Bot />
          </span>
        </span>
      )}
      {marks.drift && (
        <span className="arch-badges arch-badges-left">
          <span
            className={cx(
              "arch-badge text-white",
              marks.drift === "missing" ? "bg-danger" : "bg-warn",
            )}
            title={
              marks.drift === "missing"
                ? "Not found in the code"
                : "Code differs from this component"
            }
          >
            <Icon.Alert />
          </span>
        </span>
      )}
    </>
  );
}

const SrcHint = ({ src }: { src: string | undefined }) =>
  src ? <Icon.Link className="ml-1 inline h-[10px] w-[10px] align-[-1px] text-ink-3" /> : null;

export function ArchComponentNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const tile = accent ?? NEUTRAL;
  const collapsed = data.display === "icon" && data.childCount > 0;
  const marks = data.marks;
  return (
    <div
      style={{ width, height }}
      className={cx(
        "arch-node arch-node-component relative flex items-center gap-2.5 rounded-md border bg-surface px-2.5",
        diffClass(marks),
      )}
    >
      <EdgeHandles />
      <Badges marks={marks} />
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm"
        style={{ backgroundColor: alpha(tile, 0.14) }}
      >
        <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={18} />
      </div>
      <div className="min-w-0">
        <div className="arch-node-label truncate text-base font-semibold leading-tight text-ink">
          {data.label}
        </div>
        <div className="truncate text-xs leading-tight text-ink-3" title={marks?.src}>
          <span className={data.typeTag ? "mono" : undefined}>
            {data.typeTag ?? "component"}
          </span>
          {collapsed ? ` · ${data.childCount} inside` : ""}
          <SrcHint src={marks?.src} />
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
  const marks = data.marks;
  return (
    <div
      style={{
        width,
        height,
        borderColor: alpha(color, 0.35),
        backgroundColor: typed ? alpha(color, 0.05) : undefined,
      }}
      className={cx(
        "arch-node arch-node-plane relative rounded-lg border",
        typed ? "" : "arch-plane-untyped",
        diffClass(marks),
      )}
    >
      <EdgeHandles />
      <Badges marks={marks} />
      <div
        className="flex h-8 items-center gap-2 px-2.5"
        style={{ borderBottom: `1px solid ${alpha(color, 0.2)}` }}
      >
        <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={16} />
        <span className="arch-node-label truncate text-sm font-semibold text-ink">{data.label}</span>
        {data.typeTag && (
          <span className="mono truncate text-xs text-ink-3">{data.typeTag}</span>
        )}
        <SrcHint src={marks?.src} />
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
  // The routed bend (toFlow → routeEdge) clears the boxes around the edge. It
  // was computed for the committed layout; mid-drag it may no longer sit
  // between the ends, and the default middle bend takes over.
  const mid = data?.mid;
  const inside = (m: number, a: number, b: number) =>
    m > Math.min(a, b) + 4 && m < Math.max(a, b) - 4;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    centerX:
      mid !== undefined && data?.horizontal && inside(mid, sourceX, targetX) ? mid : undefined,
    centerY:
      mid !== undefined && data?.horizontal === false && inside(mid, sourceY, targetY)
        ? mid
        : undefined,
  });
  const arrow = data?.arrow ?? "->";
  const payloads = data?.payloadCount ?? 0;
  const hasLabel = data?.protocol !== undefined || data?.label !== undefined || payloads > 0;
  const diff = data?.diff;
  const diffCls = diff ? `arch-edge-diff-${diff}` : "";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cx("arch-edge-path", diffCls)}
        interactionWidth={16}
      />
      {/* fill attr: fallback so heads are never SVG-default black if canvas.css is late. */}
      {arrow !== "--" && (
        <polygon
          fill="var(--edge)"
          className={cx("arch-edge-arrow", diffCls)}
          points={arrowhead(targetX, targetY, targetPosition)}
        />
      )}
      {arrow === "<->" && (
        <polygon
          fill="var(--edge)"
          className={cx("arch-edge-arrow", diffCls)}
          points={arrowhead(sourceX, sourceY, sourcePosition)}
        />
      )}
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cx(
              "arch-edge-chip nodrag nopan pointer-events-auto absolute flex h-[18px] items-center gap-1 rounded-sm border bg-surface px-1.5 text-xs leading-none",
              diff === "added" ? "border-accent" : selected ? "border-accent" : "border-line",
              diffCls,
            )}
          >
            {data?.protocol !== undefined && (
              <span className="mono text-ink-2">{data.protocol}</span>
            )}
            {data?.protocol !== undefined && data?.label !== undefined && (
              <span className="text-ink-3">·</span>
            )}
            {data?.label !== undefined && <span className="text-ink">{data.label}</span>}
            {payloads > 0 && (
              <span
                className="mono text-ink-3"
                title={`${payloads} payload${payloads === 1 ? "" : "s"} on this connection`}
              >
                {"{}"}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  archEdge: ArchEdgeComponent,
};
