/**
 * The landing page's backdrop (components/landing/Dither.tsx): a fade from
 * --landing-fade down into black, drawn as a 4×4 Bayer dither whose lower
 * edge arcs a little. Cells are 3 px here, not 2, so the texture survives
 * video compression.
 */
import { h } from "./dom";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function ditherBackdrop(
  o: { w?: number; h?: number; fadeLength?: number; curve?: number; px?: number; front?: string } = {},
): HTMLCanvasElement {
  const w = o.w ?? 1920;
  const hgt = o.h ?? 1080;
  const px = o.px ?? 3;
  const fade = o.fadeLength ?? 0.85;
  const curve = o.curve ?? 0.15;
  const canvas = h("canvas", { class: "abs", attrs: { width: w, height: hgt } });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, hgt);
  ctx.fillStyle = o.front ?? "#121212";
  for (let cy = 0; cy * px < hgt; cy++) {
    for (let cx = 0; cx * px < w; cx++) {
      const u = ((cx + 0.5) * px) / w;
      const v = ((cy + 0.5) * px) / hgt;
      const x = 2 * u - 1;
      const down = v + curve * x * x;
      const shade = Math.pow(Math.min(1, Math.max(0, 1 - down / fade)), 1.6);
      const threshold = (BAYER[(cy % 4) * 4 + (cx % 4)]! + 0.5) / 16;
      if (shade >= threshold) ctx.fillRect(cx * px, cy * px, px, px);
    }
  }
  return canvas;
}
