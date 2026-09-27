"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizeControl,
  NodeResizer,
  Position,
  ResizeControlVariant,
  getSmoothStepPath,
  useUpdateNodeInternals,
  type EdgeProps,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import type { Shape } from "@archer/lang";
import { LABEL, labelLayout, shapeGeometry, type ShapeGeometry } from "@/lib/shapes";
import { CELL, type ArchEdge, type ArchNode, type NodeMarks } from "@/lib/toFlow";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { LogoArt, useLogo } from "./logos";
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
  const logo = useLogo(tag);
  if (logo) return <LogoArt logo={logo} size={size} className={className} />;
  const g = GLYPHS[glyph ?? entry?.glyph ?? "box"] ?? GLYPHS.box!;
  return (
    <svg
      width={size}
      height={size}
      viewBox={GLYPH_VIEWBOX}
      className={className}
      style={{ color: displayColor(color ?? entry?.color, isDark) ?? "var(--ink-3)" }}
      dangerouslySetInnerHTML={{ __html: g }}
    />
  );
}

/**
 * A type's glyph (or logo) on its tinted square, `box` px across. A vendor's
 * own square icon (an AWS service) is drawn in place of the square instead.
 */
export function GlyphSwatch({
  tag,
  color,
  glyph,
  box,
  size,
  background,
  className,
}: {
  tag?: string;
  color?: string;
  glyph?: string;
  box: number;
  size: number;
  background?: string;
  className?: string;
}) {
  const logo = useLogo(tag);
  if (logo?.kind === "tile") return <LogoArt logo={logo} size={box} className={cx("shrink-0", className)} />;
  return (
    <span
      className={cx("flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box, backgroundColor: background }}
    >
      <Glyph tag={tag} color={color} glyph={glyph} size={size} />
    </span>
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

// A shape pulls each side's handles in to its outline (`anchors`), so edges
// end on the outline rather than on the box around it.
const SIDE_STYLE = { t: "top", r: "right", b: "bottom", l: "left" } as const;

function EdgeHandles({ anchors }: { anchors?: ShapeGeometry["anchors"] }) {
  const style = (id: keyof typeof SIDE_STYLE): CSSProperties | undefined =>
    anchors ? { [SIDE_STYLE[id]]: anchors[id] } : undefined;
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle key={`t${id}`} id={`t${id}`} type="target" position={position} className="arch-handle" style={style(id)} />
      ))}
      {SIDES.map(([id, position]) => (
        <Handle key={`s${id}`} id={`s${id}`} type="source" position={position} className="arch-handle" style={style(id)} />
      ))}
    </>
  );
}

/** How a node reports a finished resize to the canvas (unset: resizing is off). */
export const ResizeContext = createContext<
  ((id: string, params: ResizeParams) => void) | null
>(null);

/** How a component asks to be opened, to show what's nested in it (unset: it can't be). */
export const OpenContext = createContext<((path: string) => void) | null>(null);

/**
 * Resize handles on the selected node. A plain component resizes from any
 * side; a plane only from its right and bottom, so what's on it, which is
 * placed relative to its top-left, stays where it is.
 */
function Resizer({ id, data }: { id: string; data: ArchNode["data"] }) {
  const onResizeEnd = useContext(ResizeContext);
  if (!onResizeEnd || !data.resizable) return null;
  const common = {
    minWidth: data.minSize[0] * CELL,
    minHeight: data.minSize[1] * CELL,
    onResizeEnd: (_: unknown, params: ResizeParams) => onResizeEnd(id, params),
  };
  if (data.kind === "plane") {
    return (
      <>
        <NodeResizeControl {...common} position="right" variant={ResizeControlVariant.Line} className="arch-resize-line" />
        <NodeResizeControl {...common} position="bottom" variant={ResizeControlVariant.Line} className="arch-resize-line" />
        <NodeResizeControl {...common} position="bottom-right" className="arch-resize-handle" />
      </>
    );
  }
  return <NodeResizer {...common} lineClassName="arch-resize-line" handleClassName="arch-resize-handle" />;
}

/** Root class for a node's diff status (styled in canvas.css). */
const diffClass = (marks: NodeMarks | undefined): string | undefined =>
  marks?.diff ? `arch-diff-${marks.diff}` : undefined;

/**
 * How many components are nested in a component, in its corner: a button
 * that opens it (double-clicking does too), or a plain badge where it can't.
 */
function NestedBadge({ path, count }: { path: string; count: number }) {
  const open = useContext(OpenContext);
  if (count === 0) return null;
  const body = (
    <>
      <Icon.Nested />
      {count}
    </>
  );
  if (!open)
    return (
      <span className="arch-nested" title={`${count} inside`}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      title={`${count} inside · open`}
      aria-label={`Open: ${count} inside`}
      className="arch-nested nodrag nopan"
      onClick={(e) => {
        e.stopPropagation();
        open(path);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {body}
    </button>
  );
}

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

const SrcHint = ({ src }: { src: readonly string[] | undefined }) =>
  src?.length ? <Icon.Link className="ml-1 inline h-[10px] w-[10px] align-[-1px] text-ink-3" /> : null;

/** Hover text for a node's sources: one per line. */
const srcTitle = (src: readonly string[] | undefined): string | undefined => src?.join("\n");

/**
 * A component with a shape: the outline fills the box, and the label sits
 * centered in the shape's roomy middle. What the label shows depends on the
 * room (lib/shapes.ts `labelLayout`, which lib/svg.ts follows too).
 */
function ArchShapeNode({ id, data, width, height, shape }: NodeProps<ArchNode> & { shape: Shape }) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const w = width ?? CELL * 4;
  const h = height ?? CELL * 3;
  const geo = useMemo(() => shapeGeometry(shape, w, h), [shape, w, h]);
  const typed = data.typeTag !== undefined;
  const sub = data.typeTag ?? "";
  const layout = labelLayout(geo.content, typed, sub !== "");
  const marks = data.marks;
  const c = geo.content;
  const glyph = (size: number) => (
    <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={size} className="shrink-0" />
  );
  return (
    <div
      style={{ width: w, height: h, ...(accent ? { "--shape-accent": accent } : {}) } as CSSProperties}
      className={cx(
        "arch-node arch-node-shape relative",
        accent && "arch-shape-typed",
        data.dropTarget && "arch-drop-target",
        diffClass(marks),
      )}
    >
      <Resizer id={id} data={data} />
      <EdgeHandles anchors={geo.anchors} />
      <Badges marks={marks} />
      <NestedBadge path={data.path} count={data.childCount} />
      <svg className="arch-shape" width={w} height={h} aria-hidden>
        {geo.parts.map((d, i) => (
          <path key={i} className="arch-shape-part" d={d} />
        ))}
        {geo.details && <path className="arch-shape-detail" d={geo.details} />}
        {geo.dots && <path className="arch-shape-dot" d={geo.dots} />}
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
      >
        {layout.glyph === "above" && <span className="mb-1 flex">{glyph(LABEL.glyph)}</span>}
        <div className="flex max-w-full min-w-0 items-center justify-center gap-1.5">
          {layout.glyph === "inline" && glyph(14)}
          <span
            className={cx(
              "arch-node-label min-w-0 break-words text-base font-semibold leading-tight text-ink",
              layout.lines === 2 ? "line-clamp-2" : "truncate",
            )}
          >
            {data.label}
          </span>
          {!layout.sub && <SrcHint src={marks?.src} />}
        </div>
        {layout.sub && (
          <div className="mt-0.5 max-w-full truncate text-xs leading-tight text-ink-3" title={srcTitle(marks?.src)}>
            <span className={typed ? "mono" : undefined}>{sub}</span>
            <SrcHint src={marks?.src} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ArchComponentNode(props: NodeProps<ArchNode>) {
  const { id, data } = props;
  const shape = data.shape;
  // React Flow measures a node's handles when it mounts, resizes or changes
  // type. A new shape moves them without any of those, so measure again.
  const updateInternals = useUpdateNodeInternals();
  const drawn = useRef(shape);
  useEffect(() => {
    if (drawn.current === shape) return;
    drawn.current = shape;
    updateInternals(id);
  }, [id, shape, updateInternals]);
  return shape ? <ArchShapeNode {...props} shape={shape} /> : <ArchCardNode {...props} />;
}

function ArchCardNode({ id, data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const tile = accent ?? NEUTRAL;
  const nested = data.childCount > 0;
  const marks = data.marks;
  return (
    <div
      style={{ width, height }}
      className={cx(
        "arch-node arch-node-component relative flex items-center gap-2.5 rounded-md border bg-surface px-2.5",
        nested && "arch-node-nested",
        data.dropTarget && "arch-drop-target",
        diffClass(marks),
      )}
    >
      <Resizer id={id} data={data} />
      <EdgeHandles />
      <Badges marks={marks} />
      <NestedBadge path={data.path} count={data.childCount} />
      <GlyphSwatch
        tag={data.typeTag}
        color={accent}
        glyph={data.glyphKey}
        box={32}
        size={18}
        background={alpha(tile, 0.14)}
        className="rounded-sm"
      />
      <div className="min-w-0">
        <div className="arch-node-label truncate text-base font-semibold leading-tight text-ink">
          {data.label}
        </div>
        <div className="truncate text-xs leading-tight text-ink-3" title={srcTitle(marks?.src)}>
          <span className={data.typeTag ? "mono" : undefined}>
            {data.typeTag ?? "component"}
          </span>
          <SrcHint src={marks?.src} />
        </div>
      </div>
    </div>
  );
}

export function ArchPlaneNode({ id, data, width, height }: NodeProps<ArchNode>) {
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
        data.dropTarget && "arch-drop-target",
        diffClass(marks),
      )}
    >
      <Resizer id={id} data={data} />
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
      </div>
    </div>
  );
}

/**
 * A component outside the canvas that something on it connects to, shown
 * beside the canvas when you're inside a component. Clicking it goes there.
 */
export function ArchContextNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const accent = displayColor(data.accent ?? lookupType(data.typeTag)?.color, isDark);
  return (
    <div
      style={{ width, height }}
      title={`${data.path} — outside this component. Click to go there.`}
      className="arch-node arch-node-context relative flex items-center gap-2 rounded-md border border-dashed px-2"
    >
      <EdgeHandles />
      <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} size={16} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold text-ink-2">{data.label}</div>
        <div className="mono truncate text-xs text-ink-3">{data.path}</div>
      </div>
    </div>
  );
}

export const nodeTypes = {
  archComponent: ArchComponentNode,
  archPlane: ArchPlaneNode,
  archContext: ArchContextNode,
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
  // The chip stays hidden (and out of the pointer's way) until the edge, or a
  // component it connects, is hovered or selected.
  const showLabel = selected || data?.endSelected === true || data?.lit === true;
  // Chips of connections sharing this path stack, one row each.
  const [slot, of] = data?.stack ?? [0, 1];
  const chipY = labelY + (slot - (of - 1) / 2) * 22;
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
      {selected && (
        <>
          <circle className="arch-edge-end" cx={sourceX} cy={sourceY} r={4} />
          <circle className="arch-edge-end" cx={targetX} cy={targetY} r={4} />
        </>
      )}
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${chipY}px)` }}
            className={cx(
              "arch-edge-chip nodrag nopan absolute flex h-[18px] items-center gap-1 rounded-sm border bg-surface px-1.5 text-xs leading-none",
              showLabel && "arch-edge-chip-shown",
              data?.lit === false && "dim",
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
