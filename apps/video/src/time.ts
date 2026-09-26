/**
 * The video's clock, shared by the picture (src/) and the soundtrack
 * (scripts/music.ts): everything is placed on a 128 BPM grid, so cuts, pops
 * and captions land on the beat. Pure, no DOM.
 */

export const BPM = 128;
/** One beat in seconds. */
export const BEAT = 60 / BPM;
/** One 4/4 bar in seconds. */
export const BAR = 4 * BEAT;

/** Seconds at `bar` + `beat` (both zero-based, fractional beats allowed). */
export const at = (bar: number, beat = 0): number => bar * BAR + beat * BEAT;

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * Where each part of the film starts, in bars. The soundtrack's arrangement
 * follows the same map: the title and the final drop hit on their bars.
 */
export const SECTION = {
  /** Cold open: a diagram draws itself ("Draw it."). */
  draw: 0,
  /** The canvas flips over to its .arch source ("It's code."). */
  code: 1,
  /** Drop 1: the wordmark. */
  title: 2,
  /** Canvas ↔ code, both directions. */
  loop: 3,
  /** One feature per bar, seven of them. */
  features: 7,
  /** Break: drums out, "Copy for agent", riser. */
  build: 14,
  /** Drop 2: the big diagram. */
  drop: 15,
  /** Final hit: end card. */
  end: 18,
} as const;

/** The end card holds for this long after its hit (the reverb tail rings out). */
export const TAIL = 3.375;
export const DURATION = at(SECTION.end) + TAIL;
export const FRAMES = Math.round(DURATION * FPS);
