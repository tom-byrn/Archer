/**
 * Sound effects, one per cue. Short UI sounds, the pitched ones in the
 * track's key (D major) so they sit inside the music rather than against it.
 * Each kind has a fixed level and a send to a small room, scaled by the
 * cue's `gain`; `pitch` transposes (pops snap it to the pentatonic scale).
 */
import type { Cue, CueKind } from "../../src/cues";
import {
  OnePole,
  Rng,
  SR,
  Svf,
  TAU,
  clamp,
  db,
  hit,
  mixInto,
  mtof,
  normalize,
  pan,
  seed,
  smoothstep,
  stereo,
  tailFade,
  toSamples,
  type Stereo,
} from "./dsp";
import { Reverb, renderEffect } from "./effects";

type Voice = Float32Array | Stereo;
const semitones = (cue: Cue) => 2 ** ((cue.pitch ?? 0) / 12);

// D major pentatonic (D E F# A B): whatever offsets the picture sends, a run of pops stays in key.
const PENTATONIC = [0, 2, 4, 7, 9, 12];

/** Snaps a semitone offset to D major pentatonic (ties round up, so rising runs keep rising). */
export function pentatonic(offset: number): number {
  const s = Math.round(offset);
  const octave = Math.floor(s / 12);
  const r = s - 12 * octave;
  let best = 0;
  for (const p of PENTATONIC) {
    const d = Math.abs(p - r) - Math.abs(best - r);
    if (d < 0 || (d === 0 && p > best)) best = p;
  }
  return 12 * octave + best;
}

/** A component lands: a sine blip that drops into its note, a woody overtone and a tick. */
function pop(cue: Cue, rng: Rng): Voice {
  const length = 0.12;
  const f = mtof(74 + pentatonic(cue.pitch ?? 0)); // from D5
  const out = new Float32Array(toSamples(length));
  const tick = new Svf(4000);
  let phase = 0;
  let wood = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const bend = 1 + 0.6 * Math.exp(-t / 0.009);
    phase += (f * bend) / SR;
    // 2.76× is a free wooden bar's second mode: the "knock" in the pop.
    wood += (2.76 * f * bend) / SR;
    const body = Math.sin(TAU * phase) * hit(t, 0.001, 0.035);
    const knock = Math.sin(TAU * wood) * hit(t, 0.0005, 0.008) * 0.35;
    const click = tick.hp(rng.noise()) * Math.exp(-t / 0.0007) * 0.2;
    out[i] = (body + knock + click) * tailFade(t, length, 0.03);
  }
  return normalize(out);
}

/** A camera move: noise through a bandpass that sweeps up and back down while it pans across. */
function whoosh(cue: Cue, rng: Rng): Voice {
  const length = Math.max(0.15, cue.dur ?? 0.45);
  const n = toSamples(length);
  const out = stereo(n);
  const k = semitones(cue);
  const bpL = new Svf();
  const bpR = new Svf();
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const arc = Math.sin(Math.PI * p);
    const fc = k * 350 * 2 ** (3.4 * arc ** 1.3);
    bpL.set(fc, 1.1);
    bpR.set(fc * 1.06, 1.1);
    // Swells to a peak a little past halfway, then falls away.
    const env = (p < 0.6 ? smoothstep(p / 0.6) : 1 - smoothstep((p - 0.6) / 0.4)) ** 2;
    const [gl, gr] = pan(-0.7 + 1.4 * p);
    const shared = 0.6 * rng.noise();
    out.left[i] = bpL.bp(shared + 0.4 * rng.noise()) * env * gl;
    out.right[i] = bpR.bp(shared + 0.4 * rng.noise()) * env * gr;
  }
  return normalize(out);
}

/** A mouse click: a crisp transient over a tiny tonal body, done in ~15 ms. */
function click(cue: Cue, rng: Rng): Voice {
  const length = 0.018;
  const k = semitones(cue);
  const snapHp = new Svf(3500);
  const out = new Float32Array(toSamples(length));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const snap = snapHp.hp(rng.noise()) * Math.exp(-t / 0.0012);
    const tone = Math.sin(TAU * 2400 * k * t) * Math.exp(-t / 0.003) * 0.6;
    const body = Math.sin(TAU * 750 * k * t) * Math.exp(-t / 0.005) * 0.4;
    out[i] = (snap + tone + body) * tailFade(t, length, 0.005);
  }
  return normalize(out);
}

/** One keystroke: a tiny tick-and-thock, varied a little each time, short enough that fast typing stays distinct. */
function key(cue: Cue, rng: Rng): Voice {
  const length = 0.035;
  const k = semitones(cue) * rng.range(0.88, 1.14);
  const band = new Svf(3200 * k, 1.3);
  const out = new Float32Array(toSamples(length));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const tick = band.bp(rng.noise()) * Math.exp(-t / 0.0035);
    const thock = Math.sin(TAU * 240 * k * t) * Math.exp(-t / 0.007) * 0.45;
    out[i] = (tick + thock) * tailFade(t, length, 0.008);
  }
  return normalize(out, db(rng.range(-3, 0)));
}

/** An edge draws itself: a rising zip, A4 to A6, its buzzing grain speeding up as it goes. */
function draw(cue: Cue, rng: Rng): Voice {
  const length = 0.26;
  const k = semitones(cue);
  const n = toSamples(length);
  const out = stereo(n);
  const hiss = new Svf();
  let phase = 0;
  let teeth = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / length;
    const f = k * 440 * 4 ** (p ** 1.4);
    phase += f / SR;
    teeth += (40 + 90 * p) / SR;
    hiss.set(2 * f, 2);
    const tone = Math.sin(TAU * phase) + 0.2 * Math.sin(3 * TAU * phase);
    const grain = 0.6 + 0.4 * Math.sin(TAU * teeth);
    const env = smoothstep(t / 0.02) * (0.7 + 0.3 * p) * tailFade(t, length, 0.05);
    const v = (tone + 0.3 * hiss.bp(rng.noise())) * grain * env;
    const [gl, gr] = pan(-0.25 + 0.5 * p);
    out.left[i] = v * gl;
    out.right[i] = v * gr;
  }
  return normalize(out);
}

/** An arrow springs back: a "thwip" whose pitch dips, bounces up and settles, like a spring. */
function snap(cue: Cue, rng: Rng): Voice {
  const length = 0.3;
  const f0 = mtof(69 + (cue.pitch ?? 0)); // A4
  const out = new Float32Array(toSamples(length));
  const swish = new Svf();
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const spring = 10 * Math.exp(-t / 0.075) * Math.cos(TAU * 6.5 * t); // semitones
    phase += (f0 * 2 ** (spring / 12)) / SR;
    const tone = Math.sin(TAU * phase) + 0.3 * Math.sin(2 * TAU * phase);
    swish.set(700 + 3000 * Math.exp(-t / 0.03), 1.5);
    const thwip = swish.bp(rng.noise()) * Math.exp(-t / 0.02) * 0.5;
    out[i] = (tone * hit(t, 0.002, 0.09) + thwip) * tailFade(t, length, 0.05);
  }
  return normalize(out);
}

/** A validation error: two soft low thuds falling a minor third (D3, B2), noticeable but never a buzzer. */
function error(cue: Cue, rng: Rng): Voice {
  const length = 0.34;
  const k = semitones(cue);
  const thuds = [
    { start: 0, f: k * mtof(50), gain: 1, phase: 0, knock: new OnePole(600) },
    { start: 0.13, f: k * mtof(47), gain: 0.85, phase: 0, knock: new OnePole(600) },
  ];
  const out = new Float32Array(toSamples(length));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const th of thuds) {
      const u = t - th.start;
      if (u < 0) continue;
      th.phase += (th.f * (1 + 0.3 * Math.exp(-u / 0.012))) / SR;
      // The octave partial is what small speakers actually play.
      const tone = Math.sin(TAU * th.phase) + 0.35 * Math.sin(2 * TAU * th.phase);
      v += th.gain * (tone * hit(u, 0.003, 0.055) + th.knock.lp(rng.noise()) * Math.exp(-u / 0.008) * 0.8);
    }
    out[i] = Math.tanh(1.2 * v) * tailFade(t, length, 0.04);
  }
  return normalize(out);
}

/** Something done: a bright two-note chime, A5 then D6, the key's fifth rising to its root. */
function success(cue: Cue): Voice {
  const length = 0.8;
  const k = semitones(cue);
  const notes = [
    { start: 0, f: k * mtof(81), pan: -0.15 },
    { start: 0.09, f: k * mtof(86), pan: 0.15 },
  ];
  const out = stereo(toSamples(length));
  for (const note of notes) {
    const [gl, gr] = pan(note.pan);
    for (let i = toSamples(note.start); i < out.left.length; i++) {
      const u = i / SR - note.start;
      // A little FM on the attack gives the bell its glassy strike.
      const index = 1.5 * Math.exp(-u / 0.04);
      const bell = Math.sin(TAU * note.f * u + index * Math.sin(TAU * 2 * note.f * u));
      const v = (bell * hit(u, 0.0015, 0.3) + 0.15 * Math.sin(TAU * 3 * note.f * u) * hit(u, 0.001, 0.06)) * tailFade(u, length - note.start, 0.1);
      out.left[i]! += v * gl;
      out.right[i]! += v * gr;
    }
  }
  return normalize(out);
}

/** A list row or small element appears: a tiny high tick, quieter than a click. */
function tick(cue: Cue, rng: Rng): Voice {
  const length = 0.012;
  const k = semitones(cue);
  const air = new Svf(6000);
  const out = new Float32Array(toSamples(length));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const v = Math.sin(TAU * 4200 * k * t) * Math.exp(-t / 0.0016) + air.hp(rng.noise()) * Math.exp(-t / 0.0006) * 0.3;
    out[i] = v * tailFade(t, length, 0.004);
  }
  return normalize(out);
}

/**
 * The big hits (title, end card): a sub boom falling to D1, a driven thump
 * and a crack so the hit reads on small speakers too, a noise burst that
 * darkens as it goes, and a long low rumble for the tail.
 */
function impact(cue: Cue, rng: Rng): Voice {
  const length = 3.2;
  const lo = mtof(26 + (cue.pitch ?? 0));
  const hi = 2.6 * lo;
  const out = stereo(toSamples(length));
  const crackHp = new Svf(1500);
  const sides = [out.left, out.right].map((ch) => ({ ch, burst: new Svf(), rumble: new Svf(400, 0.8) }));
  let phase = 0;
  let thump = 0;
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    phase += (lo + (hi - lo) * Math.exp(-t / 0.1)) / SR;
    thump += (55 + 130 * Math.exp(-t / 0.05)) / SR;
    const boom =
      Math.tanh(2 * Math.sin(TAU * phase) * hit(t, 0.001, 0.75)) / Math.tanh(2) +
      0.6 * Math.tanh(3 * Math.sin(TAU * thump) * hit(t, 0.001, 0.12));
    const crack = crackHp.hp(rng.noise()) * Math.exp(-t / 0.015) * 0.6;
    const cutoff = 400 + 8600 * Math.exp(-t / 0.08);
    const fade = tailFade(t, length, 0.6);
    for (const s of sides) {
      s.burst.set(cutoff, 0.7);
      const burst = s.burst.lp(rng.noise()) * hit(t, 0.0005, 0.12) * 0.8;
      const rumble = s.rumble.lp(rng.noise()) * hit(t, 0.02, 0.7) * 0.3;
      s.ch[i] = (boom + crack + burst + rumble) * fade;
    }
  }
  return normalize(out);
}

interface Sfx {
  render(cue: Cue, rng: Rng): Voice;
  /** Level, dB (peak), before the cue's gain. */
  level: number;
  /** Send to the room. */
  room: number;
}

// Levels sit the effects just under the music; keys and ticks are quietest
// because they come in dozens, the impacts loudest because they are hits.
const EFFECTS: Record<CueKind, Sfx> = {
  pop: { render: pop, level: -5, room: 0.2 },
  whoosh: { render: whoosh, level: -5, room: 0.15 },
  click: { render: click, level: -4, room: 0.05 },
  key: { render: key, level: -12, room: 0 },
  draw: { render: draw, level: -12, room: 0.15 },
  snap: { render: snap, level: -10, room: 0.12 },
  error: { render: error, level: -7, room: 0.1 },
  success: { render: success, level: -11, room: 0.3 },
  tick: { render: tick, level: -10, room: 0.05 },
  impact: { render: impact, level: 6, room: 0.3 },
};

export const CUE_KINDS = Object.keys(EFFECTS) as CueKind[];

/** Mixes one effect per cue, plus their shared room, into a buffer of `length` samples. */
export function renderSfx(cues: readonly Cue[], length: number): Stereo {
  const dry = stereo(length);
  const send = stereo(length);
  // Each cue's variation is seeded by the cue itself, so adding a cue elsewhere
  // in the film doesn't change how the others sound.
  const seen = new Map<string, number>();
  for (const cue of cues) {
    const id = `${cue.kind}@${cue.t}`;
    const repeat = seen.get(id) ?? 0;
    seen.set(id, repeat + 1);
    const fx = EFFECTS[cue.kind];
    const voice = fx.render(cue, new Rng(seed("sfx", id, repeat)));
    const gain = db(fx.level) * clamp(cue.gain ?? 1, 0, 1);
    const offset = toSamples(cue.t);
    mixInto(dry, voice, offset, gain);
    if (fx.room) mixInto(send, voice, offset, gain * fx.room);
  }
  const room = renderEffect(
    new Reverb({ room: 0.5, damp: 0.5, size: 0.6, predelay: 0.01, lowCut: 300, highCut: 7000 }),
    send,
    [],
  );
  mixInto(dry, room, 0);
  return dry;
}
