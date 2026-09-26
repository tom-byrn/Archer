import { beforeAll, describe, expect, it } from "vitest";
import type { CueKind } from "../src/cues";
import { DURATION, SECTION, at } from "../src/time";
import { renderSoundtrack } from "../scripts/audio";
import { demoCues } from "../scripts/audio/demo";
import { Rng, toDb, type Stereo } from "../scripts/audio/dsp";
import { integratedLoudness, truePeak } from "../scripts/audio/loudness";
import { CUE_KINDS, pentatonic, renderSfx } from "../scripts/audio/sfx";
import { encodeWav } from "../scripts/audio/wav";

const SR = 48_000;

/** RMS in dBFS over [a, b) seconds, both channels. */
function rms(bus: Stereo, a: number, b: number): number {
  let sum = 0;
  const from = Math.round(a * SR);
  const to = Math.round(b * SR);
  for (let i = from; i < to; i++) sum += bus.left[i]! ** 2 + bus.right[i]! ** 2;
  return toDb(Math.sqrt(sum / (2 * (to - from))));
}

describe("soundtrack", () => {
  let track: Stereo & { sampleRate: number };
  beforeAll(() => {
    track = renderSoundtrack(demoCues());
  }, 60_000);

  it("is exactly the film's length at 48 kHz, every sample finite", () => {
    expect(track.sampleRate).toBe(SR);
    expect(track.left.length).toBe(Math.round(DURATION * SR));
    expect(track.right.length).toBe(track.left.length);
    expect(track.left.every(Number.isFinite) && track.right.every(Number.isFinite)).toBe(true);
  });

  it("is mastered to −14 LUFS with true peaks under −1 dBTP", () => {
    expect(integratedLoudness(track)).toBeCloseTo(-14, 0);
    expect(toDb(truePeak(track))).toBeLessThanOrEqual(-1);
  });

  it("hits on the first frame and fades to exact silence", () => {
    expect(rms(track, 0, 0.02)).toBeGreaterThan(-20);
    expect(rms(track, DURATION - 0.3, DURATION)).toBeLessThan(-60);
    expect(track.left.at(-1)).toBe(0);
    expect(track.right.at(-1)).toBe(0);
  });

  it("drops out for the gap before each drop", () => {
    for (const bar of [SECTION.title, SECTION.drop]) {
      // Only the riser (and any effects the picture puts there) plays in the gap.
      expect(rms(track, at(bar, -0.5), at(bar))).toBeLessThan(rms(track, at(bar), at(bar, 2)) - 8);
    }
  });

  it("renders the same samples every time", () => {
    const again = renderSoundtrack(demoCues());
    expect(Buffer.from(again.left.buffer).equals(Buffer.from(track.left.buffer))).toBe(true);
    expect(Buffer.from(again.right.buffer).equals(Buffer.from(track.right.buffer))).toBe(true);
  }, 60_000);
});

describe("sound effects", () => {
  it("renders every kind, audible and finite", () => {
    for (const kind of CUE_KINDS) {
      const fx = renderSfx([{ t: 0.1, kind }], SR * 4);
      expect(fx.left.every(Number.isFinite), kind).toBe(true);
      expect(rms(fx, 0.1, 0.6), kind).toBeGreaterThan(-50);
    }
  });

  it("keeps fast typing distinct: a keystroke is over before the next one", () => {
    const fx = renderSfx([{ t: 0.1, kind: "key" as CueKind }], SR);
    expect(rms(fx, 0.14, 0.2)).toBeLessThan(rms(fx, 0.1, 0.12) - 40);
  });

  it("snaps pop pitches to D major pentatonic", () => {
    expect([0, 2, 4, 7, 9, 12, 14].map(pentatonic)).toEqual([0, 2, 4, 7, 9, 12, 14]);
    expect([1, 3, 5, 6, 8, 10, 11, -1].map(pentatonic)).toEqual([2, 4, 4, 7, 9, 9, 12, 0]);
  });
});

describe("wav", () => {
  it("writes a 32-bit float stereo WAVE header and interleaved samples", () => {
    const rng = new Rng(1);
    const left = Float32Array.from({ length: 5 }, () => rng.noise());
    const right = Float32Array.from({ length: 5 }, () => rng.noise());
    const bytes = encodeWav(left, right, SR);
    const view = new DataView(bytes.buffer);
    const text = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
    expect([text(0), text(8), text(12), text(38), text(50)]).toEqual(["RIFF", "WAVE", "fmt ", "fact", "data"]);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(SR);
    expect(view.getUint32(54, true)).toBe(5 * 8);
    expect(view.getFloat32(58 + 8 * 3 + 4, true)).toBe(right[3]);
  });
});
