/**
 * Flat UI in 3D: panels (the code pane, a terminal, a window) as planes with
 * canvas-drawn faces, and the pointer as a sprite, all in Archer's tokens.
 */
import * as THREE from "three";
import cursorFill from "@phosphor-icons/core/assets/fill/cursor-fill.svg";
import { ACCENT, INK, MONO, SURFACE, canvas, rgba, texture } from "./paint";

export interface PanelOpts {
  /** Size in world units. */
  w: number;
  h: number;
  /** Texture pixels per world unit. */
  px?: number;
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, px: number): void;
}

/** A plane facing +z, centred, with a canvas-drawn face. */
export function panel(o: PanelOpts): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const px = o.px ?? 110;
  const W = Math.round(o.w * px);
  const H = Math.round(o.h * px);
  const { c, ctx } = canvas(W, H);
  o.draw(ctx, W, H, px);
  const mat = new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
}

const paths = (markup: string) => [...markup.matchAll(/\sd="([^"]+)"/g)].map((m) => new Path2D(m[1]));

let cursorTex: THREE.Texture | null = null;
/** The pointer: white arrow, dark outline, tip at the sprite's centre-left. */
export function cursorSprite(size = 0.9): THREE.Sprite {
  if (!cursorTex) {
    const { c, ctx } = canvas(256, 256);
    ctx.translate(20, 20);
    ctx.scale(0.84, 0.84);
    ctx.lineJoin = "round";
    ctx.lineWidth = 22;
    ctx.strokeStyle = "#08110d";
    for (const p of paths(cursorFill)) ctx.stroke(p);
    ctx.fillStyle = "#ffffff";
    for (const p of paths(cursorFill)) ctx.fill(p);
    cursorTex = texture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cursorTex, depthTest: false, depthWrite: false }));
  s.scale.setScalar(size);
  // The arrow's tip sits near the image's top-left: anchor there.
  s.center.set(0.2, 0.8);
  s.renderOrder = 20;
  return s;
}

/** An MCP tool's name on a pill: mono, with a faint accent edge. World height `h`. */
export function toolChip(name: string, h = 0.42): THREE.Sprite {
  const S = 4;
  const measure = canvas(10, 10).ctx;
  measure.font = `500 ${15 * S}px ${MONO}`;
  const W = Math.ceil(measure.measureText(name).width + 30 * S);
  const H = 30 * S;
  const { c, ctx } = canvas(W, H);
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 9 * S);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.lineWidth = 2.5 * S;
  ctx.strokeStyle = rgba(ACCENT, 0.55);
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(12 * S, H / 2, 3.2 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `500 ${15 * S}px ${MONO}`;
  ctx.fillStyle = INK;
  ctx.fillText(name, 21 * S, H / 2 + 5.2 * S);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(c), depthWrite: false, transparent: true }));
  s.scale.set((W / H) * h, h, 1);
  return s;
}
