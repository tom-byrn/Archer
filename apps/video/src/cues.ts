/**
 * Sound-effect cues. Scenes call `cue()` while they build their timelines, so
 * every pop, whoosh and keystroke sits exactly where its animation does; the
 * page publishes the list (`window.__video.cues`) and the soundtrack
 * (scripts/music.ts) mixes one effect per cue. Pure, no DOM.
 */

export type CueKind =
  /** A component lands on the canvas: short, pitched, a little woody. */
  | "pop"
  /** A camera move or scene change: filtered-noise swish of `dur` seconds. */
  | "whoosh"
  /** A mouse click. */
  | "click"
  /** One keystroke while typing. Very short and quiet. */
  | "key"
  /** An edge drawing itself: a quick rising zip. */
  | "draw"
  /** An arrow dropped on empty canvas springs back to its node. */
  | "snap"
  /** A validation error chip appears: a soft low double-thud. */
  | "error"
  /** Something done: a bright two-note chime. */
  | "success"
  /** A list row or small UI element appears: a tiny tick. */
  | "tick"
  /** The big hits (wordmark, end card): boom + noise burst + tail. */
  | "impact";

export interface Cue {
  /** Seconds from the start of the film. */
  t: number;
  kind: CueKind;
  /** 0–1, default 1: relative loudness within the effect's own level. */
  gain?: number;
  /**
   * Semitones above the effect's base pitch (pops step up a scale when
   * several land in a row), default 0.
   */
  pitch?: number;
  /** Length in seconds, for effects that stretch (whoosh), optional. */
  dur?: number;
}

const list: Cue[] = [];

export function cue(t: number, kind: CueKind, opts: Omit<Cue, "t" | "kind"> = {}): void {
  list.push({ t: Math.max(0, t), kind, ...opts });
}

/** Every cue so far, in time order. */
export function cues(): Cue[] {
  return [...list].sort((a, b) => a.t - b.t);
}
