/**
 * The mouse pointer. It lives in a canvas view's world (so a dragged node
 * and the pointer holding it can never drift apart) but is drawn at a fixed
 * screen size, whatever the camera's zoom.
 */
import type { CanvasView } from "./camera";
import { h, svgFrom } from "./dom";
import { gsap, master, onFrame } from "./engine";

const ARROW = `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M9 5v26.5l6.6-6.2 4.4 9.9 4.6-2-4.3-9.7h9.2z" fill="#fff" stroke="#0b0b0c" stroke-width="2.2" stroke-linejoin="round"/></svg>`;

export interface Pointer {
  el: HTMLDivElement;
  pos: { x: number; y: number; s: number; o: number };
  /** Glide to world (x, y) over `dur`, starting at `t`. */
  move(t: number, x: number, y: number, dur?: number, ease?: string): void;
  /** Press and release at the current spot, with a ripple. Returns the release time. */
  click(t: number): number;
}

export function pointer(view: CanvasView, start: { x: number; y: number }): Pointer {
  const el = h("div", { class: "pointer" });
  el.append(svgFrom(ARROW));
  const ripple = h("div", { class: "ripple" });
  view.world.append(ripple, el);
  const pos = { x: start.x, y: start.y, s: 1, o: 0 };
  gsap.set(ripple, { opacity: 0, scale: 0.2 });

  onFrame(() => {
    const k = 1 / view.cam.z;
    // The arrow's tip is at (9, 5) in its 40 px box.
    el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${k * pos.s}) translate(-9px, -5px)`;
    el.style.transformOrigin = "0 0";
    el.style.opacity = String(pos.o);
    ripple.style.left = `${pos.x}px`;
    ripple.style.top = `${pos.y}px`;
    ripple.style.width = ripple.style.height = `${56 * k}px`;
    ripple.style.margin = `${-28 * k}px 0 0 ${-28 * k}px`;
    ripple.style.borderWidth = `${3 * k}px`;
  });

  return {
    el,
    pos,
    move(t, x, y, dur = 0.5, ease = "power3.inOut") {
      master.to(pos, { x, y, duration: dur, ease }, t);
    },
    click(t) {
      master.to(pos, { s: 0.82, duration: 0.07, ease: "power2.out" }, t);
      master.to(pos, { s: 1, duration: 0.18, ease: "back.out(3)" }, t + 0.08);
      master.fromTo(
        ripple,
        { opacity: 0.9, scale: 0.2 },
        { opacity: 0, scale: 1, duration: 0.45, ease: "power2.out", immediateRender: false },
        t + 0.02,
      );
      return t + 0.1;
    },
  };
}
