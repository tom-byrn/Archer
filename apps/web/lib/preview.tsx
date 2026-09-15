/**
 * Pure SVG thumbnail of an Archer document: containers, leaves and
 * connections, no text. Scales into any box via viewBox.
 */

import {
  autoLayout,
  effectiveDisplay,
  layoutMap,
  parse,
  pathToString,
  type ArchDoc,
  type ComponentNode,
} from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { CELL } from "@/lib/toFlow";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  plane: boolean;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function build(doc: ArchDoc): { boxes: Box[]; lines: Line[] } {
  const layout = layoutMap(doc);
  const boxes: Box[] = [];
  const centers = new Map<string, { x: number; y: number }>();
  const visibleAncestor = new Map<string, string>();

  const walk = (
    items: ComponentNode[],
    prefix: string,
    parentVisible: boolean,
    collapsed: string | null,
    origin: [number, number],
  ) => {
    for (const c of items) {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const entry = layout.get(path);
      const display = effectiveDisplay(c, entry);
      const visible = parentVisible && collapsed === null;
      visibleAncestor.set(path, collapsed ?? path);
      const at = entry?.at ?? [0, 0];
      const size = entry?.size ?? [4, 3];
      const abs: [number, number] = [origin[0] + at[0] * CELL, origin[1] + at[1] * CELL];
      if (visible) {
        const w = size[0] * CELL;
        const h = size[1] * CELL;
        centers.set(path, { x: abs[0] + w / 2, y: abs[1] + h / 2 });
        boxes.push({
          x: abs[0],
          y: abs[1],
          w,
          h,
          color: c.type ? lookupType(c.type)?.color : undefined,
          plane: display === "plane" && c.children.length > 0,
        });
      }
      const childCollapsed =
        collapsed ?? (display === "icon" && c.children.length > 0 ? path : null);
      walk(c.children, path, visible, childCollapsed, abs);
    }
  };
  walk(doc.components, "", true, null, [0, 0]);

  const lines: Line[] = [];
  for (const conn of doc.connections) {
    const s = visibleAncestor.get(pathToString(conn.source));
    const t = visibleAncestor.get(pathToString(conn.target));
    if (!s || !t || s === t) continue;
    const a = centers.get(s);
    const b = centers.get(t);
    if (!a || !b) continue;
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return { boxes, lines };
}

export function DocPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  let scene: { boxes: Box[]; lines: Line[] } = { boxes: [], lines: [] };
  try {
    scene = build(autoLayout(parse(source).doc));
  } catch {
    scene = { boxes: [], lines: [] };
  }
  const { boxes, lines } = scene;

  const pad = CELL;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (boxes.length === 0) {
    minX = 0;
    minY = 0;
    maxX = CELL * 8;
    maxY = CELL * 5;
  }
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  // Stroke widths are in user units; keep them readable at thumbnail scale.
  const sw = Math.max(2, (maxX - minX) / 160);
  const r = CELL / 4;

  return (
    <svg
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {boxes
        .filter((b) => b.plane)
        .map((b, i) => (
          <rect
            key={`p${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={r}
            fill={b.color ?? "var(--line-2)"}
            fillOpacity={0.08}
            stroke={b.color ?? "var(--line-2)"}
            strokeOpacity={0.7}
            strokeWidth={sw}
            strokeDasharray={`${sw * 3} ${sw * 2}`}
          />
        ))}
      {lines.map((l, i) => (
        <line
          key={`l${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="var(--edge)"
          strokeWidth={sw}
          strokeOpacity={0.8}
        />
      ))}
      {boxes
        .filter((b) => !b.plane)
        .map((b, i) => (
          <rect
            key={`n${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={r}
            fill={b.color ?? "var(--ink-3)"}
            fillOpacity={0.3}
            stroke={b.color ?? "var(--ink-3)"}
            strokeWidth={sw}
          />
        ))}
    </svg>
  );
}
