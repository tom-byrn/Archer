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

/* ------------------------------------------------------ Drawn in a design box */

/** Maps a design box onto a component's box: points, and lengths along each axis. */
function unitBox(d: Rect, x: number, y: number, w: number, h: number) {
  const sx = w / d.w;
  const sy = h / d.h;
  return {
    x: (u: number) => x + (u - d.x) * sx,
    y: (v: number) => y + (v - d.y) * sy,
    w: (u: number) => u * sx,
    h: (v: number) => v * sy,
    pt: (u: number, v: number) => pt(x + (u - d.x) * sx, y + (v - d.y) * sy),
  };
}

/** The design box that just holds these circles ([cx, cy, r]) and rectangles ([x, y, w, h]). */
function boundsOf(circles: [number, number, number][], rects: [number, number, number, number][] = []): Rect {
  const x0 = Math.min(...circles.map(([cx, , r]) => cx - r), ...rects.map(([x]) => x));
  const y0 = Math.min(...circles.map(([, cy, r]) => cy - r), ...rects.map(([, y]) => y));
  const x1 = Math.max(...circles.map(([cx, , r]) => cx + r), ...rects.map(([x, , w]) => x + w));
  const y1 = Math.max(...circles.map(([, cy, r]) => cy + r), ...rects.map(([, y, , h]) => y + h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The stopwatch: its face [cx, cy, r], the crown on top (a stem and a button, [x, y, w, h]) and a side button. */
const CLOCK_FACE: [number, number, number] = [50, 58, 40];
const CLOCK_CROWN: [number, number, number, number][] = [
  [45, 9, 10, 12],
  [38, 2, 24, 9],
];
const CLOCK_BUTTON: [number, number, number] = [81, 27, 6];
const CLOCK_BOX = boundsOf([CLOCK_FACE, CLOCK_BUTTON], CLOCK_CROWN);

/**
 * The brain, seen from above: puffs round an ellipse, clockwise from the top
 * of the right hemisphere, mirrored for the left, leaving a notch where the
 * hemispheres meet top and bottom. As with the cloud, the outline is the rim
 * of the puffs' union.
 */
const BRAIN_CENTER: [number, number] = [60, 50];
const BRAIN_PUFFS: [number, number, number][] = (() => {
  const right: [number, number][] = [
    [-76, 12.5],
    [-51, 13.5],
    [-25, 12.5],
    [0, 13.5],
    [25, 12.5],
    [51, 13.5],
    [76, 12],
  ];
  const left = right.map(([deg, r]): [number, number] => [180 - deg, r]).reverse();
  return [...right, ...left].map(([deg, r]) => {
    const a = (deg * Math.PI) / 180;
    return [BRAIN_CENTER[0] + 46 * Math.cos(a), BRAIN_CENTER[1] + 36 * Math.sin(a), r];
  });
})();
const BRAIN_BOX = boundsOf(BRAIN_PUFFS);

/** Where two puffs' rims cross, on the outside of a ring of puffs round `center`. */
function outerCrossing(a: [number, number, number], b: [number, number, number], center: [number, number]): [number, number] {
  const [x1, y1, ra] = a;
  const [x2, y2, rb] = b;
  const d = Math.hypot(x2 - x1, y2 - y1);
  const along = (ra * ra - rb * rb + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, ra * ra - along * along));
  const mx = x1 + (along * (x2 - x1)) / d;
  const my = y1 + (along * (y2 - y1)) / d;
  const px = (-(y2 - y1) / d) * off;
  const py = ((x2 - x1) / d) * off;
  const far = (p: [number, number]) => Math.hypot(p[0] - center[0], p[1] - center[1]);
  const p: [number, number] = [mx + px, my + py];
  const q: [number, number] = [mx - px, my - py];
  return far(p) > far(q) ? p : q;
}

const BRAIN_ARCS = BRAIN_PUFFS.map((puff, i, all) => {
  const [cx, cy, r] = puff;
  const from = outerCrossing(all[(i + all.length - 1) % all.length]!, puff, BRAIN_CENTER);
  const to = outerCrossing(puff, all[(i + 1) % all.length]!, BRAIN_CENTER);
  // Clockwise on screen; the large-arc flag from the angle actually swept.
  const sweep = (Math.atan2(to[1] - cy, to[0] - cx) - Math.atan2(from[1] - cy, from[0] - cx) + 4 * Math.PI) % (2 * Math.PI);
  return { r, from, to, large: sweep > Math.PI };
});

/** The notches between the hemispheres: after the last right puff, and after the last left one. */
const BRAIN_NOTCHES = {
  bottom: BRAIN_ARCS[BRAIN_PUFFS.length / 2 - 1]!.to,
  top: BRAIN_ARCS[BRAIN_PUFFS.length - 1]!.to,
};

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

  /* ---- Basic ---- */

  pill: (x, y, w, h) => {
    // Round ends on the long axis. The label runs the straight part and into
    // the ends, as far as they're tall (or wide) enough for it.
    const r = Math.min(w, h) / 2;
    return {
      parts: [roundedRect(x, y, w, h, r)],
      details: "",
      dots: "",
      content:
        w >= h
          ? { x: x + r * 0.2 + 4, y: y + r * 0.4, w: w - r * 0.4 - 8, h: r * 1.2 }
          : { x: x + r * 0.2 + 4, y: y + r * 0.4 + 2, w: r * 1.6 - 8, h: h - r * 0.8 - 4 },
      anchors: NO_ANCHORS,
    };
  },

  parallelogram: (x, y, w, h) => {
    // Leaning right, like a flowchart's input/output.
    const k = Math.min(h * 0.3, w * 0.2);
    return {
      parts: [softPolygon([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], 4)],
      details: "",
      dots: "",
      content: { x: x + k * 0.6 + 4, y: y + h * 0.12, w: w - k * 1.2 - 8, h: h * 0.76 },
      // The slanted sides cross mid-height halfway along the lean.
      anchors: { t: 0, r: k / 2, b: 0, l: k / 2 },
    };
  },

  chevron: (x, y, w, h) => {
    // A step in a pipeline: notched at the back, pointed at the front.
    const k = Math.min(h * 0.35, w * 0.2);
    const cy = y + h / 2;
    return {
      parts: [
        softPolygon(
          [
            [x, y],
            [x + w - k, y],
            [x + w, cy],
            [x + w - k, y + h],
            [x, y + h],
            [x + k, cy],
          ],
          3,
        ),
      ],
      details: "",
      dots: "",
      content: { x: x + k + 4, y: y + h * 0.12, w: w - 2 * k - 6, h: h * 0.76 },
      // Edges into the back end in the notch.
      anchors: { t: 0, r: 0, b: 0, l: k },
    };
  },

  subroutine: (x, y, w, h) => {
    // A flowchart's predefined process: a bar inside each end.
    const d = clamp(w * 0.08, 6, 14);
    return {
      parts: [roundedRect(x, y, w, h, 5)],
      details: `M${pt(x + d, y)}V${r2(y + h)}M${pt(x + w - d, y)}V${r2(y + h)}`,
      dots: "",
      content: { x: x + d + 5, y: y + 6, w: w - 2 * d - 10, h: h - 12 },
      anchors: NO_ANCHORS,
    };
  },

  note: (x, y, w, h) => {
    // A sticky note, its bottom-right corner turned up.
    const fold = clamp(Math.min(w, h) * 0.2, 4, 20);
    return {
      parts: [
        `M${pt(x + 4, y)}H${r2(x + w - 4)}A4,4 0 0 1 ${pt(x + w, y + 4)}V${r2(y + h - fold)}` +
          `L${pt(x + w - fold, y + h)}H${r2(x + 4)}A4,4 0 0 1 ${pt(x, y + h - 4)}` +
          `V${r2(y + 4)}A4,4 0 0 1 ${pt(x + 4, y)}Z`,
      ],
      details: `M${pt(x + w - fold, y + h)}V${r2(y + h - fold)}H${r2(x + w)}`,
      dots: "",
      content: { x: x + 8, y: y + 6, w: w - 16, h: h - Math.max(6, fold * 0.6) - 6 },
      anchors: NO_ANCHORS,
    };
  },

  /* ---- People ---- */

  people: (x, y, w, h) => {
    // Three people: one in front, two behind; the label on the front one's chest.
    const back = Math.min(clamp(h * 0.3, 6, 44), w * 0.24);
    const backTop = y + back * 0.78;
    const backW = w * 0.46;
    const backShoulder = Math.min((y + h - backTop) * 0.62, backW * 0.3);
    const front = Math.min(clamp(h * 0.36, 7, 50), w * 0.3);
    const frontY = y + Math.min(h * 0.12, back * 0.45);
    const frontTop = frontY + front * 0.78;
    const fx = x + w * 0.16;
    const fw = w * 0.68;
    const frontShoulder = Math.min((y + h - frontTop) * 0.62, fw * 0.3);
    const behind = (left: number) =>
      roundedRect(left, backTop, backW, y + h - backTop, [backShoulder, backShoulder, 6, 6]);
    return {
      parts: [
        behind(x),
        behind(x + w - backW),
        dot(x + backW / 2, y + back / 2, back / 2),
        dot(x + w - backW / 2, y + back / 2, back / 2),
        roundedRect(fx, frontTop, fw, y + h - frontTop, [frontShoulder, frontShoulder, 6, 6]),
        dot(x + w / 2, frontY + front / 2, front / 2),
      ],
      details: "",
      dots: "",
      content: bust(fx, y, fw, h, frontY + front, frontTop, frontShoulder),
      anchors: { ...bustAnchors(y, h, backTop, backShoulder), t: frontY - y },
    };
  },

  building: (x, y, w, h) => {
    // An institution: a pediment over columns on a base; the label between the columns.
    const roof = clamp(h * 0.26, 4, 40);
    const lip = clamp(h * 0.05, 1.5, 6);
    const inset = clamp(w * 0.05, 2, 10);
    const base = clamp(h * 0.1, 2, 12);
    const gap = clamp(w * 0.06, 2.5, 12);
    const eave = y + roof + lip;
    const foot = y + h - base;
    // Two columns each side; the middle ones make way for the label.
    const columns = [1, 2, -1, -2]
      .map((i) => (i > 0 ? x + inset + i * gap : x + w - inset + i * gap))
      .map((cx) => `M${pt(cx, eave)}V${r2(foot)}`)
      .join("");
    const side = inset + 2 * gap + 4;
    return {
      parts: [
        softPolygon(
          [
            [x, y + roof],
            [x + w / 2, y],
            [x + w, y + roof],
            [x + w, eave],
            [x + w - inset, eave],
            [x + w - inset, foot],
            [x + w, foot],
            [x + w, y + h],
            [x, y + h],
            [x, foot],
            [x + inset, foot],
            [x + inset, eave],
            [x, eave],
          ],
          1.5,
        ),
      ],
      details: `M${pt(x, y + roof)}H${r2(x + w)}${columns}`,
      dots: "",
      content: { x: x + side, y: eave + 4, w: w - 2 * side, h: foot - eave - 8 },
      // The body is narrower than the roof and base: edges from the sides end on it.
      anchors: { t: 0, r: inset, b: 0, l: inset },
    };
  },

  /* ---- Apps & devices ---- */

  desktop: (x, y, w, h) => {
    // A monitor on a stand; the label on the screen.
    const stand = clamp(h * 0.2, 4, 28);
    const screenH = h - stand;
    const radius = clamp(Math.min(w, screenH) * 0.07, 2, 8);
    const bezel = clamp(Math.min(w, screenH) * 0.06, 2, 7);
    const neck = clamp(w * 0.1, 3, 22);
    const footW = clamp(w * 0.42, 10, 120);
    const footH = clamp(stand * 0.3, 1.5, 7);
    const cx = x + w / 2;
    return {
      parts: [
        // The neck runs from under the screen to under the foot, which cover its ends.
        `M${pt(cx - neck / 2, y + screenH - 2)}H${r2(cx + neck / 2)}V${r2(y + h - footH + 1)}H${r2(cx - neck / 2)}Z`,
        roundedRect(cx - footW / 2, y + h - footH, footW, footH, footH / 2),
        roundedRect(x, y, w, screenH, radius),
      ],
      details: roundedRect(x + bezel, y + bezel, w - 2 * bezel, screenH - 2 * bezel, Math.max(1, radius - bezel / 2)),
      dots: "",
      content: { x: x + bezel + 4, y: y + bezel + 3, w: w - 2 * bezel - 8, h: screenH - 2 * bezel - 6 },
      anchors: NO_ANCHORS,
    };
  },

  laptop: (x, y, w, h) => {
    // An open laptop: the lid and its screen over a base as wide as the box.
    const base = clamp(h * 0.12, 3, 14);
    const lidH = h - base;
    const inset = clamp(w * 0.1, 3, 40);
    const lx = x + inset;
    const lw = w - 2 * inset;
    const radius = clamp(Math.min(lw, lidH) * 0.07, 2, 8);
    const bezel = clamp(Math.min(lw, lidH) * 0.06, 2, 7);
    const groove = clamp(w * 0.14, 4, 36);
    const round = Math.min(base * 0.6, 6);
    const cx = x + w / 2;
    const deck = y + lidH;
    return {
      parts: [
        roundedRect(lx, y, lw, lidH + 1, [radius, radius, 0, 0]),
        `M${pt(x, deck)}H${r2(x + w)}V${r2(y + h - round)}Q${pt(x + w, y + h)} ${pt(x + w - round, y + h)}` +
          `H${r2(x + round)}Q${pt(x, y + h)} ${pt(x, y + h - round)}Z`,
      ],
      details:
        roundedRect(lx + bezel, y + bezel, lw - 2 * bezel, lidH - 2 * bezel, Math.max(1, radius - bezel / 2)) +
        `M${pt(cx - groove / 2, deck)}V${r2(deck + base * 0.35)}H${r2(cx + groove / 2)}V${r2(deck)}`,
      dots: "",
      content: { x: lx + bezel + 4, y: y + bezel + 3, w: lw - 2 * bezel - 8, h: lidH - 2 * bezel - 6 },
      // The lid is narrower than the base: edges from the sides end on it.
      anchors: { t: 0, r: inset, b: 0, l: inset },
    };
  },

  terminal: (x, y, w, h) => {
    // A console window: a prompt, >_, in its top-left corner; the label below it.
    const p = clamp(h * 0.15, 4, 12);
    const px = x + clamp(w * 0.07, 4, 14);
    const py = y + clamp(h * 0.1, 3.5, 11);
    const top = py + p + 3;
    return {
      parts: [roundedRect(x, y, w, h, 6)],
      details:
        `M${pt(px, py)}L${pt(px + p * 0.55, py + p / 2)}L${pt(px, py + p)}` +
        `M${pt(px + p * 0.85, py + p)}H${r2(px + p * 1.6)}`,
      dots: "",
      content: { x: x + 8, y: top, w: w - 16, h: y + h - 6 - top },
      anchors: NO_ANCHORS,
    };
  },

  chip: (x, y, w, h) => {
    // A chip: pins along every side of the package, the label on the die.
    const pin = clamp(Math.min(w, h) * 0.1, 2, 10);
    const bx = x + pin;
    const by = y + pin;
    const bw = w - 2 * pin;
    const bh = h - 2 * pin;
    const die = clamp(Math.min(bw, bh) * 0.1, 2, 9);
    // An even number of pins per side, so each side's middle, where edges end, stays clear.
    const along = (len: number) => {
      const n = clamp(2 * Math.round(len / 56), 2, 8);
      return Array.from({ length: n }, (_, i) => len * (0.1 + (0.8 * (i + 0.5)) / n));
    };
    let pins = "";
    for (const d of along(bw)) pins += `M${pt(bx + d, y)}V${r2(by)}M${pt(bx + d, by + bh)}V${r2(y + h)}`;
    for (const d of along(bh)) pins += `M${pt(x, by + d)}H${r2(bx)}M${pt(bx + bw, by + d)}H${r2(x + w)}`;
    return {
      parts: [roundedRect(bx, by, bw, bh, clamp(Math.min(bw, bh) * 0.06, 2, 6))],
      details: pins + roundedRect(bx + die, by + die, bw - 2 * die, bh - 2 * die, 2),
      dots: "",
      content: { x: bx + die + 4, y: by + die + 3, w: bw - 2 * die - 8, h: bh - 2 * die - 6 },
      anchors: { t: pin, r: pin, b: pin, l: pin },
    };
  },

  /* ---- Network & security ---- */

  globe: (x, y, w, h) => {
    // Meridians and parallels in the polar caps, and a clear band round the
    // equator for the label.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const band = 0.55;
    const lat = Math.sqrt(1 - band * band);
    const north = cy - ry * band;
    const south = cy + ry * band;
    const mrx = rx * 0.5;
    const mx = mrx * lat;
    return {
      parts: [ellipse(cx, cy, rx, ry)],
      details:
        `M${pt(cx - rx * lat, north)}H${r2(cx + rx * lat)}M${pt(cx - rx * lat, south)}H${r2(cx + rx * lat)}` +
        `M${pt(cx, y)}V${r2(north)}M${pt(cx, south)}V${r2(y + h)}` +
        `M${pt(cx, y)}A${r2(mrx)},${r2(ry)} 0 0 0 ${pt(cx - mx, north)}` +
        `M${pt(cx, y)}A${r2(mrx)},${r2(ry)} 0 0 1 ${pt(cx + mx, north)}` +
        `M${pt(cx - mx, south)}A${r2(mrx)},${r2(ry)} 0 0 0 ${pt(cx, y + h)}` +
        `M${pt(cx + mx, south)}A${r2(mrx)},${r2(ry)} 0 0 1 ${pt(cx, y + h)}`,
      dots: "",
      content: { x: cx - rx * 0.8, y: north + 3, w: rx * 1.6, h: south - north - 6 },
      anchors: NO_ANCHORS,
    };
  },

  firewall: (x, y, w, h) => {
    // A brick wall with a plaque set into it, which holds the label.
    const n = Math.max(6, Math.round(h / clamp(h * 0.12, 3, 13)));
    const c = h / n;
    const brick = clamp(c * 2.3, 6, 32);
    const k = n >= 8 ? 2 : 1;
    const side = clamp(w * 0.14, 5, 40);
    const plaque: Rect = { x: x + side, y: y + k * c, w: w - 2 * side, h: (n - 2 * k) * c };
    const inRows = (y0: number, y1: number) => y1 > plaque.y + 0.01 && y0 < plaque.y + plaque.h - 0.01;
    let bricks = "";
    // Mortar between courses, and the joints in each, staggered; none on the plaque.
    for (let i = 1; i < n; i++) {
      const ly = y + i * c;
      bricks +=
        i >= k && i <= n - k
          ? `M${pt(x, ly)}H${r2(plaque.x)}M${pt(plaque.x + plaque.w, ly)}H${r2(x + w)}`
          : `M${pt(x, ly)}H${r2(x + w)}`;
    }
    for (let i = 0; i < n; i++) {
      const top = y + i * c;
      for (let jx = x + (i % 2 === 0 ? brick * 0.5 : brick); jx < x + w - 2; jx += brick) {
        const onPlaque = inRows(top, top + c) && jx > plaque.x - 1 && jx < plaque.x + plaque.w + 1;
        if (!onPlaque) bricks += `M${pt(jx, top)}V${r2(top + c)}`;
      }
    }
    return {
      parts: [roundedRect(x, y, w, h, 3)],
      details: bricks + roundedRect(plaque.x, plaque.y, plaque.w, plaque.h, 3),
      dots: "",
      content: { x: plaque.x + 4, y: plaque.y + 3, w: plaque.w - 8, h: plaque.h - 6 },
      anchors: NO_ANCHORS,
    };
  },

  shield: (x, y, w, h) => {
    // Straight sides down to halfway, then curving in to a point.
    const r = clamp(Math.min(w, h) * 0.08, 2, 8);
    const cx = x + w / 2;
    const mid = y + h / 2;
    return {
      parts: [
        `M${pt(x + r, y)}H${r2(x + w - r)}Q${pt(x + w, y)} ${pt(x + w, y + r)}V${r2(mid)}` +
          `Q${pt(x + w, y + h * 0.84)} ${pt(cx, y + h)}Q${pt(x, y + h * 0.84)} ${pt(x, mid)}` +
          `V${r2(y + r)}Q${pt(x, y)} ${pt(x + r, y)}Z`,
      ],
      details: "",
      dots: "",
      content: { x: x + w * 0.12, y: y + h * 0.08, w: w * 0.76, h: h * 0.6 },
      anchors: NO_ANCHORS,
    };
  },

  lock: (x, y, w, h) => {
    // A padlock: the shackle over the body; the label on the body.
    const sw = Math.min(w * 0.56, h * 0.9);
    const sh = Math.min(h * 0.4, sw * 0.75);
    const t = clamp(sw * 0.13, 2, 10);
    const cx = x + w / 2;
    const top = y + sh;
    const rx = sw / 2;
    const ry = Math.min(rx, sh);
    const legs = y + ry;
    return {
      parts: [
        // The shackle's legs end under the body, which is painted over them.
        `M${pt(cx - rx, top + 2)}V${r2(legs)}A${r2(rx)},${r2(ry)} 0 0 1 ${pt(cx + rx, legs)}V${r2(top + 2)}` +
          `H${r2(cx + rx - t)}V${r2(legs)}A${r2(rx - t)},${r2(ry - t)} 0 0 0 ${pt(cx - rx + t, legs)}V${r2(top + 2)}Z`,
        roundedRect(x, top, w, h - sh, clamp(Math.min(w, h - sh) * 0.1, 3, 10)),
      ],
      details: "",
      dots: "",
      content: { x: x + 8, y: top + 6, w: w - 16, h: h - sh - 12 },
      anchors: NO_ANCHORS,
    };
  },

  /* ---- Compute ---- */

  cube: (x, y, w, h) => {
    // A box in perspective: its front, top and right side; the label on the front.
    const d = clamp(Math.min(w, h) * 0.16, 3, 22);
    const fx = x + w - d;
    const fy = y + d;
    return {
      parts: [
        softPolygon(
          [
            [x, fy],
            [x + d, y],
            [x + w, y],
            [x + w, y + h - d],
            [fx, y + h],
            [x, y + h],
          ],
          2,
        ),
      ],
      details: `M${pt(x, fy)}H${r2(fx)}L${pt(x + w, y)}M${pt(fx, fy)}V${r2(y + h)}`,
      dots: "",
      content: { x: x + 8, y: fy + 5, w: w - d - 16, h: h - d - 10 },
      anchors: NO_ANCHORS,
    };
  },

  module: (x, y, w, h) => {
    // UML's component: a box with two tabs on its left side.
    const tw = clamp(w * 0.14, 6, 22);
    const th = clamp(h * 0.13, 4, 13);
    const tab = (cy: number) => roundedRect(x, cy - th / 2, tw, th, 1.5);
    return {
      parts: [roundedRect(x + tw / 2, y, w - tw / 2, h, 5), tab(y + h * 0.3), tab(y + h * 0.66)],
      details: "",
      dots: "",
      content: { x: x + tw + 6, y: y + 6, w: w - tw - 12, h: h - 12 },
      // Between the tabs, edges end on the box's left side.
      anchors: { t: 0, r: 0, b: 0, l: tw / 2 },
    };
  },

  gear: (x, y, w, h) => {
    // A cog: eight teeth round a wheel, one at the middle of each side; the label on the wheel.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const n = 8;
    const root = 0.76;
    const tip = (Math.PI / n) * 0.46;
    const base = (Math.PI / n) * 0.6;
    const at = (a: number, f: number) => pt(cx + (Math.cos(a) * f * w) / 2, cy + (Math.sin(a) * f * h) / 2);
    const arc = (f: number, a: number) => `A${r2((f * w) / 2)},${r2((f * h) / 2)} 0 0 1 ${at(a, f)}`;
    let d = `M${at(-base, root)}`;
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      d += `L${at(a - tip, 1)}${arc(1, a + tip)}L${at(a + base, root)}${arc(root, a + (2 * Math.PI) / n - base)}`;
    }
    return {
      parts: [`${d}Z`],
      details: "",
      dots: "",
      content: { x: cx - w * 0.28, y: cy - h * 0.25, w: w * 0.56, h: h * 0.5 },
      anchors: NO_ANCHORS,
    };
  },

  clock: (x, y, w, h) => {
    // A stopwatch: the crown on top, a button at the side, marks round the face.
    const at = unitBox(CLOCK_BOX, x, y, w, h);
    const [fx, fy, fr] = CLOCK_FACE;
    const [bx, by, br] = CLOCK_BUTTON;
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      const from = i % 3 === 0 ? 0.74 : 0.82;
      const mark = (f: number) => at.pt(fx + Math.cos(a) * fr * f, fy + Math.sin(a) * fr * f);
      return `M${mark(from)}L${mark(0.92)}`;
    }).join("");
    // Where the face's rim crosses the middle of the box's height.
    const side = Math.sqrt(fr * fr - (CLOCK_BOX.y + CLOCK_BOX.h / 2 - fy) ** 2);
    return {
      parts: [
        ...CLOCK_CROWN.map(([cx0, cy0, cw, ch]) =>
          roundedRect(at.x(cx0), at.y(cy0), at.w(cw), at.h(ch), Math.min(at.w(cw), at.h(ch)) / 3),
        ),
        ellipse(at.x(bx), at.y(by), at.w(br), at.h(br)),
        ellipse(at.x(fx), at.y(fy), at.w(fr), at.h(fr)),
      ],
      details: ticks,
      dots: "",
      content: { x: at.x(fx - fr * 0.62), y: at.y(fy - fr * 0.5), w: at.w(fr * 1.24), h: at.h(fr) },
      anchors: {
        t: 0,
        r: at.w(CLOCK_BOX.x + CLOCK_BOX.w - fx - side),
        b: at.h(CLOCK_BOX.y + CLOCK_BOX.h - fy - fr),
        l: at.w(fx - side - CLOCK_BOX.x),
      },
    };
  },

  puzzle: (x, y, w, h) => {
    // A jigsaw piece with knobs on its top and right, each at the middle of
    // the box's side so edges end on them; the label on the piece.
    const k = clamp(Math.min(w, h) * 0.2, 4, 24);
    const right = x + w - k;
    const top = y + k;
    const n = k * 0.34;
    const kr = k * 0.5;
    const r = clamp(Math.min(w, h) * 0.05, 2, 6);
    const mx = x + w / 2;
    const my = y + h / 2;
    const reach = Math.sqrt(kr * kr - n * n);
    const neckY = y + kr + reach;
    const neckX = x + w - kr - reach;
    return {
      parts: [
        `M${pt(x + r, top)}H${r2(mx - n)}V${r2(neckY)}A${r2(kr)},${r2(kr)} 0 1 1 ${pt(mx + n, neckY)}V${r2(top)}` +
          `H${r2(right - r)}A${r},${r} 0 0 1 ${pt(right, top + r)}V${r2(my - n)}H${r2(neckX)}` +
          `A${r2(kr)},${r2(kr)} 0 1 1 ${pt(neckX, my + n)}H${r2(right)}V${r2(y + h - r)}` +
          `A${r},${r} 0 0 1 ${pt(right - r, y + h)}H${r2(x + r)}A${r},${r} 0 0 1 ${pt(x, y + h - r)}` +
          `V${r2(top + r)}A${r},${r} 0 0 1 ${pt(x + r, top)}Z`,
      ],
      details: "",
      dots: "",
      content: { x: x + 8, y: top + 6, w: right - x - 16, h: h - k - 12 },
      anchors: NO_ANCHORS,
    };
  },

  brain: (x, y, w, h) => {
    // The brain from above: the fissure between the hemispheres runs its
    // length, parting round the label; grooves run in from the folds.
    const at = unitBox(BRAIN_BOX, x, y, w, h);
    let d = `M${at.pt(...BRAIN_ARCS[0]!.from)}`;
    for (const a of BRAIN_ARCS) d += `A${r2(at.w(a.r))},${r2(at.h(a.r))} 0 ${a.large ? 1 : 0} 1 ${at.pt(...a.to)}`;
    const [tx, ty] = BRAIN_NOTCHES.top;
    const [bx, by] = BRAIN_NOTCHES.bottom;
    const [mx, my] = BRAIN_CENTER;
    const content = { x: x + w * 0.2, y: at.y(my - 19), w: w * 0.6, h: at.h(38) };
    const grooves = BRAIN_ARCS.filter((a) => a.to !== BRAIN_NOTCHES.top && a.to !== BRAIN_NOTCHES.bottom)
      .map(({ to: [vx, vy] }) => `M${at.pt(vx, vy)}Q${at.pt(vx + (mx - vx) * 0.12, vy + (my - vy) * 0.2)} ${at.pt(vx + (mx - vx) * 0.24, vy + (my - vy) * 0.2)}`)
      .join("");
    return {
      parts: [`${d}Z`],
      details:
        `M${at.pt(tx, ty)}V${r2(Math.max(at.y(ty), content.y - 3))}` +
        `M${at.pt(bx, by)}V${r2(Math.min(at.y(by), content.y + content.h + 3))}${grooves}`,
      dots: "",
      content,
      anchors: { t: at.y(ty) - y, r: 0, b: y + h - at.y(by), l: 0 },
    };
  },

  /* ---- Data & storage ---- */

  table: (x, y, w, h) => {
    // A table: the label in its header row, a grid of cells below.
    const head = clamp(h * 0.4, 12, 56);
    const bodyTop = y + head;
    const rows = Math.max(2, Math.round((h - head) / 20));
    const cols = Math.max(2, Math.round(w / 60));
    let grid = `M${pt(x, bodyTop)}H${r2(x + w)}`;
    for (let i = 1; i < rows; i++) grid += `M${pt(x, bodyTop + ((h - head) * i) / rows)}H${r2(x + w)}`;
    for (let j = 1; j < cols; j++) grid += `M${pt(x + (w * j) / cols, bodyTop)}V${r2(y + h)}`;
    return {
      parts: [roundedRect(x, y, w, h, 5)],
      details: grid,
      dots: "",
      content: { x: x + 8, y: y + 3, w: w - 16, h: head - 6 },
      anchors: NO_ANCHORS,
    };
  },

  memory: (x, y, w, h) => {
    // A memory module: chips along the top of the board, gold contacts along
    // its lower edge with a gap in the middle, where edges from below end.
    const pins = clamp(h * 0.14, 3, 12);
    const board = h - pins;
    const r = clamp(Math.min(w, board) * 0.05, 2, 5);
    const pitch = clamp(w * 0.045, 3, 7);
    const gap = clamp(w * 0.08, 5, 16);
    const cx = x + w / 2;
    let contacts = "";
    for (let px = x + pitch; px < x + w - pitch / 2; px += pitch)
      if (Math.abs(px - cx) > gap / 2) contacts += `M${pt(px, y + board)}V${r2(y + h)}`;
    const chipH = clamp(h * 0.16, 3, 16);
    const chipY = y + clamp(h * 0.08, 2, 9);
    const count = clamp(Math.round(w / 40), 2, 8);
    const margin = clamp(w * 0.07, 3, 14);
    const chipGap = clamp(w * 0.04, 2, 10);
    const chipW = (w - 2 * margin - (count - 1) * chipGap) / count;
    const chips = Array.from({ length: count }, (_, i) =>
      roundedRect(x + margin + i * (chipW + chipGap), chipY, chipW, chipH, 1.5),
    ).join("");
    const top = chipY + chipH + 4;
    return {
      parts: [roundedRect(x, y, w, board, [r, r, 1, 1])],
      details: chips + contacts,
      dots: "",
      content: { x: x + 8, y: top, w: w - 16, h: y + board - 4 - top },
      anchors: { t: 0, r: 0, b: pins, l: 0 },
    };
  },

  archive: (x, y, w, h) => {
    // An archive box: its lid over the box, a handle slot below the lid; the label on the front.
    const lid = clamp(h * 0.22, 5, 24);
    const inset = clamp(w * 0.045, 2, 8);
    const r = clamp(Math.min(w, h) * 0.04, 2, 5);
    const slotW = clamp(w * 0.2, 6, 44);
    const slotH = clamp(h * 0.06, 2, 6);
    const slotY = y + lid + clamp(h * 0.08, 2, 10);
    const top = slotY + slotH + 4;
    return {
      parts: [
        roundedRect(x + inset, y + lid - 2, w - 2 * inset, h - lid + 2, [0, 0, r, r]),
        roundedRect(x, y, w, lid, r),
      ],
      details: roundedRect(x + w / 2 - slotW / 2, slotY, slotW, slotH, slotH / 2),
      dots: "",
      content: { x: x + inset + 6, y: top, w: w - 2 * inset - 12, h: y + h - 6 - top },
      // The box is narrower than its lid: edges from the sides end on the box.
      anchors: { t: 0, r: inset, b: 0, l: inset },
    };
  },

  book: (x, y, w, h) => {
    // A closed book: its spine down the left, the edges of its pages along the bottom.
    const spine = clamp(w * 0.12, 5, 20);
    const pages = clamp(h * 0.1, 3, 10);
    const r = clamp(Math.min(w, h) * 0.05, 2, 6);
    return {
      parts: [roundedRect(x, y, w, h, [r / 2, r, r, r / 2])],
      details:
        `M${pt(x + spine, y)}V${r2(y + h)}` +
        `M${pt(x + spine, y + h - pages)}H${r2(x + w)}M${pt(x + spine, y + h - pages / 2)}H${r2(x + w)}`,
      dots: "",
      content: { x: x + spine + 6, y: y + 6, w: w - spine - 12, h: h - pages - 10 },
      anchors: NO_ANCHORS,
    };
  },

  search: (x, y, w, h) => {
    // A magnifying glass: the lens over its handle; the label in the lens.
    const rx = w * 0.44;
    const ry = h * 0.44;
    const cx = x + rx;
    const cy = y + ry;
    const t = clamp(Math.min(w, h) * 0.11, 2, 12);
    const rim = t * 0.55;
    const sx = cx + rx * Math.SQRT1_2 * 0.9;
    const sy = cy + ry * Math.SQRT1_2 * 0.9;
    const len = Math.hypot(x + w - sx, y + h - sy);
    const ux = (x + w - sx) / len;
    const uy = (y + h - sy) / len;
    const nx = (-uy * t) / 2;
    const ny = (ux * t) / 2;
    // The handle's end pulled back from the corner until its own corners are inside the box.
    const back = Math.max(Math.abs(ny) / uy, Math.abs(nx) / ux);
    const ex = x + w - ux * back;
    const ey = y + h - uy * back;
    // Where the lens's rim crosses the middle of each side of the box.
    const across = (from: number, half: number, radius: number) =>
      radius * Math.sqrt(Math.max(0, 1 - ((half - from) / radius) ** 2));
    return {
      parts: [
        softPolygon(
          [
            [sx + nx, sy + ny],
            [ex + nx, ey + ny],
            [ex - nx, ey - ny],
            [sx - nx, sy - ny],
          ],
          t * 0.45,
        ),
        ellipse(cx, cy, rx, ry),
      ],
      details: ellipse(cx, cy, rx - rim, ry - rim),
      dots: "",
      content: {
        x: cx - (rx - rim) * 0.8,
        y: cy - (ry - rim) * 0.52,
        w: (rx - rim) * 1.6,
        h: (ry - rim) * 1.04,
      },
      anchors: {
        t: ry - across(rx, w / 2, rx) * (ry / rx),
        r: w - rx - across(ry, h / 2, ry) * (rx / ry),
        b: h - ry - across(rx, w / 2, rx) * (ry / rx),
        l: rx - across(ry, h / 2, ry) * (rx / ry),
      },
    };
  },

  funnel: (x, y, w, h) => {
    // A funnel: a wide mouth narrowing to a spout; the label in the mouth.
    const cx = x + w / 2;
    const mouth = y + h * 0.36;
    const neck = y + h * 0.76;
    const sp = clamp(w * 0.09, 2, 14);
    // Where the narrowing sides cross mid-height.
    const side = ((y + h / 2 - mouth) / (neck - mouth)) * (w / 2 - sp);
    return {
      parts: [
        softPolygon(
          [
            [x, y],
            [x + w, y],
            [x + w, mouth],
            [cx + sp, neck],
            [cx + sp, y + h],
            [cx - sp, y + h],
            [cx - sp, neck],
            [x, mouth],
          ],
          3,
        ),
      ],
      details: "",
      dots: "",
      content: { x: x + w * 0.1, y: y + h * 0.07, w: w * 0.8, h: h * 0.36 },
      anchors: { t: 0, r: side, b: 0, l: side },
    };
  },

  /* ---- Messaging & monitoring ---- */

  envelope: (x, y, w, h) => {
    // An envelope, its flap folded down to a point; the label below the point.
    const r = clamp(Math.min(w, h) * 0.05, 2, 6);
    const flap = Math.min(h * 0.42, w * 0.3);
    const inset = r * 0.3;
    return {
      parts: [roundedRect(x, y, w, h, r)],
      details: `M${pt(x + inset, y + inset)}L${pt(x + w / 2, y + flap)}L${pt(x + w - inset, y + inset)}`,
      dots: "",
      content: { x: x + 8, y: y + flap + 4, w: w - 16, h: h - flap - 10 },
      anchors: NO_ANCHORS,
    };
  },

  chat: (x, y, w, h) => {
    // A speech bubble, its tail at the bottom left; the label in the bubble.
    const tail = clamp(h * 0.16, 3, 18);
    const bh = h - tail;
    const r = clamp(Math.min(w, bh) * 0.2, 3, 18);
    const t0 = x + Math.max(r, w * 0.16);
    const t1 = t0 + clamp(w * 0.18, 4, 36);
    const tip = x + clamp(w * 0.1, 2, 30);
    return {
      parts: [
        `M${pt(x + r, y)}H${r2(x + w - r)}A${r2(r)},${r2(r)} 0 0 1 ${pt(x + w, y + r)}V${r2(y + bh - r)}` +
          `A${r2(r)},${r2(r)} 0 0 1 ${pt(x + w - r, y + bh)}H${r2(t1)}L${pt(tip, y + h)}L${pt(t0, y + bh)}` +
          `H${r2(x + r)}A${r2(r)},${r2(r)} 0 0 1 ${pt(x, y + bh - r)}V${r2(y + r)}A${r2(r)},${r2(r)} 0 0 1 ${pt(x + r, y)}Z`,
      ],
      details: "",
      dots: "",
      content: { x: x + 8, y: y + 6, w: w - 16, h: bh - 12 },
      // The tail is off to the left: edges from below end on the bubble.
      anchors: { t: 0, r: 0, b: tail, l: 0 },
    };
  },

  bell: (x, y, w, h) => {
    // A bell: a knob on top, the clapper below the lip; the label on the bell.
    const at = (u: number, v: number) => pt(x + u * w, y + v * h);
    return {
      parts: [
        ellipse(x + 0.5 * w, y + 0.93 * h, 0.07 * w, 0.07 * h),
        ellipse(x + 0.5 * w, y + 0.065 * h, 0.05 * w, 0.055 * h),
        `M${at(0, 0.84)}C${at(0.1, 0.8)} ${at(0.13, 0.66)} ${at(0.14, 0.5)}` +
          `C${at(0.15, 0.24)} ${at(0.3, 0.1)} ${at(0.5, 0.1)}` +
          `C${at(0.7, 0.1)} ${at(0.85, 0.24)} ${at(0.86, 0.5)}` +
          `C${at(0.87, 0.66)} ${at(0.9, 0.8)} ${at(1, 0.84)}` +
          `Q${at(1, 0.88)} ${at(0.96, 0.88)}H${r2(x + 0.04 * w)}Q${at(0, 0.88)} ${at(0, 0.84)}Z`,
      ],
      details: "",
      dots: "",
      content: { x: x + w * 0.2, y: y + h * 0.3, w: w * 0.6, h: h * 0.5 },
      anchors: { t: 0.01 * h, r: 0.14 * w, b: 0, l: 0.14 * w },
    };
  },

  gauge: (x, y, w, h) => {
    // A meter: a dial with its scale and needle over a body; the label on the body.
    const dome = Math.min(h * 0.44, w * 0.55);
    const base = y + dome;
    const cx = x + w / 2;
    const rx = w / 2;
    const r = clamp(Math.min(w, h) * 0.06, 2, 8);
    const scale = Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI + (i * Math.PI) / 6;
      const from = i % 3 === 0 ? 0.72 : 0.8;
      return `M${pt(cx + Math.cos(a) * rx * from, base + Math.sin(a) * dome * from)}L${pt(cx + Math.cos(a) * rx * 0.9, base + Math.sin(a) * dome * 0.9)}`;
    }).join("");
    const needle = Math.PI * 1.7;
    const pivot = clamp(Math.min(w, h) * 0.03, 1.2, 3.5);
    return {
      parts: [
        `M${pt(x, base)}A${r2(rx)},${r2(dome)} 0 0 1 ${pt(x + w, base)}V${r2(y + h - r)}` +
          `A${r},${r} 0 0 1 ${pt(x + w - r, y + h)}H${r2(x + r)}A${r},${r} 0 0 1 ${pt(x, y + h - r)}Z`,
      ],
      details: `${scale}M${pt(cx, base)}L${pt(cx + Math.cos(needle) * rx * 0.62, base + Math.sin(needle) * dome * 0.62)}`,
      dots: dot(cx, base, pivot),
      content: { x: x + 8, y: base + pivot + 4, w: w - 16, h: y + h - 6 - (base + pivot + 4) },
      anchors: NO_ANCHORS,
    };
  },
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
  /** The icon: over the name, before it, or left out (for room, or when there's none). */
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
 * component with an icon (its own, or its type's) has a glyph; the line under
 * the name is `hasSub`.
 */
export function labelLayout(content: Rect, hasIcon: boolean, hasSub: boolean): LabelLayout {
  const { nameLine, subLine, subGap, glyph, gap } = LABEL;
  const fits = (g: LabelLayout["glyph"], lines: number, sub: boolean) =>
    (g === "above" ? glyph + gap : 0) + lines * nameLine + (sub ? subGap + subLine : 0) <= content.h &&
    (g !== "inline" || content.w >= 72);
  const glyphs: LabelLayout["glyph"][] = hasIcon ? ["above", "inline"] : ["none"];
  for (const sub of hasSub ? [true, false] : [false])
    for (const g of glyphs)
      for (const lines of [2, 1] as const) if (fits(g, lines, sub)) return { glyph: g, lines, sub };
  return { glyph: hasIcon && content.w >= 72 ? "inline" : "none", lines: 1, sub: false };
}
