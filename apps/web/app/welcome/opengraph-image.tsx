import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { autoLayout, canvasAt, layoutMap, parse, pathToString, shapeOf } from "@archer/lang";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { HEADLINE, LEDE } from "@/lib/landingCopy";
import { LANDING_SAMPLE } from "@/lib/landingSample";
import { labelLayout, shapeGeometry, type LabelLayout, type ShapeGeometry } from "@/lib/shapes";
import { displayColor, mix } from "@/lib/svg";

/**
 * The link preview: the landing page's first screen. Same words, same faces
 * (Newsreader headline, Playfair wordmark, Inter body) and the sandbox's
 * starting diagram drawn the way the canvas draws it (components/nodes.tsx).
 */

export const alt = HEADLINE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Literal colors: the dark-theme tokens from globals.css (no CSS variables here).
const GROUND = "#121315";
const SURFACE = "#161719";
const INK = "#ecebe7";
const INK_2 = "#a5a19a";
const INK_3 = "#6d6963";
const LINE = "#26292d";
const LINE_2 = "#383c42";
// An untyped plane: --surface-2 at half strength over the canvas ground.
const PLANE = "#17181b";
// Connectors read as ink on the landing canvas (`.landing-canvas` in landing.css).
const EDGE = INK;

const NEWSREADER = "Newsreader";
const PLAYFAIR = "Playfair Display";
const INTER = "Inter";
const MONO = "Geist Mono";

// Static instances of the site's Google Fonts (Newsreader at opsz 72, the
// headline's optical size); Satori cannot read variable axes or woff2. Read
// from the source tree: the image is rendered at build time, in apps/web.
const font = (file: string) => readFile(join(process.cwd(), "app/welcome/fonts", file));
const loadFonts = async () => {
  const [newsreader, playfair, inter, interSemibold, mono] = await Promise.all([
    font("Newsreader-500-opsz72.ttf"),
    font("PlayfairDisplay-700.ttf"),
    font("Inter-400.ttf"),
    font("Inter-600.ttf"),
    font("GeistMono-400.ttf"),
  ]);
  return [
    { name: NEWSREADER, data: newsreader, weight: 500 as const, style: "normal" as const },
    { name: PLAYFAIR, data: playfair, weight: 700 as const, style: "normal" as const },
    { name: INTER, data: inter, weight: 400 as const, style: "normal" as const },
    { name: INTER, data: interSemibold, weight: 600 as const, style: "normal" as const },
    { name: MONO, data: mono, weight: 400 as const, style: "normal" as const },
  ];
};

/* ------------------------------------------------------------- Diagram */

// The sandbox fits its 40px grid to the viewport; here one cell is 28px.
const CELL = 28;
// Shapes are worked out at the canvas's own cell and scaled down, so the
// outline and what the label shows are exactly the canvas's.
const CANVAS_CELL = 40;
const SCALE = CELL / CANVAS_CELL;
const ARROW = 5; // half-width of an arrowhead
const RADIUS = 6; // corner radius of a stepped connector

interface Box {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  glyph: string;
  /** Drawn as a shape (lib/shapes.ts, at canvas size) instead of the card. */
  shape?: { geo: ShapeGeometry; label: LabelLayout; stroke: string; fill: string };
}
/** A plane: a titled region drawn behind the boxes on it. */
interface Region {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Edge {
  d: string;
  head: string;
  chip: { x: number; y: number; protocol?: string; label?: string } | null;
}

const alpha = (hex: string, a: number): string =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;

/** Round to keep the SVG path short. */
const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Orthogonal three-segment path between the facing sides of two boxes, with
 * rounded corners: what React Flow's smooth-step edge draws on the canvas.
 */
const route = (s: Box, t: Box): { d: string; head: string; mid: [number, number] } => {
  const sc = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  const tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sign = horizontal ? Math.sign(dx) || 1 : Math.sign(dy) || 1;
  const p1 = horizontal
    ? { x: sc.x + (sign * s.w) / 2, y: sc.y }
    : { x: sc.x, y: sc.y + (sign * s.h) / 2 };
  const p2 = horizontal
    ? { x: tc.x - (sign * t.w) / 2, y: tc.y }
    : { x: tc.x, y: tc.y - (sign * t.h) / 2 };
  const parts = [`M${r(p1.x)} ${r(p1.y)}`];
  if (horizontal) {
    const mx = (p1.x + p2.x) / 2;
    const vy = Math.sign(p2.y - p1.y);
    if (vy === 0) parts.push(`H${r(p2.x)}`);
    else {
      const k = Math.min(RADIUS, Math.abs(p2.y - p1.y) / 2, Math.abs(mx - p1.x));
      parts.push(
        `H${r(mx - sign * k)}`,
        `Q${r(mx)} ${r(p1.y)} ${r(mx)} ${r(p1.y + vy * k)}`,
        `V${r(p2.y - vy * k)}`,
        `Q${r(mx)} ${r(p2.y)} ${r(mx + sign * k)} ${r(p2.y)}`,
        `H${r(p2.x)}`,
      );
    }
  } else {
    const my = (p1.y + p2.y) / 2;
    const hx = Math.sign(p2.x - p1.x);
    if (hx === 0) parts.push(`V${r(p2.y)}`);
    else {
      const k = Math.min(RADIUS, Math.abs(p2.x - p1.x) / 2, Math.abs(my - p1.y));
      parts.push(
        `V${r(my - sign * k)}`,
        `Q${r(p1.x)} ${r(my)} ${r(p1.x + hx * k)} ${r(my)}`,
        `H${r(p2.x - hx * k)}`,
        `Q${r(p2.x)} ${r(my)} ${r(p2.x)} ${r(my + sign * k)}`,
        `V${r(p2.y)}`,
      );
    }
  }
  // Arrowhead pointing into the target from the side the path arrives on.
  const { x, y } = p2;
  const head = horizontal
    ? `${x},${y} ${x - sign * ARROW * 2},${y - ARROW} ${x - sign * ARROW * 2},${y + ARROW}`
    : `${x},${y} ${x - ARROW},${y - sign * ARROW * 2} ${x + ARROW},${y - sign * ARROW * 2}`;
  return { d: parts.join(""), head, mid: [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2] };
};

/** The landing sample's planes, boxes and connectors in diagram pixels (origin at the top-left). */
const diagram = () => {
  const doc = autoLayout(parse(LANDING_SAMPLE).doc);
  const layout = layoutMap(doc);
  // An `at` is relative to the plane an item sits on; canvasAt adds those up.
  const regions: Region[] = doc.planes.map((p) => {
    const [ax, ay] = canvasAt(doc, [p.id], layout);
    const [sw, sh] = layout.get(p.id)?.size ?? [10, 6];
    return { id: p.id, name: p.name ?? p.id, x: ax * CELL, y: ay * CELL, w: sw * CELL, h: sh * CELL };
  });
  const boxes: Box[] = doc.components.map((c) => {
    const [ax, ay] = canvasAt(doc, [c.id], layout);
    const [sw, sh] = layout.get(c.id)?.size ?? [4, 3];
    const type = lookupType(c.type);
    const typed = c.type !== undefined;
    const color = displayColor(type?.color ?? "#8a8479", true);
    const shape = shapeOf(c);
    const geo = shape === "box" ? undefined : shapeGeometry(shape, sw * CANVAS_CELL, sh * CANVAS_CELL);
    return {
      id: c.id,
      name: c.name ?? c.id,
      type: c.type ?? "component",
      x: ax * CELL,
      y: ay * CELL,
      w: sw * CELL,
      h: sh * CELL,
      color,
      glyph: type?.glyph ?? "box",
      ...(geo && {
        shape: {
          geo,
          // The type tag is the only line under the name here: nothing is drawn collapsed.
          label: labelLayout(geo.content, typed, typed),
          // Tinted by a type that resolves, as on the canvas (canvas.css `.arch-shape-typed`).
          stroke: type ? mix(color, LINE_2, 0.45) : LINE_2,
          fill: type ? mix(color, SURFACE, 0.05) : SURFACE,
        },
      }),
    };
  });
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const edges: Edge[] = [];
  for (const c of doc.connections) {
    const s = byId.get(pathToString(c.source));
    const t = byId.get(pathToString(c.target));
    if (!s || !t || s === t) continue;
    const { d, head, mid } = route(s, t);
    const chip =
      c.type !== undefined || c.label !== undefined
        ? { x: mid[0], y: mid[1], protocol: c.type, label: c.label }
        : null;
    edges.push({ d, head, chip });
  }
  const all = [...regions, ...boxes];
  const width = Math.max(...all.map((b) => b.x + b.w));
  const height = Math.max(...all.map((b) => b.y + b.h));
  return { regions, boxes, edges, width, height };
};

const glyphSrc = (key: string, color: string): string => {
  const inner = (GLYPHS[key] ?? GLYPHS.box!).replaceAll("currentColor", color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${GLYPH_VIEWBOX}">${inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

// A component's name, and its type tag under it.
const NAME: CSSProperties = {
  fontFamily: INTER,
  fontWeight: 600,
  fontSize: 11.5,
  lineHeight: 1.15,
  color: INK,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const TAG: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  lineHeight: 1.15,
  color: INK_3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function Node({ box }: { box: Box }) {
  if (box.shape) return <ShapeNode box={box} shape={box.shape} />;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 8px",
        borderRadius: 5,
        border: `1px solid ${LINE_2}`,
        background: SURFACE,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          flexShrink: 0,
          borderRadius: 3,
          background: alpha(box.color, 0.14),
        }}
      >
        <img src={glyphSrc(box.glyph, box.color)} width={15} height={15} alt="" />
      </div>
      {/* Explicit width: Satori truncates text only inside a sized box. */}
      <div style={{ display: "flex", flexDirection: "column", width: box.w - 50, gap: 2 }}>
        <div style={NAME}>{box.name}</div>
        <div style={TAG}>{box.type}</div>
      </div>
    </div>
  );
}

/**
 * A component with a shape (components/nodes.tsx ArchShapeNode): the outline
 * fills the box, and the label sits centered in the shape's roomy middle, with
 * as much of glyph, name and tag as the canvas finds room for.
 */
function ShapeNode({ box, shape }: { box: Box; shape: NonNullable<Box["shape"]> }) {
  const { geo, label, stroke, fill } = shape;
  const c = geo.content;
  const width = c.w * SCALE;
  const glyph = (size: number) => <img src={glyphSrc(box.glyph, box.color)} width={size} height={size} alt="" />;
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex" }}>
      {/* Canvas-size geometry, scaled down; the stroke stays 1px. */}
      <svg
        width={box.w}
        height={box.h}
        viewBox={`0 0 ${(box.w / CELL) * CANVAS_CELL} ${(box.h / CELL) * CANVAS_CELL}`}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {geo.parts.map((d, i) => (
          <path key={i} d={d} fill={fill} stroke={stroke} strokeWidth={1 / SCALE} strokeLinejoin="round" />
        ))}
        {geo.details && <path d={geo.details} fill="none" stroke={stroke} strokeWidth={1 / SCALE} />}
        {geo.dots && <path d={geo.dots} fill={stroke} />}
      </svg>
      <div
        style={{
          position: "absolute",
          left: c.x * SCALE,
          top: c.y * SCALE,
          width,
          height: c.h * SCALE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {label.glyph === "above" && <div style={{ display: "flex", marginBottom: 3 }}>{glyph(15)}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width }}>
          {label.glyph === "inline" && glyph(12)}
          <div style={{ ...NAME, maxWidth: label.glyph === "inline" ? width - 17 : width }}>{box.name}</div>
        </div>
        {label.sub && <div style={{ ...TAG, maxWidth: width, marginTop: 2 }}>{box.type}</div>}
      </div>
    </div>
  );
}

/** An untyped plane as the canvas draws it: a faint region with a title bar. */
function Plane({ region }: { region: Region }) {
  return (
    <div
      style={{
        position: "absolute",
        left: region.x,
        top: region.y,
        width: region.w,
        height: region.h,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        border: `1px solid ${LINE_2}`,
        background: PLANE,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 26,
          padding: "0 9px",
          borderBottom: `1px solid ${LINE}`,
          fontFamily: INTER,
          fontWeight: 600,
          fontSize: 11.5,
          color: INK,
        }}
      >
        {region.name}
      </div>
    </div>
  );
}

function Chip({ chip }: { chip: NonNullable<Edge["chip"]> }) {
  // A wide, centred flex box puts the auto-width chip on the path's midpoint.
  return (
    <div
      style={{
        position: "absolute",
        left: chip.x - 100,
        top: chip.y - 8,
        width: 200,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          height: 16,
          padding: "0 5px",
          borderRadius: 3,
          border: `1px solid ${LINE}`,
          background: SURFACE,
          fontSize: 9.5,
          lineHeight: 1,
        }}
      >
        {chip.protocol !== undefined && (
          <span style={{ fontFamily: MONO, color: INK_2 }}>{chip.protocol}</span>
        )}
        {chip.protocol !== undefined && chip.label !== undefined && (
          <span style={{ fontFamily: INTER, color: INK_3 }}>·</span>
        )}
        {chip.label !== undefined && (
          <span style={{ fontFamily: INTER, color: INK }}>{chip.label}</span>
        )}
      </div>
    </div>
  );
}

/** The sandbox panel: file name header over the canvas. */
function Sandbox({ width, height }: { width: number; height: number }) {
  const { regions, boxes, edges, width: dw, height: dh } = diagram();
  const header = 32;
  const ox = Math.round((width - dw) / 2);
  const oy = Math.round((height - header - dh) / 2);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        height,
        border: `1px solid ${LINE_2}`,
        background: SURFACE,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: header,
          padding: "0 14px",
          borderBottom: `1px solid ${LINE}`,
          fontFamily: MONO,
          fontSize: 12,
          color: INK_2,
        }}
      >
        architecture.arch
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          backgroundColor: GROUND,
        }}
      >
        <div style={{ position: "absolute", left: ox, top: oy, width: dw, height: dh, display: "flex" }}>
          {regions.map((p) => (
            <Plane key={p.id} region={p} />
          ))}
          {boxes.map((b) => (
            <Node key={b.id} box={b} />
          ))}
          <svg
            width={dw}
            height={dh}
            viewBox={`0 0 ${dw} ${dh}`}
            style={{ position: "absolute", left: 0, top: 0 }}
          >
            {edges.map((e, i) => (
              <path key={i} d={e.d} fill="none" stroke={EDGE} strokeWidth={1.5} />
            ))}
            {edges.map((e, i) => (
              <polygon key={i} points={e.head} fill={EDGE} />
            ))}
          </svg>
          {edges.map((e, i) => e.chip && <Chip key={i} chip={e.chip} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Page */

/** Diamond where a rule crosses the column's side rule (`.landing-joints`). */
const Joint = ({ left, top }: { left: number; top: number }) => (
  <div
    style={{
      position: "absolute",
      left: left - 4.5,
      top: top - 4.5,
      width: 8,
      height: 8,
      transform: "rotate(45deg)",
      border: `1px solid ${LINE_2}`,
      background: "#000",
    }}
  />
);

export default async function OpengraphImage() {
  const { width, height } = size;
  const col = { left: 40, right: width - 40 };
  const header = 88;
  // Clear of the right rule, with room between it and the headline.
  const panel = { left: 552, top: 128, width: 548, height: 432 };
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
          backgroundImage:
            "radial-gradient(ellipse 70% 65% at 50% 45%, #181818 0%, #0a0a0a 60%, #000 100%)",
          color: INK,
          fontFamily: INTER,
        }}
      >
        {/* The landing's ruled column. */}
        <div style={{ position: "absolute", left: col.left, top: 0, width: 1, height, background: LINE }} />
        <div style={{ position: "absolute", left: col.right, top: 0, width: 1, height, background: LINE }} />
        <div
          style={{ position: "absolute", left: col.left, top: header, width: col.right - col.left, height: 1, background: LINE }}
        />
        <Joint left={col.left} top={header} />
        <Joint left={col.right} top={header} />

        {/* Header: wordmark and nav. */}
        <div
          style={{
            position: "absolute",
            left: col.left + 40,
            top: 0,
            width: col.right - col.left - 80,
            height: header,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div style={{ fontFamily: PLAYFAIR, fontWeight: 700, fontSize: 28, letterSpacing: -0.3 }}>
            Archer
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 28, marginLeft: "auto", fontSize: 18, color: INK_2 }}>
            <span>Docs</span>
            <span
              style={{
                display: "flex",
                padding: "7px 14px",
                border: `1px solid ${LINE_2}`,
                borderRadius: 6,
                background: SURFACE,
                color: INK,
              }}
            >
              Sign in
            </span>
          </div>
        </div>

        {/* Headline and lede. */}
        <div
          style={{
            position: "absolute",
            left: col.left + 40,
            top: 148,
            width: 476,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontFamily: NEWSREADER,
              fontWeight: 500,
              fontSize: 62,
              lineHeight: 1.03,
              letterSpacing: "-0.012em",
              color: INK,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ paddingTop: 26, width: 430, fontSize: 21, lineHeight: 1.5, color: INK_2 }}>
            {LEDE}
          </div>
        </div>

        <div style={{ position: "absolute", left: panel.left, top: panel.top, display: "flex" }}>
          <Sandbox width={panel.width} height={panel.height} />
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() },
  );
}
