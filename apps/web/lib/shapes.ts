/**
 * Component shapes as geometry: the outline a component's box takes on the
 * canvas (`components/nodes.tsx`), in the SVG renderer (`lib/svg.ts`) and in
 * the shape pickers, for any box size. Pure: no React, no DOM, so every
 * place that draws a shape draws the same one.
 *
 * Which shapes exist is the language's business (`SHAPES` in @archer/lang);
 * this file decides how each looks. A shape fills its box, so edges keep
 * attaching at the middle of each side; `anchors` says how far in from the
 * box the outline sits there, for the few shapes whose outline doesn't reach
 * that point (a folder's top, a bucket's tapered sides).
 */

import type { Shape } from "@archer/lang";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeGeometry {
  /** Filled, outlined parts, painted in order (a person's body, then the head over it). */
  parts: string[];
  /** Inner lines over the fill, outline only: a cylinder's rim, a browser's toolbar. */
  details: string;
  /** Small solid marks in the outline's color: LEDs, eyes, window buttons. */
  dots: string;
  /** Where the label goes: the roomy middle of the shape. */
  content: Rect;
  /** Distance from each side of the box in to the outline, at that side's middle (edge ends). */
  anchors: { t: number; r: number; b: number; l: number };
}

/** Outline inset from the box, so a 2px (selected) stroke stays inside it. */
const PAD = 1;

const r2 = (v: number): number => Math.round(v * 100) / 100;
const pt = (x: number, y: number): string => `${r2(x)},${r2(y)}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A rectangle with its own radius per corner: top-left, top-right, bottom-right, bottom-left. */
function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | [number, number, number, number],
): string {
  const max = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (typeof radii === "number" ? [radii, radii, radii, radii] : radii).map(
    (r) => clamp(r, 0, max),
  ) as [number, number, number, number];
  const arc = (r: number, x2: number, y2: number) => (r > 0 ? `A${r2(r)},${r2(r)} 0 0 1 ${pt(x2, y2)}` : `L${pt(x2, y2)}`);
  return (
    `M${pt(x + tl, y)}H${r2(x + w - tr)}${arc(tr, x + w, y + tr)}` +
    `V${r2(y + h - br)}${arc(br, x + w - br, y + h)}` +
    `H${r2(x + bl)}${arc(bl, x, y + h - bl)}` +
    `V${r2(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${pt(cx - rx, cy)}A${r2(rx)},${r2(ry)} 0 1 1 ${pt(cx + rx, cy)}A${r2(rx)},${r2(ry)} 0 1 1 ${pt(cx - rx, cy)}Z`;

const dot = (cx: number, cy: number, r: number): string => ellipse(cx, cy, r, r);

/** A closed polygon with its corners softened by `r` (quadratic, through the corner's control). */
function softPolygon(points: [number, number][], r: number): string {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i + n - 1) % n]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[(i + 1) % n]!;
    const toward = (ax: number, ay: number): [number, number] => {
      const len = Math.hypot(ax - cx, ay - cy);
      const t = Math.min(r, len / 2) / len;
      return [cx + (ax - cx) * t, cy + (ay - cy) * t];
    };
    const [ax, ay] = toward(px, py);
    const [bx, by] = toward(nx, ny);
    d += `${i === 0 ? "M" : "L"}${pt(ax, ay)}Q${pt(cx, cy)} ${pt(bx, by)}`;
  }
  return `${d}Z`;
}

/* ------------------------------------------------------------------ Cloud */

/**
 * The cloud, drawn in a 120 × 80 design box and stretched to fit: puffs are
 * circles, the outline is their union's rim plus a flat base the two end
 * puffs rest on. The crown peaks near mid-width and the sides bulge out near
 * mid-height, so edges meet the outline (CLOUD_ANCHORS measures exactly where).
 */
const CLOUD_W = 120;
const CLOUD_H = 80;
/** Puffs clockwise from the bottom left: [cx, cy, r]. The first and last touch the base. */
const PUFFS: [number, number, number][] = [
  [23, 57, 23],
  [40, 34, 19],
  [64, 27, 27],
  [89, 35, 21],
  [98, 58, 22],
];

/** Where two puffs' rims cross, on the outside of the cloud (the upper crossing). */
function crossing(a: [number, number, number], b: [number, number, number]): [number, number] {
  const [x1, y1, ra] = a;
  const [x2, y2, rb] = b;
  const d = Math.hypot(x2 - x1, y2 - y1);
  const along = (ra * ra - rb * rb + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, ra * ra - along * along));
  const mx = x1 + (along * (x2 - x1)) / d;
  const my = y1 + (along * (y2 - y1)) / d;
  const px = (-(y2 - y1) / d) * off;
  const py = ((x2 - x1) / d) * off;
  // Of the two crossings, the outer one is the higher (smaller y).
  return my - py < my + py ? [mx - px, my - py] : [mx + px, my + py];
}

/** The cloud's rim in design units: arcs from puff to puff, then the flat base. */
const CLOUD_ARCS = (() => {
  const [fx, fy, fr] = PUFFS[0]!;
  const [lx, ly, lr] = PUFFS[PUFFS.length - 1]!;
  const start: [number, number] = [fx, fy + fr];
  const end: [number, number] = [lx, ly + lr];
  const joints = PUFFS.slice(1).map((p, i) => crossing(PUFFS[i]!, p));
  const stops = [start, ...joints, end];
  return PUFFS.map(([cx, cy, r], i) => {
    const [ax, ay] = stops[i]!;
    const [bx, by] = stops[i + 1]!;
    // Clockwise on screen; the large-arc flag from the angle actually swept.
    const a0 = Math.atan2(ay - cy, ax - cx);
    const a1 = Math.atan2(by - cy, bx - cx);
    const sweep = (a1 - a0 + 4 * Math.PI) % (2 * Math.PI);
    return { r, from: [ax, ay] as [number, number], to: [bx, by] as [number, number], large: sweep > Math.PI };
  });
})();

/** Leftmost (side -1) or rightmost (side 1) point of the puffs at design height `y`. */
const cloudExtent = (y: number, side: 1 | -1): number => {
  let best = side === 1 ? -Infinity : Infinity;
  for (const [cx, cy, r] of PUFFS) {
    if (Math.abs(y - cy) > r) continue;
    const x = cx + side * Math.sqrt(r * r - (y - cy) ** 2);
    best = side === 1 ? Math.max(best, x) : Math.min(best, x);
  }
  return best;
};

/** Highest point of the puffs at design x (the crown's height there). */
const cloudTop = (x: number): number => {
  let best = Infinity;
  for (const [cx, cy, r] of PUFFS)
    if (Math.abs(x - cx) <= r) best = Math.min(best, cy - Math.sqrt(r * r - (x - cx) ** 2));
  return best;
};

/** Anchor insets as fractions of the box (they scale with it). */
const CLOUD_ANCHORS = {
  t: cloudTop(CLOUD_W / 2) / CLOUD_H,
  r: (CLOUD_W - cloudExtent(CLOUD_H / 2, 1)) / CLOUD_W,
  b: 0,
  l: cloudExtent(CLOUD_H / 2, -1) / CLOUD_W,
};

function cloud(x0: number, y0: number, w: number, h: number): string {
  const sx = w / CLOUD_W;
  const sy = h / CLOUD_H;
  const at = ([x, y]: [number, number]) => pt(x0 + x * sx, y0 + y * sy);
  let d = `M${at(CLOUD_ARCS[0]!.from)}`;
  for (const a of CLOUD_ARCS)
    d += `A${r2(a.r * sx)},${r2(a.r * sy)} 0 ${a.large ? 1 : 0} 1 ${at(a.to)}`;
  return `${d}Z`;
}

/* ----------------------------------------------------------------- Shapes */

type Builder = (x: number, y: number, w: number, h: number) => ShapeGeometry;

const NO_ANCHORS = { t: 0, r: 0, b: 0, l: 0 };

const BUILDERS: Record<Shape, Builder> = {
  box: (x, y, w, h) => ({
    parts: [roundedRect(x, y, w, h, 6)],
    details: "",
    dots: "",
    content: { x: x + 8, y: y + 6, w: w - 16, h: h - 12 },
    anchors: NO_ANCHORS,
  }),

  cylinder: (x, y, w, h) => {
    const ry = clamp(h * 0.11, 3, 13);
    const rx = w / 2;
    return {
      parts: [
        `M${pt(x, y + ry)}A${r2(rx)},${r2(ry)} 0 0 1 ${pt(x + w, y + ry)}` +
          `V${r2(y + h - ry)}A${r2(rx)},${r2(ry)} 0 0 1 ${pt(x, y + h - ry)}Z`,
      ],
      details: `M${pt(x, y + ry)}A${r2(rx)},${r2(ry)} 0 0 0 ${pt(x + w, y + ry)}`,
      dots: "",
      content: { x: x + 8, y: y + 2 * ry + 3, w: w - 16, h: h - 3 * ry - 5 },
      anchors: NO_ANCHORS,
    };
  },

  cloud: (x, y, w, h) => ({
    parts: [cloud(x, y, w, h)],
    details: "",
    dots: "",
    content: { x: x + w * 0.2, y: y + h * 0.3, w: w * 0.6, h: h * 0.64 },
    anchors: {
      t: CLOUD_ANCHORS.t * h,
      r: CLOUD_ANCHORS.r * w,
      b: CLOUD_ANCHORS.b * h,
      l: CLOUD_ANCHORS.l * w,
    },
  }),

  server: (x, y, w, h) => {
    // A rack: the label in the top unit, two more units with status lights below.
    const unit = clamp(h * 0.17, 5, 16);
    const rules = [y + h - 2 * unit, y + h - unit];
    const led = clamp(unit * 0.14, 1, 2);
    const ledX = x + w - clamp(w * 0.08, 5, 12);
    return {
      parts: [roundedRect(x, y, w, h, 6)],
      details: rules.map((ry) => `M${pt(x, ry)}H${r2(x + w)}`).join(""),
      dots: rules
        .flatMap((ry) => [dot(ledX, ry + unit / 2, led), dot(ledX - led * 3.2, ry + unit / 2, led)])
        .join(""),
      content: { x: x + 8, y: y + 4, w: w - 16, h: rules[0]! - y - 6 },
      anchors: NO_ANCHORS,
    };
  },

  robot: (x, y, w, h) => {
    // An antenna, a boxy head with ears and two eyes, square shoulders; the label on the chest.
    const ball = clamp(h * 0.028, 1.5, 3.2);
    const stalk = clamp(h * 0.06, 2, 7);
    const headTop = y + 2 * ball + stalk;
    const headH = clamp(h * 0.34, 8, 44);
    const headW = Math.min(headH * 1.4, w * 0.5);
    const cx = x + w / 2;
    const bodyTop = headTop + headH * 0.78;
    const ear = { w: Math.max(2, headH * 0.1), h: headH * 0.4 };
    const earY = headTop + headH * 0.28;
    const eye = clamp(headH * 0.1, 1, 3.6);
    const eyeY = headTop + headH * 0.45;
    const shoulder = Math.min((y + h - bodyTop) * 0.3, w * 0.12);
    return {
      parts: [
        roundedRect(x, bodyTop, w, y + h - bodyTop, [shoulder, shoulder, 6, 6]),
        // Ears tuck under the head's sides, which is painted over them.
        roundedRect(cx - headW / 2 - ear.w, earY, headW + 2 * ear.w, ear.h, Math.min(2, ear.w / 2)),
        roundedRect(cx - headW / 2, headTop, headW, headH, clamp(headH * 0.22, 2, 9)),
      ],
      details: `M${pt(cx, headTop)}V${r2(y + 2 * ball)}`,
      dots: [dot(cx, y + ball, ball), dot(cx - headW * 0.2, eyeY, eye), dot(cx + headW * 0.2, eyeY, eye)].join(""),
      content: bust(x, y, w, h, headTop + headH, bodyTop, shoulder),
      anchors: bustAnchors(y, h, bodyTop, shoulder),
    };
  },

  person: (x, y, w, h) => {
    // Head over rounded shoulders; the label on the chest.
    const head = Math.min(clamp(h * 0.4, 8, 56), w * 0.42);
    const cx = x + w / 2;
    const bodyTop = y + head * 0.78;
    const shoulder = Math.min((y + h - bodyTop) * 0.62, w * 0.3);
    return {
      parts: [
        roundedRect(x, bodyTop, w, y + h - bodyTop, [shoulder, shoulder, 6, 6]),
        dot(cx, y + head / 2, head / 2),
      ],
      details: "",
      dots: "",
      content: bust(x, y, w, h, y + head, bodyTop, shoulder),
      anchors: bustAnchors(y, h, bodyTop, shoulder),
    };
  },

  queue: (x, y, w, h) => {
    const rx = clamp(w * 0.07, 3, 13);
    const ry = h / 2;
    return {
      parts: [
        `M${pt(x + rx, y)}H${r2(x + w - rx)}A${r2(rx)},${r2(ry)} 0 0 1 ${pt(x + w - rx, y + h)}` +
          `H${r2(x + rx)}A${r2(rx)},${r2(ry)} 0 0 1 ${pt(x + rx, y)}Z`,
      ],
      details: `M${pt(x + w - rx, y)}A${r2(rx)},${r2(ry)} 0 0 0 ${pt(x + w - rx, y + h)}`,
      dots: "",
      content: { x: x + rx + 6, y: y + 4, w: w - 3 * rx - 12, h: h - 8 },
      anchors: NO_ANCHORS,
    };
  },

  bucket: (x, y, w, h) => {
    const ry = clamp(h * 0.11, 3, 13);
    const taper = w * 0.12;
    const bottomRy = ry * 0.75;
    const rim = y + ry;
    const foot = y + h - bottomRy;
    return {
      parts: [
        `M${pt(x, rim)}A${r2(w / 2)},${r2(ry)} 0 0 1 ${pt(x + w, rim)}` +
          `L${pt(x + w - taper, foot)}A${r2(w / 2 - taper)},${r2(bottomRy)} 0 0 1 ${pt(x + taper, foot)}Z`,
      ],
      details: `M${pt(x, rim)}A${r2(w / 2)},${r2(ry)} 0 0 0 ${pt(x + w, rim)}`,
      dots: "",
      content: { x: x + taper + 6, y: y + 2 * ry + 3, w: w - 2 * taper - 12, h: h - 2 * ry - bottomRy - 6 },
      // The sides lean in: where they cross mid-height.
      anchors: (() => {
        const side = (taper * (y + h / 2 - rim)) / (foot - rim);
        return { t: 0, r: side, b: 0, l: side };
      })(),
    };
  },

  browser: (x, y, w, h) => {
    const bar = clamp(h * 0.16, 5, 18);
    const button = clamp(bar * 0.13, 1, 2.4);
    const buttons = [0, 1, 2].map((i) => dot(x + bar * 0.55 + i * button * 3.4, y + bar / 2, button));
    return {
      parts: [roundedRect(x, y, w, h, 6)],
      details: `M${pt(x, y + bar)}H${r2(x + w)}`,
      dots: buttons.join(""),
      content: { x: x + 8, y: y + bar + 3, w: w - 16, h: h - bar - 6 },
      anchors: NO_ANCHORS,
    };
  },

  phone: (x, y, w, h) => {
    // The whole box is the device, turned to match it; the label is on the screen.
    const wide = w >= h;
    const long = wide ? w : h;
    const short = wide ? h : w;
    const radius = clamp(short * 0.14, 3, 16);
    const bezel = clamp(long * 0.08, 3, 14);
    const edge = clamp(short * 0.06, 2, 6);
    const screen: Rect = wide
      ? { x: x + bezel, y: y + edge, w: w - 2 * bezel, h: h - 2 * edge }
      : { x: x + edge, y: y + bezel, w: w - 2 * edge, h: h - 2 * bezel };
    const camera = clamp(bezel * 0.16, 1, 2.2);
    return {
      parts: [roundedRect(x, y, w, h, radius)],
      details: roundedRect(screen.x, screen.y, screen.w, screen.h, clamp(radius * 0.35, 1, 4)),
      dots: wide ? dot(x + bezel / 2, y + h / 2, camera) : dot(x + w / 2, y + bezel / 2, camera),
      content: { x: screen.x + 4, y: screen.y + 3, w: screen.w - 8, h: screen.h - 6 },
      anchors: NO_ANCHORS,
    };
  },

  document: (x, y, w, h) => {
    // A page with its top-right corner folded down.
    const fold = clamp(Math.min(w, h) * 0.2, 4, 20);
    return {
      parts: [
        `M${pt(x + 4, y)}H${r2(x + w - fold)}L${pt(x + w, y + fold)}V${r2(y + h - 4)}` +
          `A4,4 0 0 1 ${pt(x + w - 4, y + h)}H${r2(x + 4)}A4,4 0 0 1 ${pt(x, y + h - 4)}` +
          `V${r2(y + 4)}A4,4 0 0 1 ${pt(x + 4, y)}Z`,
      ],
      details: `M${pt(x + w - fold, y)}V${r2(y + fold)}H${r2(x + w)}`,
      dots: "",
      content: { x: x + 8, y: y + Math.max(6, fold * 0.6), w: w - 16, h: h - Math.max(6, fold * 0.6) - 6 },
      anchors: NO_ANCHORS,
    };
  },

  folder: (x, y, w, h) => {
    // A tab on the top left; the rest of the box is the folder's front.
    const tab = clamp(h * 0.12, 3, 12);
    const tabW = clamp(w * 0.36, 12, 88);
    const r = 5;
    const top = y + tab;
    return {
      parts: [
        `M${pt(x, y + r)}A${r},${r} 0 0 1 ${pt(x + r, y)}H${r2(x + tabW - tab * 0.6)}` +
          `Q${pt(x + tabW, y)} ${pt(x + tabW + tab * 0.6, top)}H${r2(x + w - r)}` +
          `A${r},${r} 0 0 1 ${pt(x + w, top + r)}V${r2(y + h - r)}A${r},${r} 0 0 1 ${pt(x + w - r, y + h)}` +
          `H${r2(x + r)}A${r},${r} 0 0 1 ${pt(x, y + h - r)}Z`,
      ],
      details: "",
      dots: "",
      content: { x: x + 8, y: top + 4, w: w - 16, h: h - tab - 8 },
      anchors: { t: tabW + tab * 0.6 < w / 2 ? tab : 0, r: 0, b: 0, l: 0 },
    };
  },

  stack: (x, y, w, h) => {
    // Three cards fanned up and to the right; the label on the front one.
    const off = clamp(Math.min(w, h) * 0.07, 3, 8);
    const card = (i: number) => roundedRect(x + i * off, y + (2 - i) * off, w - 2 * off, h - 2 * off, 6);
    return {
      parts: [card(2), card(1), card(0)],
      details: "",
      dots: "",
      content: { x: x + 8, y: y + 2 * off + 5, w: w - 2 * off - 16, h: h - 2 * off - 10 },
      anchors: NO_ANCHORS,
    };
  },

  hexagon: (x, y, w, h) => {
    const k = Math.min(h * 0.29, w * 0.25);
    const cy = y + h / 2;
    return {
      parts: [
        softPolygon(
          [
            [x, cy],
            [x + k, y],
            [x + w - k, y],
            [x + w, cy],
            [x + w - k, y + h],
            [x + k, y + h],
          ],
          4,
        ),
      ],
      details: "",
      dots: "",
      content: { x: x + k * 0.6 + 4, y: y + h * 0.18, w: w - 1.2 * k - 8, h: h * 0.64 },
      anchors: NO_ANCHORS,
    };
  },

  circle: (x, y, w, h) => ({
    parts: [ellipse(x + w / 2, y + h / 2, w / 2, h / 2)],
    details: "",
    dots: "",
    // The widest rectangle that still reads comfortably inside the ellipse.
    content: { x: x + w * 0.14, y: y + h * 0.17, w: w * 0.72, h: h * 0.66 },
    anchors: NO_ANCHORS,
  }),

  diamond: (x, y, w, h) => ({
    parts: [
      softPolygon(
        [
          [x + w / 2, y],
          [x + w, y + h / 2],
          [x + w / 2, y + h],
          [x, y + h / 2],
        ],
        5,
      ),
    ],
    details: "",
    dots: "",
    content: { x: x + w * 0.2, y: y + h * 0.3, w: w * 0.6, h: h * 0.4 },
    anchors: NO_ANCHORS,
  }),
};

/** The label area of a person or robot: the chest, below the head, clear of the shoulders. */
function bust(x: number, y: number, w: number, h: number, headBottom: number, bodyTop: number, shoulder: number): Rect {
  const top = Math.max(headBottom + 2, bodyTop + shoulder * 0.3);
  return { x: x + 8, y: top, w: w - 16, h: y + h - 4 - top };
}

/** Rounded shoulders pull the sides of a bust in, when they reach mid-height. */
function bustAnchors(y: number, h: number, bodyTop: number, shoulder: number) {
  const dy = y + h / 2 - bodyTop;
  const side = dy >= shoulder ? 0 : shoulder - Math.sqrt(shoulder * shoulder - (shoulder - Math.max(0, dy)) ** 2);
  return { t: 0, r: side, b: 0, l: side };
}

/** A shape's geometry for a `width` × `height` box (px), its outline inset so strokes stay inside. */
export function shapeGeometry(shape: Shape, width: number, height: number): ShapeGeometry {
  const w = Math.max(width - 2 * PAD, 8);
  const h = Math.max(height - 2 * PAD, 8);
  const g = BUILDERS[shape](PAD, PAD, w, h);
  const a = g.anchors;
  return { ...g, anchors: { t: a.t + PAD, r: a.r + PAD, b: a.b + PAD, l: a.l + PAD } };
}

/** Label metrics shared by the canvas and the SVG renderer (px). */
export const LABEL = {
  /** Name: 13px semibold, tight leading. */
  nameSize: 13,
  nameLine: 16,
  /** The line under it (type tag, "3 inside"): 11px, tight leading, 2px below the name. */
  subSize: 11,
  subLine: 14,
  subGap: 2,
  /** The glyph over the name, 4px above it. */
  glyph: 18,
  gap: 4,
} as const;

export interface LabelLayout {
  /** The type's glyph: over the name, before it, or left out for room. */
  glyph: "above" | "inline" | "none";
  /** Lines the name may wrap to. */
  lines: 1 | 2;
  /** Show the line under the name. */
  sub: boolean;
}

/**
 * How a shape's label fits its content area, centered in it: the glyph over
 * the name when there's height for it (else before it), the name on up to
 * two lines, and the type tag under it. What doesn't fit is left out, most
 * dispensable first: the second name line, the tag, then the glyph. Only a
 * typed component has a glyph; the line under the name is `hasSub`.
 */
export function labelLayout(content: Rect, typed: boolean, hasSub: boolean): LabelLayout {
  const { nameLine, subLine, subGap, glyph, gap } = LABEL;
  const fits = (g: LabelLayout["glyph"], lines: number, sub: boolean) =>
    (g === "above" ? glyph + gap : 0) + lines * nameLine + (sub ? subGap + subLine : 0) <= content.h &&
    (g !== "inline" || content.w >= 72);
  const glyphs: LabelLayout["glyph"][] = typed ? ["above", "inline"] : ["none"];
  for (const sub of hasSub ? [true, false] : [false])
    for (const g of glyphs)
      for (const lines of [2, 1] as const) if (fits(g, lines, sub)) return { glyph: g, lines, sub };
  return { glyph: typed && content.w >= 72 ? "inline" : "none", lines: 1, sub: false };
}
