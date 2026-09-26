/**
 * The film's single clock: one paused GSAP timeline that every scene adds
 * to, plus per-frame hooks for state GSAP tweens on plain objects (cameras,
 * pointers) that has to be projected onto the DOM. `seek(t)` is all the
 * renderer ever calls, frame by frame, in any order.
 */
import { gsap } from "gsap";

// 2D transforms only: layers stay un-promoted, so zoomed text is rasterized
// at its final size instead of scaled up from a small texture.
gsap.config({ force3D: false, nullTargetWarn: false });
gsap.ticker.lagSmoothing(0);

/**
 * Film time 0 sits this far into the timeline, so a scene can start a move
 * before the first frame (a pre-roll) and frame 0 is a real render, not the
 * timeline's untouched initial state.
 */
const PREROLL = 2;

const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

type Targets = gsap.TweenTarget;

/** The scenes' view of the timeline: every position is film seconds, and required. */
export const master = {
  to: (targets: Targets, vars: gsap.TweenVars, at: number) => timeline.to(targets, vars, at + PREROLL),
  fromTo: (targets: Targets, from: gsap.TweenVars, to: gsap.TweenVars, at: number) =>
    timeline.fromTo(targets, from, to, at + PREROLL),
  set: (targets: Targets, vars: gsap.TweenVars, at: number) => timeline.set(targets, vars, at + PREROLL),
};

const hooks: ((t: number) => void)[] = [];

/** Run `fn` after the timeline has been put at each frame's time. */
export function onFrame(fn: (t: number) => void): void {
  hooks.push(fn);
}

export function seek(t: number): void {
  // suppressEvents=false: onUpdate callbacks fire on jumps as well as steps.
  timeline.seek(t + PREROLL, false);
  for (const fn of hooks) fn(t);
}

/** Show `el` (a hidden `.layer`) from `from` until `to` seconds. */
export function showBetween(el: Element, from: number, to: number): void {
  master.set(el, { visibility: "visible" }, from);
  master.set(el, { visibility: "hidden" }, to);
}

export { gsap };
