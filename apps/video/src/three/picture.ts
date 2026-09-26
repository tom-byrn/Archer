/**
 * A diagram as a picture, for things that show one (an embed in a README,
 * a doc, a slide): the same layout and routes as the canvas, painted flat
 * onto a 2D canvas in the light or dark theme, glyphs not logos.
 */
import { layoutDiagram } from "../diagram";
import { MONO, SANS, canvas, fit, glyphMarkup, icon, rgba } from "./paint";

const THEMES = {
  dark: { ground: "#101113", card: "#161719", line: "#2c2f34", ink: "#ecebe7", ink3: "#6d6963", edge: "#8a857d", dot: "#24272b" },
  light: { ground: "#f7f6f3", card: "#ffffff", line: "#e2dfd9", ink: "#1c1b19", ink3: "#8a857d", edge: "#77726a", dot: "#e4e1db" },
} as const;

export type Theme = keyof typeof THEMES;

/** Paint `source` (with its layout) at `scale` px per canvas px; returns the canvas. */
export function diagramPicture(source: string, theme: Theme, scale = 2, pad = 30): HTMLCanvasElement {
  const P = THEMES[theme];
  const d = layoutDiagram(source);
  const W = Math.round((d.bounds.w + pad * 2) * scale);
  const H = Math.round((d.bounds.h + pad * 2) * scale);
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = P.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.dot;
  for (let x = 20; x < W; x += 40 * (scale / 2)) for (let y = 20; y < H; y += 40 * (scale / 2)) ctx.fillRect(x, y, 2, 2);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(pad - d.bounds.x, pad - d.bounds.y);
  // Edges under the boxes.
  ctx.strokeStyle = P.edge;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  for (const e of d.edges) {
    ctx.beginPath();
    ctx.stroke(new Path2D(e.d));
    const [a, b] = e.points.slice(-2) as [{ x: number; y: number }, { x: number; y: number }];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.fillStyle = P.edge;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - 8 * Math.cos(ang - 0.45), b.y - 8 * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - 8 * Math.cos(ang + 0.45), b.y - 8 * Math.sin(ang + 0.45));
    ctx.fill();
  }
  for (const b of d.boxes) {
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.line;
    ctx.stroke();
    const tile = 30;
    const tx = b.x + 12;
    const ty = b.y + (b.h - tile) / 2;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tile, tile, 6);
    ctx.fillStyle = rgba(b.color, 0.16);
    ctx.fill();
    icon(ctx, glyphMarkup(b.glyph), tx + 7, ty + 7, 16, b.color);
    ctx.fillStyle = P.ink;
    ctx.font = `600 14px ${SANS}`;
    ctx.fillText(fit(ctx, b.name, b.w - tile - 34), tx + tile + 10, b.y + b.h / 2 - 1);
    ctx.fillStyle = P.ink3;
    ctx.font = `400 11px ${MONO}`;
    ctx.fillText(fit(ctx, b.type ?? "", b.w - tile - 34), tx + tile + 10, b.y + b.h / 2 + 15);
  }
  for (const e of d.edges) {
    if (!e.chip) continue;
    const text = [e.chip.type, e.chip.label].filter(Boolean).join(" · ");
    ctx.font = `400 11px ${MONO}`;
    const w = ctx.measureText(text).width + 14;
    ctx.beginPath();
    ctx.roundRect(e.chip.x - w / 2, e.chip.y - 10, w, 20, 5);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.strokeStyle = P.line;
    ctx.stroke();
    ctx.fillStyle = P.ink3;
    ctx.fillText(text, e.chip.x - w / 2 + 7, e.chip.y + 4);
  }
  ctx.restore();
  return c;
}
