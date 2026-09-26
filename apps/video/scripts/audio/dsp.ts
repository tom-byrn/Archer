/**
 * DSP primitives for the soundtrack: seeded noise, band-limited oscillators,
 * filters, envelope shapes and buffer mixing. Everything runs at one fixed
 * rate and draws randomness only from seeded generators, so the same cues
 * always render the same samples.
 */

export const SR = 48_000;
export const TAU = 2 * Math.PI;

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;
/** Decibels → linear gain. */
export const db = (decibels: number): number => 10 ** (decibels / 20);
/** Linear gain → decibels (−240 dB for silence). */
export const toDb = (gain: number): number => 20 * Math.log10(Math.max(Math.abs(gain), 1e-12));
/** MIDI note → Hz (A4 = 69 = 440 Hz). */
export const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
/** Seconds → whole samples. */
export const toSamples = (seconds: number): number => Math.round(seconds * SR);

/** Raised-cosine step: 0 for x ≤ 0, 1 for x ≥ 1, smooth in between. */
export const smoothstep = (x: number): number =>
  x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x);
/** 1 until `fade` s before `length`, then a smooth fall to 0, so one-shots end without a click. */
export const tailFade = (t: number, length: number, fade: number): number =>
  1 - smoothstep((t - (length - fade)) / fade);
/** Linear attack into an exponential decay: the envelope of every hit and pluck. */
export const hit = (t: number, attack: number, decay: number): number =>
  t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** Seeded PRNG (mulberry32): the only source of randomness in the render. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** White noise, uniform in [−1, 1). */
  noise(): number {
    return this.next() * 2 - 1;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}

/** A stable 32-bit seed from labels and numbers (FNV-1a), so every voice gets its own noise. */
export function seed(...parts: Array<string | number>): number {
  const text = parts.join(":");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Oscillators

/** PolyBLEP residual for a unit step at phase 0 (Välimäki & Huovilainen). */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Band-limited sawtooth (PolyBLEP): bright without the aliasing fizz of a naive ramp. */
export class Saw {
  constructor(public phase = 0) {}

  next(freq: number): number {
    const dt = freq / SR;
    const t = this.phase;
    const p = t + dt;
    this.phase = p >= 1 ? p - 1 : p;
    return 2 * t - 1 - blep(t, dt);
  }
}

/** Band-limited square (PolyBLEP on both edges). */
export class Square {
  constructor(public phase = 0) {}

  next(freq: number): number {
    const dt = freq / SR;
    const t = this.phase;
    const half = t + 0.5 >= 1 ? t - 0.5 : t + 0.5;
    const p = t + dt;
    this.phase = p >= 1 ? p - 1 : p;
    return (t < 0.5 ? 1 : -1) + blep(t, dt) - blep(half, dt);
  }
}

// ---------------------------------------------------------------------------
// Filters

/** The SVF's bilinear frequency warp, tan(π·fc/SR). */
export const warp = (cutoff: number): number => Math.tan((Math.PI * clamp(cutoff, 10, SR * 0.45)) / SR);

/**
 * Trapezoidal state-variable filter (Zavalishin / Cytomic): stays stable and
 * click-free while its cutoff moves every sample, which filter envelopes and
 * sweeps need. `set` then one of lp/bp/hp per sample.
 */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private low = 0;
  private band = 0;
  private k = 1;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;

  constructor(cutoff = 1000, q = Math.SQRT1_2) {
    this.set(cutoff, q);
  }

  set(cutoff: number, q: number): this {
    return this.warped(warp(cutoff), q);
  }

  /** `set` with a precomputed `warp(cutoff)`, for filters that share a moving cutoff. */
  warped(g: number, q: number): this {
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }

  private tick(x: number): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.band = v1;
    this.low = v2;
  }

  lp(x: number): number {
    this.tick(x);
    return this.low;
  }

  /** Bandpass normalised to unity gain at the centre frequency. */
  bp(x: number): number {
    this.tick(x);
    return this.k * this.band;
  }

  hp(x: number): number {
    this.tick(x);
    return x - this.k * this.band - this.low;
  }
}

/** One-pole lowpass/highpass: cheap gentle slopes for taming noise and feedback loops. */
export class OnePole {
  private y = 0;
  private readonly a: number;

  constructor(cutoff: number) {
    this.a = Math.exp((-TAU * cutoff) / SR);
  }

  lp(x: number): number {
    this.y = x + this.a * (this.y - x);
    return this.y;
  }

  hp(x: number): number {
    return x - this.lp(x);
  }
}

/** RBJ-cookbook biquad (transposed direct form II): static high-passes on the reverb input and the master. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;

  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  private static of(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
    return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  static highpass(freq: number, q = Math.SQRT1_2): Biquad {
    const w = (TAU * freq) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return Biquad.of((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  tick(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** Filters `buf` in place. */
  run(buf: Float32Array): void {
    for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]!);
  }
}

// ---------------------------------------------------------------------------
// Buffers

export interface Stereo {
  left: Float32Array;
  right: Float32Array;
}

export const stereo = (length: number): Stereo => ({
  left: new Float32Array(length),
  right: new Float32Array(length),
});

/** Equal-power pan gains, unity at the centre: −1 is hard left, 1 hard right. */
export function pan(position: number): [number, number] {
  const a = ((clamp(position, -1, 1) + 1) * Math.PI) / 4;
  return [Math.SQRT2 * Math.cos(a), Math.SQRT2 * Math.sin(a)];
}

/**
 * Adds a voice into `bus` from sample `offset`: mono voices are panned,
 * stereo ones keep their own image.
 */
export function mixInto(bus: Stereo, voice: Float32Array | Stereo, offset: number, gain = 1, position = 0): void {
  const mono = voice instanceof Float32Array;
  const vl = mono ? voice : voice.left;
  const vr = mono ? voice : voice.right;
  const [gl, gr] = mono ? pan(position) : [1, 1];
  const from = Math.max(0, -offset);
  const to = Math.min(vl.length, bus.left.length - offset);
  for (let i = from; i < to; i++) {
    bus.left[offset + i]! += vl[i]! * gain * gl;
    bus.right[offset + i]! += vr[i]! * gain * gr;
  }
}

/** Largest absolute sample across both channels. */
export function peak(buf: Stereo | Float32Array): number {
  let m = 0;
  for (const ch of buf instanceof Float32Array ? [buf] : [buf.left, buf.right]) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]!);
      if (a > m) m = a;
    }
  }
  return m;
}

/** Scales a one-shot so its peak is `to`: instruments come out at a known level for the mix. */
export function normalize<T extends Stereo | Float32Array>(buf: T, to = 1): T {
  const g = to / (peak(buf) || 1);
  for (const ch of buf instanceof Float32Array ? [buf] : [buf.left, buf.right]) {
    for (let i = 0; i < ch.length; i++) ch[i]! *= g;
  }
  return buf;
}
