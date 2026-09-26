/**
 * The instruments: drum one-shots and synth voices, each rendered into its
 * own buffer. Drums come out peak-normalised; synth voices at a consistent
 * level whatever the chord size. The arrangement decides when they play and
 * how loud.
 */
import {
  OnePole,
  Rng,
  SR,
  Saw,
  Square,
  Svf,
  TAU,
  hit,
  mtof,
  normalize,
  pan,
  seed,
  smoothstep,
  stereo,
  tailFade,
  toSamples,
  warp,
  type Stereo,
} from "./dsp";

// ---------------------------------------------------------------------------
// Drums

/**
 * House kick: a sine swept down to 55 Hz (A1, the key's dominant, so its
 * tail sits under every chord of the loop), a noise click for the attack,
 * and saturation so it still reads on laptop speakers.
 */
export function kick(): Float32Array {
  const length = 0.42;
  const out = new Float32Array(toSamples(length));
  const rng = new Rng(seed("kick"));
  const click = new Svf(3000);
  const drive = 2.2;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (55 + 105 * Math.exp(-t / 0.03) + 200 * Math.exp(-t / 0.0035)) / SR;
    const env = t < 0.025 ? 1 : Math.exp(-(t - 0.025) / 0.11);
    const body = Math.tanh(drive * env * Math.sin(TAU * phase)) / Math.tanh(drive);
    const tick = click.hp(rng.noise()) * Math.exp(-t / 0.0012) * 0.45;
    out[i] = (body + tick) * tailFade(t, length, 0.04);
  }
  return normalize(out);
}

/**
 * Clap: four bandpassed noise bursts ~10 ms apart (several hands, not quite
 * together), then a short diffuse tail that differs left and right.
 */
export function clap(): Stereo {
  const length = 0.42;
  const out = stereo(toSamples(length));
  const rng = new Rng(seed("clap"));
  const bursts = [
    [0, 0.75],
    [0.0104, 0.7],
    [0.0213, 0.8],
    [0.0331, 1],
  ] as const;
  const last = bursts[bursts.length - 1]![0];
  const body = new Svf(1250, 1.5);
  const lowCut = new Svf(450);
  const tailL = new Svf(1500, 0.9);
  const tailR = new Svf(1380, 0.9);
  const topL = new Svf(9000);
  const topR = new Svf(9000);
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    let e = 0;
    for (const [start, g] of bursts) if (t >= start) e += g * Math.exp(-(t - start) / 0.0045);
    const tail = t < last ? 0 : 0.5 * Math.exp(-(t - last) / 0.095);
    const b = lowCut.hp(body.bp(rng.noise())) * e;
    const fade = tailFade(t, length, 0.05);
    out.left[i] = topL.lp(b + tailL.bp(rng.noise()) * tail) * fade;
    out.right[i] = topR.lp(b + tailR.bp(rng.noise()) * tail) * fade;
  }
  return normalize(out);
}

/** Snare layer under the clap: a ~200 Hz drum body and bright wire noise. `tune` in semitones. */
export function snare(tune = 0): Float32Array {
  const length = 0.3;
  const k = 2 ** (tune / 12);
  const out = new Float32Array(toSamples(length));
  const rng = new Rng(seed("snare", tune));
  const wires = new Svf(1800 * k);
  const air = new Svf(8000);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    p1 += (k * (185 + 70 * Math.exp(-t / 0.015))) / SR;
    p2 += (k * 330) / SR;
    const body = Math.sin(TAU * p1) * Math.exp(-t / 0.055) + 0.35 * Math.sin(TAU * p2) * Math.exp(-t / 0.03);
    const noise = air.lp(wires.hp(rng.noise())) * hit(t, 0.001, 0.085);
    out[i] = (0.8 * body + 1.1 * noise) * tailFade(t, length, 0.04);
  }
  return normalize(out);
}

// The 808's six square oscillators: their upper partials clash into a metallic shimmer.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** Hi-hat: highpassed noise with a little metallic ring. `variant` reseeds it so repeats differ. */
export function hat(open: boolean, variant = 0): Float32Array {
  const length = open ? 0.5 : 0.09;
  const out = new Float32Array(toSamples(length));
  const rng = new Rng(seed("hat", open ? "open" : "closed", variant));
  const squares = METAL.map(() => new Square(rng.next()));
  const cut = open ? 6500 : 7500;
  const hp1 = new Svf(cut);
  const hp2 = new Svf(cut);
  const air = new Svf(open ? 12_000 : 13_000);
  const decay = open ? 0.11 : 0.014;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let metal = 0;
    for (let k = 0; k < METAL.length; k++) metal += squares[k]!.next(METAL[k]!);
    const x = 0.7 * rng.noise() + 0.2 * metal;
    out[i] = air.lp(hp2.hp(hp1.hp(x))) * hit(t, 0.0004, decay) * tailFade(t, length, open ? 0.1 : 0.02);
  }
  return normalize(out);
}

/** Shaker: bandpassed noise with a soft attack, like grains thrown against a tube wall. */
export function shaker(variant = 0): Float32Array {
  const length = 0.11;
  const out = new Float32Array(toSamples(length));
  const rng = new Rng(seed("shaker", variant));
  const band = new Svf(6800, 0.9);
  const lowCut = new OnePole(3500);
  const top = new Svf(10_000);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const env = t < 0.008 ? smoothstep(t / 0.008) : Math.exp(-(t - 0.008) / 0.026);
    out[i] = top.lp(lowCut.hp(band.bp(rng.noise()))) * env * tailFade(t, length, 0.03);
  }
  return normalize(out);
}

/**
 * Crash: bright noise and metallic ring that darken as they decay, wide in
 * stereo. The `dark` one is the softer, filtered crash that opens the film.
 */
export function crash(dark = false): Stereo {
  const length = 2.6;
  const out = stereo(toSamples(length));
  const rng = new Rng(seed("crash", dark ? "dark" : "bright"));
  const squares = METAL.map(() => new Square(rng.next()));
  const top = dark ? 5000 : 15_000;
  const sides = [out.left, out.right].map((ch) => ({ ch, hp: new Svf(3000), lp: new Svf() }));
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    let metal = 0;
    for (let k = 0; k < METAL.length; k++) metal += squares[k]!.next(METAL[k]! * 3.1);
    const env = 0.45 * hit(t, 0.0005, 0.04) + 0.55 * hit(t, 0.0005, 0.8);
    const g = warp(4500 + (top - 4500) * Math.exp(-t / 0.7));
    const shared = rng.noise();
    const fade = tailFade(t, length, 0.4);
    for (const s of sides) {
      s.lp.warped(g, 0.7);
      const x = 0.25 * shared + 0.75 * rng.noise() + 0.08 * metal;
      s.ch[i] = s.lp.lp(s.hp.hp(x)) * env * fade;
    }
  }
  return normalize(out);
}

/** Tom for fills: a sine with a short downward bend and a stick click, tuned to the key. */
export function tom(midi: number): Float32Array {
  const length = 0.5;
  const f0 = mtof(midi);
  const out = new Float32Array(toSamples(length));
  const rng = new Rng(seed("tom", midi));
  const stick = new Svf(2500, 1);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (f0 * (1 + 0.5 * Math.exp(-t / 0.035))) / SR;
    const body = Math.tanh(1.5 * Math.sin(TAU * phase) * Math.exp(-t / 0.15));
    out[i] = (body + stick.bp(rng.noise()) * Math.exp(-t / 0.006) * 0.4) * tailFade(t, length, 0.08);
  }
  return normalize(out);
}

/** Sub boom under the final hit: a sine falling from D2 to D1, the key's root, over a long decay. */
export function boom(): Float32Array {
  const length = 2.8;
  const out = new Float32Array(toSamples(length));
  const lo = mtof(26);
  const hi = mtof(38);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (lo + (hi - lo) * Math.exp(-t / 0.15)) / SR;
    out[i] = Math.tanh(1.6 * Math.sin(TAU * phase) * hit(t, 0.002, 0.8)) * tailFade(t, length, 0.3);
  }
  return normalize(out);
}

// ---------------------------------------------------------------------------
// Synths

interface Detuned {
  cents: number;
  pan: number;
  amp: number;
}

/** Oscillators for a stack of detuned voices, alternate notes mirrored so every note spans the field. */
function unison(notes: readonly number[], spread: readonly Detuned[], rng: Rng) {
  return notes.flatMap((note, n) =>
    spread.map((v) => {
      const [l, r] = pan(n % 2 === 0 ? v.pan : -v.pan);
      return { osc: new Saw(rng.next()), freq: mtof(note + v.cents / 100), l: l * v.amp, r: r * v.amp };
    }),
  );
}

export interface Pluck {
  /** Seconds the notes are held. */
  gate: number;
  /** Amplitude decay while held, s: short for a stab, long for a ringing chord. */
  decay: number;
  /** Scales the filter envelope: below 1 darker, above 1 brighter. */
  bright: number;
  /** Fade after the gate, s. */
  release: number;
}

// Seven saws per note, spread unevenly (as on the JP-8000) so the beating never lines up.
const SUPERSAW: Detuned[] = [
  { cents: -27, pan: -0.85, amp: 0.65 },
  { cents: -16, pan: -0.55, amp: 0.75 },
  { cents: -7, pan: -0.25, amp: 0.85 },
  { cents: 0, pan: 0, amp: 1 },
  { cents: 8, pan: 0.25, amp: 0.85 },
  { cents: 17, pan: 0.55, amp: 0.75 },
  { cents: 26, pan: 0.85, amp: 0.65 },
];

/** Supersaw chord: a wide, bright stab whose lowpass snaps shut, the pluck of the drops. */
export function supersaw(notes: readonly number[], shape: Pluck, rng: Rng): Stereo {
  const length = shape.gate + shape.release;
  const out = stereo(toSamples(length));
  const voices = unison(notes, SUPERSAW, rng);
  const norm = 1 / Math.sqrt(voices.length);
  const lpL = new Svf();
  const lpR = new Svf();
  const hpL = new Svf(170);
  const hpR = new Svf(170);
  const held = hit(shape.gate, 0.002, shape.decay);
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (const v of voices) {
      const s = v.osc.next(v.freq);
      l += s * v.l;
      r += s * v.r;
    }
    const g = warp(shape.bright * (650 + 7500 * Math.exp(-t / 0.08)));
    lpL.warped(g, 0.8);
    lpR.warped(g, 0.8);
    const env = t < shape.gate ? hit(t, 0.002, shape.decay) : held * (1 - smoothstep((t - shape.gate) / shape.release));
    out.left[i] = hpL.hp(lpL.lp(l)) * env * norm;
    out.right[i] = hpR.hp(lpR.lp(r)) * env * norm;
  }
  return out;
}

const PAD: Detuned[] = [
  { cents: -12, pan: -0.8, amp: 1 },
  { cents: -4, pan: -0.3, amp: 1 },
  { cents: 5, pan: 0.3, amp: 1 },
  { cents: 11, pan: 0.8, amp: 1 },
];

export interface PadShape {
  attack: number;
  release: number;
  /** Lowpass centre, Hz; it drifts slowly around this. */
  cutoff: number;
}

/** Soft, wide pad: four gently detuned saws per note, lowpassed, with a slow filter drift. */
export function pad(notes: readonly number[], hold: number, shape: PadShape, rng: Rng): Stereo {
  const length = hold + shape.release;
  const out = stereo(toSamples(length));
  const voices = unison(notes, PAD, rng);
  const norm = 1 / Math.sqrt(voices.length);
  const drift = rng.next() * TAU;
  const lpL = new Svf();
  const lpR = new Svf();
  const hpL = new Svf(220);
  const hpR = new Svf(220);
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (const v of voices) {
      const s = v.osc.next(v.freq);
      l += s * v.l;
      r += s * v.r;
    }
    const g = warp(shape.cutoff * (1 + 0.2 * Math.sin(TAU * 0.2 * t + drift)));
    lpL.warped(g, 0.6);
    lpR.warped(g, 0.6);
    // The release falls fast then lingers, like a real decay, instead of a straight fade.
    const x = (t - hold) / shape.release;
    const release = x <= 0 ? 1 : Math.exp(-3 * x) * (1 - smoothstep(x));
    const env = smoothstep(t / shape.attack) * release;
    out.left[i] = hpL.hp(lpL.lp(l)) * env * norm;
    out.right[i] = hpR.hp(lpR.lp(r)) * env * norm;
  }
  return out;
}

export interface BassShape {
  /** Saw layer, 0–1: 0 leaves only the sub (the intro). */
  saw: number;
  bright: number;
  release?: number;
}

/**
 * House bass note: a sine sub for weight plus a lowpassed, gently driven saw
 * whose filter snaps shut, the pluck that makes the offbeats bounce.
 */
export function bass(midi: number, gate: number, shape: BassShape): Float32Array {
  const release = shape.release ?? 0.03;
  const out = new Float32Array(toSamples(gate + release));
  const f = mtof(midi);
  const saw = new Saw(0.5); // starts on a zero crossing
  const lp = new Svf();
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += f / SR;
    lp.set(shape.bright * (260 + 1500 * Math.exp(-t / 0.06)), 1.1);
    const x = 0.8 * Math.sin(TAU * phase) + shape.saw * 0.8 * lp.lp(saw.next(f));
    const env =
      smoothstep(t / 0.004) * (0.65 + 0.35 * Math.exp(-t / 0.07)) * (1 - smoothstep((t - gate) / release));
    out[i] = Math.tanh(1.3 * x * env);
  }
  return out;
}

/** Arp pluck: saw plus square through a fast-closing filter, gone within a sixteenth or two. */
export function pluck(midi: number, bright: number, rng: Rng): Float32Array {
  const length = 0.3;
  const out = new Float32Array(toSamples(length));
  const f = mtof(midi);
  const saw = new Saw(rng.next());
  const square = new Square(rng.next());
  const lp = new Svf();
  const lowCut = new OnePole(250);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    lp.set(bright * (800 + 5500 * Math.exp(-t / 0.035)), 1.2);
    const x = saw.next(f) + 0.5 * square.next(f * 1.003);
    out[i] = lowCut.hp(lp.lp(x)) * hit(t, 0.001, 0.07) * tailFade(t, length, 0.04);
  }
  return out;
}

export interface LeadNote {
  /** Onset, s from the start of the phrase. */
  t: number;
  /** Length, s. */
  dur: number;
  midi: number;
}

// Five detuned saws, plus a quieter pair an octave up that doubles the line for sparkle.
const LEAD = [
  { cents: -14, pan: -0.5, amp: 0.8 },
  { cents: -6, pan: -0.25, amp: 0.9 },
  { cents: 0, pan: 0, amp: 1 },
  { cents: 6, pan: 0.25, amp: 0.9 },
  { cents: 14, pan: 0.5, amp: 0.8 },
  { cents: 1195, pan: -0.4, amp: 0.3 },
  { cents: 1205, pan: 0.4, amp: 0.3 },
];

/**
 * Mono lead for the hook: each note re-attacks from wherever the last one
 * is, the pitch glides briefly between notes, and long notes get a delayed
 * vibrato.
 */
export function lead(notes: readonly LeadNote[], length: number, rng: Rng): Stereo {
  const out = stereo(toSamples(length));
  const voices = LEAD.map((v) => {
    const [l, r] = pan(v.pan);
    return { osc: new Saw(rng.next()), ratio: 2 ** (v.cents / 1200), l: l * v.amp, r: r * v.amp };
  });
  const norm = 1 / Math.sqrt(voices.length);
  const lpL = new Svf();
  const lpR = new Svf();
  const hpL = new Svf(250);
  const hpR = new Svf(250);
  const glide = Math.exp(-1 / (0.018 * SR));
  let pitch = notes[0]?.midi ?? 69;
  let level = 0;
  let current = -1;
  let from = 0;
  for (let i = 0; i < out.left.length; i++) {
    const t = i / SR;
    while (current + 1 < notes.length && notes[current + 1]!.t <= t) {
      current++;
      from = level;
    }
    const note = notes[current];
    if (!note) continue;
    const u = t - note.t;
    const gate = note.dur * 0.9;
    // Short notes let go quickly so the rhythm stays crisp; a held last note rings out.
    const release = note.dur > 1 ? 0.4 : 0.07;
    const held = (x: number) =>
      x < 0.006 ? from + ((1 - from) * x) / 0.006 : 0.72 + 0.28 * Math.exp(-(x - 0.006) / 0.15);
    level = u < gate ? held(u) : held(gate) * Math.max(0, 1 - (u - gate) / release) ** 2;
    pitch = note.midi + (pitch - note.midi) * glide;
    const vibrato = note.dur > 0.4 ? 0.2 * smoothstep((u - 0.25) / 0.35) * Math.sin(TAU * 5.4 * u) : 0;
    const f = mtof(pitch + vibrato);
    let l = 0;
    let r = 0;
    for (const v of voices) {
      const s = v.osc.next(f * v.ratio);
      l += s * v.l;
      r += s * v.r;
    }
    const g = warp(2400 + 4200 * Math.exp(-u / 0.12));
    lpL.warped(g, 0.9);
    lpR.warped(g, 0.9);
    out.left[i] = hpL.hp(lpL.lp(l)) * level * norm;
    out.right[i] = hpR.hp(lpR.lp(r)) * level * norm;
  }
  return out;
}

/**
 * Riser: noise through a bandpass sweeping ~250 Hz → 9 kHz plus a saw pair
 * gliding up two octaves from `fromMidi`, swelling and widening into the drop.
 */
export function riser(length: number, fromMidi: number, rng: Rng): Stereo {
  const n = toSamples(length);
  const out = stereo(n);
  const bpL = new Svf();
  const bpR = new Svf();
  const toneLp = new Svf(2500);
  const saws = [new Saw(rng.next()), new Saw(rng.next())] as const;
  const end = toSamples(0.003);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const fc = 250 * 36 ** p;
    bpL.set(fc, 1.4);
    bpR.set(fc * 1.04, 1.4);
    const width = 0.2 + 0.7 * p;
    const shared = rng.noise() * (1 - width);
    const f = mtof(fromMidi + 24 * p ** 1.5);
    const tone = toneLp.lp(saws[0].next(f * 0.997) + saws[1].next(f * 1.003)) * 0.35;
    const amp = p ** 2.2 * (1 - smoothstep((i - (n - end)) / end));
    out.left[i] = (bpL.bp(shared + rng.noise() * width) + tone) * amp;
    out.right[i] = (bpR.bp(shared + rng.noise() * width) + tone) * amp;
  }
  return out;
}
