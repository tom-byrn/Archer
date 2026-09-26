/**
 * Mastering: clear the rumble, glue the mix with a gentle compressor, then
 * hit the delivery targets (−14 LUFS integrated, true peak under −1 dBTP)
 * and fade the tail to exact silence.
 */
import { Biquad, db, smoothstep, toSamples, type Stereo } from "./dsp";
import { compress, limit, softClip } from "./effects";
import { integratedLoudness } from "./loudness";

export const TARGET_LUFS = -14;
/** The limiter's ceiling, a little under the −1 dBTP spec so other meters agree. */
export const CEILING_DBTP = -1.3;
/** The final fade: the tail has all but decayed by then; this makes the last sample exactly 0. */
const FADE = 0.8;

const scaled = (bus: Stereo, gain: number): Stereo => ({
  left: bus.left.map((v) => v * gain),
  right: bus.right.map((v) => v * gain),
});

export function master(mix: Stereo): Stereo {
  // Below the kick's fundamental there's only rumble; two biquads make a 24 dB/oct Butterworth.
  for (const ch of [mix.left, mix.right]) {
    Biquad.highpass(28, 0.5412).run(ch);
    Biquad.highpass(28, 1.3066).run(ch);
  }
  // Into the compressor at a known level, so its threshold means the same whatever the cues add.
  const glue = scaled(mix, db(-18 - integratedLoudness(mix)));
  compress(glue, { threshold: -17, ratio: 2, knee: 6, attack: 0.02, release: 0.2 });

  // Loudness and ceiling interact through the limiter, so trim and re-measure until on target.
  let trim = TARGET_LUFS - integratedLoudness(glue);
  let out = glue;
  for (let pass = 0; pass < 5; pass++) {
    out = scaled(glue, db(trim));
    softClip(out, db(CEILING_DBTP + 1.5));
    limit(out, db(CEILING_DBTP));
    const error = TARGET_LUFS - integratedLoudness(out);
    if (Math.abs(error) < 0.05) break;
    trim += error;
  }

  const n = out.left.length;
  const fade = toSamples(FADE);
  for (let i = n - fade; i < n; i++) {
    const g = 1 - smoothstep((i - (n - fade)) / (fade - 1));
    out.left[i]! *= g;
    out.right[i]! *= g;
  }
  out.left[n - 1] = 0;
  out.right[n - 1] = 0;
  return out;
}
