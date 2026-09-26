/**
 * The soundtrack: the song (arrangement.ts) plus one sound effect per cue
 * (sfx.ts), mastered for delivery. Deterministic: the same cues always give
 * the same samples.
 */
import type { Cue } from "../../src/cues";
import { DURATION } from "../../src/time";
import { LENGTH, renderMusic } from "./arrangement";
import { SR, db, stereo } from "./dsp";
import { master } from "./master";
import { renderSfx } from "./sfx";

/** The effects bus against the music: under it, but every pop and click still clearly there. */
const SFX_LEVEL = -4.5;

export function renderSoundtrack(cues: Cue[]): { sampleRate: number; left: Float32Array; right: Float32Array } {
  const music = renderMusic();
  const sfx = renderSfx(
    cues.filter((c) => c.t >= 0 && c.t < DURATION),
    LENGTH,
  );
  const mix = stereo(LENGTH);
  const g = db(SFX_LEVEL);
  for (let i = 0; i < LENGTH; i++) {
    mix.left[i] = music.left[i]! + g * sfx.left[i]!;
    mix.right[i] = music.right[i]! + g * sfx.right[i]!;
  }
  const { left, right } = master(mix);
  return { sampleRate: SR, left, right };
}
