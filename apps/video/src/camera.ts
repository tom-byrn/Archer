/**
 * An infinite dotted canvas (the app's ground and dot grid) with a camera.
 * The world holds diagrams in canvas pixels (40 px cells); the camera puts
 * world point (x, y) at the view's centre at zoom z. Motion blur is an SVG
 * directional blur, set per move.
 */
import { h, s } from "./dom";
import { onFrame } from "./engine";

export const CELL = 40;

export interface Camera {
  x: number;
  y: number;
  z: number;
  /** Degrees. */
  rot: number;
  /** Degrees the ground tips back (needs the view's `perspective` and a world-space floor). */
  tilt: number;
  /** Directional blur in screen px (motion blur on whip moves). */
  blurX: number;
  blurY: number;
}

export interface CanvasView {
  el: HTMLDivElement;
  world: HTMLDivElement;
  cam: Camera;
  /** World → view pixel coordinates under the current camera. */
  project(x: number, y: number): { x: number; y: number };
  /** View pixel → world coordinates under the current camera. */
  unproject(x: number, y: number): { x: number; y: number };
}

let filterId = 0;

export function canvasView(
  parent: HTMLElement,
  opts: {
    w?: number;
    h?: number;
    cam?: Partial<Camera>;
    ground?: string;
    /** Screen-space dot grid (default); off when the world carries its own floor. */
    dots?: boolean;
    perspective?: number;
  } = {},
): CanvasView {
  const w = opts.w ?? 1920;
  const hgt = opts.h ?? 1080;
  const el = h("div", { class: "canvas", style: { width: w, height: hgt } });
  if (opts.ground) el.style.backgroundColor = opts.ground;
  if (opts.perspective) {
    el.style.perspective = `${opts.perspective}px`;
    el.style.perspectiveOrigin = "50% 50%";
  }
  const dots = h("div", { class: "dots" });
  const world = h("div", { class: "world" });
  const id = `mb${filterId++}`;
  const blur = s("feGaussianBlur", { stdDeviation: "0 0", "edge-mode": "none" });
  const defs = s(
    "svg",
    { width: 0, height: 0, style: "position:absolute" },
    s("filter", { id, x: "-10%", y: "-10%", width: "120%", height: "120%" }, blur),
  );
  if (opts.dots !== false) el.append(dots);
  el.append(world, defs);
  parent.append(el);

  const cam: Camera = { x: 0, y: 0, z: 1, rot: 0, tilt: 0, blurX: 0, blurY: 0, ...opts.cam };
  const project = (x: number, y: number) => ({
    x: w / 2 + (x - cam.x) * cam.z,
    y: hgt / 2 + (y - cam.y) * cam.z,
  });

  const unproject = (sx: number, sy: number) => ({
    x: cam.x + (sx - w / 2) / cam.z,
    y: cam.y + (sy - hgt / 2) / cam.z,
  });

  onFrame(() => {
    const { x, y, z, rot, tilt } = cam;
    world.style.transform =
      `translate(${w / 2}px, ${hgt / 2}px) ${tilt ? `rotateX(${tilt}deg) ` : ""}rotate(${rot}deg) scale(${z}) translate(${-x}px, ${-y}px)`;
    // Dots sit on the grid lines' crossings (multiples of CELL), like React Flow's.
    const size = CELL * z;
    const ox = w / 2 - x * z;
    const oy = hgt / 2 - y * z;
    dots.style.backgroundSize = `${size}px ${size}px`;
    dots.style.backgroundPosition = `${ox - size / 2 + 2}px ${oy - size / 2 + 2}px`;
    dots.style.setProperty("--dot-r", `${Math.min(2.6, Math.max(1, 1.05 * z))}px`);
    dots.style.transform = rot ? `rotate(${rot}deg)` : "";
    const bx = Math.max(0, cam.blurX);
    const by = Math.max(0, cam.blurY);
    if (bx > 0.3 || by > 0.3) {
      blur.setAttribute("stdDeviation", `${bx.toFixed(2)} ${by.toFixed(2)}`);
      el.style.filter = `url(#${id})`;
    } else el.style.filter = "";
  });

  return { el, world, cam, project, unproject };
}
