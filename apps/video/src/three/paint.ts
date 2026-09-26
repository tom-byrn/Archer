/**
 * Canvas painting for textures: Archer's UI drawn with its tokens and fonts
 * (card faces, chips, panels) so 3D surfaces carry the product's real look.
 */
import * as THREE from "three";
import { GLYPHS } from "@archer/catalog";

export const INK = "#ecebe7";
export const INK_2 = "#a5a19a";
export const INK_3 = "#6d6963";
export const SURFACE = "#161719";
export const SURFACE_2 = "#1c1e21";
export const LINE = "#26292d";
export const LINE_2 = "#383c42";
export const ACCENT = "#23c088";
export const ACCENT_INK = "#08110d";
export const CODE_BG = "#121315";

export const SANS = '"Inter Variable", system-ui, sans-serif';
export const MONO = '"Geist Mono Variable", ui-monospace, monospace';
export const SERIF = '"Newsreader Variable", Georgia, serif';

const pathCache = new Map<string, Path2D[]>();

/** Every `d` in an SVG string, as Path2D (viewBox 0 0 256 256). */
function paths(markup: string): Path2D[] {
  let p = pathCache.get(markup);
  if (!p) {
    p = [...markup.matchAll(/\sd="([^"]+)"/g)].map((m) => new Path2D(m[1]));
    pathCache.set(markup, p);
  }
  return p;
}

/** A 256-unit icon (catalog glyph or Phosphor markup) filled at (x, y), `size` px square. */
export function icon(ctx: CanvasRenderingContext2D, markup: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = color;
  for (const p of paths(markup)) ctx.fill(p);
  ctx.restore();
}

export function glyphMarkup(key: string): string {
  return GLYPHS[key] ?? GLYPHS.box!;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** #rrggbb with alpha, as rgba(). */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  return { c, ctx };
}

export function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Fit text to a width, trimming with an ellipsis. */
export function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}
