/**
 * The song: electro-pop/house in D major at 128 BPM, arranged on the film's
 * section map (src/time.ts) so its drops land on the title and the big
 * diagram, and its last chord on the end card. Parts render into stems; the
 * mixer ducks the stems under the kick, sends them to a shared reverb and a
 * ping-pong delay, and sums them.
 */
import { BAR, BEAT, DURATION, SECTION, at } from "../../src/time";
import { Rng, SR, Svf, db, pan, seed, stereo, toSamples, warp, type Stereo } from "./dsp";
import { PingPong, Reverb, duck, renderEffect } from "./effects";
import * as inst from "./instruments";

export const LENGTH = toSamples(DURATION);

/**
 * The drop gaps: everything but the riser stops for the last eighth before
 * each drop, so the downbeat lands out of silence.
 */
export const GAPS: ReadonlyArray<readonly [number, number]> = [SECTION.title, SECTION.drop].map(
  (bar) => [at(bar, -0.5), at(bar)] as const,
);

// ---------------------------------------------------------------------------
// Harmony

type ChordName = "F#m7" | "Bm7" | "Gmaj7" | "Aadd9" | "A7sus4" | "A" | "Em7" | "A7" | "Dmaj9";

interface Chord {
  /** Bass root, MIDI (octaves 1–2). */
  bass: number;
  /** Upper voicing, MIDI. */
  tones: readonly number[];
}

// Voicings stay around C#4–B4, so every change moves each voice a step or two.
const CHORDS: Record<ChordName, Chord> = {
  "F#m7": { bass: 30, tones: [61, 64, 66, 69] }, // F#1 | C# E F# A
  Bm7: { bass: 35, tones: [62, 66, 69, 71] }, // B1 | D F# A B
  Gmaj7: { bass: 31, tones: [62, 66, 67, 71] }, // G1 | D F# G B
  Aadd9: { bass: 33, tones: [61, 64, 69, 71] }, // A1 | C# E A B
  A7sus4: { bass: 33, tones: [62, 64, 67, 69] }, // A1 | D E G A
  A: { bass: 33, tones: [61, 64, 69, 73] }, // A1 | C# E A C#
  Em7: { bass: 40, tones: [62, 64, 67, 71] }, // E2 | D E G B
  A7: { bass: 33, tones: [61, 64, 67, 69] }, // A1 | C# E G A
  Dmaj9: { bass: 38, tones: [62, 64, 66, 69, 73] }, // D2 | D E F# A C#
};

/** A bar's harmony: one chord, or two (beats 0–1 | 2–3). */
type Bar = ChordName | readonly [ChordName, ChordName];

/** The royal-road loop, IV V iii vi: it starts on the title, so the intro plays its last two chords. */
const LOOP: readonly ChordName[] = ["Gmaj7", "Aadd9", "F#m7", "Bm7"];
/** Drop 2 walks the turnaround IV | iii vi | ii V into the final I. */
const TURNAROUND: readonly Bar[] = ["Gmaj7", ["F#m7", "Bm7"], ["Em7", "A7"]];

/** The chord map follows the film's sections (src/time.ts), so it moves when they do. */
function harmonyOf(bar: number): Bar {
  if (bar >= SECTION.end) return "Dmaj9";
  if (bar >= SECTION.drop) return TURNAROUND[bar - SECTION.drop] ?? "Dmaj9";
  // The build hangs on a suspended dominant that resolves just before the gap.
  if (bar >= SECTION.build) return ["A7sus4", "A"];
  const n = LOOP.length;
  return LOOP[(((bar - SECTION.title) % n) + n) % n]!;
}

function chordAt(bar: number, beat = 0): Chord {
  const harmony = harmonyOf(bar);
  return CHORDS[typeof harmony === "string" ? harmony : harmony[beat < 2 ? 0 : 1]];
}

/** The bar's chord spans, in beats: [[0, 4]], or [[0, 2], [2, 4]] when it changes halfway. */
const chordSpans = (bar: number): Array<[number, number]> =>
  typeof harmonyOf(bar) === "string" ? [[0, 4]] : [[0, 2], [2, 4]];

// ---------------------------------------------------------------------------
// Arrangement

type Section = keyof typeof SECTION;
const SECTIONS = Object.keys(SECTION) as Section[];
const sectionOf = (bar: number): Section => SECTIONS.filter((s) => SECTION[s] <= bar).at(-1) ?? "draw";

type StabStyle = "intro" | "drop" | "loop" | "features" | "build";

interface Groove {
  kick: boolean;
  clap: "off" | "clap" | "clap+snare";
  hats: "off" | "eighths" | "sixteenths";
  openHats: boolean;
  shaker: boolean;
  bass: "off" | "sub" | "full";
  stabs: StabStyle | null;
  /** Level, 0 = tacet. */
  pad: number;
  /** Level, 0 = tacet. */
  arp: number;
}

const SILENT: Groove = {
  kick: false,
  clap: "off",
  hats: "off",
  openHats: false,
  shaker: false,
  bass: "off",
  stabs: null,
  pad: 0,
  arp: 0,
};

/** What plays in each section; the fills, crashes, risers and the final hit are placed separately. */
const GROOVE: Record<Section, Groove> = {
  // Cold open: the beat is there from the first frame, the chords muffled.
  draw: { ...SILENT, kick: true, clap: "clap", hats: "eighths", stabs: "intro" },
  // Hats double up and the sub comes in under the riser.
  code: { ...SILENT, kick: true, clap: "clap", hats: "sixteenths", bass: "sub", stabs: "intro" },
  // Drop 1: the full groove.
  title: {
    kick: true,
    clap: "clap+snare",
    hats: "sixteenths",
    openHats: true,
    shaker: false,
    bass: "full",
    stabs: "drop",
    pad: 1,
    arp: 0,
  },
  // Thinner hats and darker, quieter stabs leave room for typing and pops on top.
  loop: {
    kick: true,
    clap: "clap+snare",
    hats: "eighths",
    openHats: true,
    shaker: false,
    bass: "full",
    stabs: "loop",
    pad: 0.9,
    arp: 0,
  },
  // The montage: arp and shaker add motion, one feature per bar.
  features: {
    kick: true,
    clap: "clap+snare",
    hats: "sixteenths",
    openHats: true,
    shaker: true,
    bass: "full",
    stabs: "features",
    pad: 0.8,
    arp: 1,
  },
  // Break: kick and bass out, the pad takes over, the roll and riser pull toward drop 2.
  build: { ...SILENT, stabs: "build", pad: 1.2 },
  // Drop 2: everything, with the lead hook on top (the arp steps back for it).
  drop: {
    kick: true,
    clap: "clap+snare",
    hats: "sixteenths",
    openHats: true,
    shaker: true,
    bass: "full",
    stabs: "drop",
    pad: 0.9,
    arp: 0.45,
  },
  end: SILENT,
};

// ---------------------------------------------------------------------------
// Mixer

export const STEMS = ["kick", "clap", "hats", "crash", "bass", "stabs", "pad", "arp", "lead", "riser", "finale"] as const;
export type Stem = (typeof STEMS)[number];

/** Kick-keyed ducking: depth (dB) and how long the gain takes to swell back (s). */
interface Ducking {
  depth: number;
  release: number;
}

/** Per stem: fader (dB), ducking under the kick, and sends to the reverb and the delay. */
const MIX: Record<Stem, { gain: number; duck?: Ducking; reverb: number; delay: number }> = {
  kick: { gain: -3, reverb: 0, delay: 0 },
  clap: { gain: -4.5, reverb: 0.25, delay: 0 },
  hats: { gain: -12, reverb: 0.04, delay: 0 },
  crash: { gain: -11, reverb: 0.1, delay: 0 },
  // The bass ducks deepest and longest, so the kick owns the low end.
  bass: { gain: -7, duck: { depth: 9, release: 0.14 }, reverb: 0, delay: 0 },
  // Plucked parts swell back fast: the stabs on the beat bloom just after the
  // kick, and the syncopated one between them stands out.
  stabs: { gain: -8.5, duck: { depth: 6, release: 0.1 }, reverb: 0.2, delay: 0.06 },
  // The pad pumps: it's the part that makes the ducking audible as groove.
  pad: { gain: -20, duck: { depth: 7, release: 0.15 }, reverb: 0.3, delay: 0 },
  arp: { gain: -16, duck: { depth: 5, release: 0.09 }, reverb: 0.12, delay: 0.4 },
  lead: { gain: -11, duck: { depth: 2, release: 0.1 }, reverb: 0.2, delay: 0.25 },
  riser: { gain: -12.5, reverb: 0, delay: 0 },
  finale: { gain: -8, reverb: 0.35, delay: 0 },
};

/** Effect returns (dB), ducked a little so the tails pump with the groove. */
const RETURNS: Record<"reverb" | "delay", { gain: number; duck: Ducking }> = {
  reverb: { gain: -6, duck: { depth: 3, release: 0.15 } },
  delay: { gain: -8, duck: { depth: 4, release: 0.15 } },
};

export class Mixer {
  readonly stems = Object.fromEntries(STEMS.map((s) => [s, stereo(LENGTH)])) as Record<Stem, Stereo>;
  /** Kick onsets (s): the sidechain's trigger. */
  readonly kicks: number[] = [];

  /**
   * Adds a voice at `t` s. Anything still sounding when a drop gap begins
   * (or at `until`) is faded out there; the riser alone plays through gaps.
   */
  add(stem: Stem, voice: Float32Array | Stereo, t: number, gain = 1, position = 0, until = Infinity): void {
    const gap = stem === "riser" ? undefined : GAPS.find(([, end]) => end > t);
    if (gap && t >= gap[0]) return;
    const cut = toSamples(Math.min(until, gap ? gap[0] : Infinity, DURATION));
    const start = toSamples(t);
    const mono = voice instanceof Float32Array;
    const vl = mono ? voice : voice.left;
    const vr = mono ? voice : voice.right;
    const [gl, gr] = mono ? pan(position) : [1, 1];
    const fade = toSamples(0.004);
    const bus = this.stems[stem];
    for (let n = start; n < Math.min(start + vl.length, cut); n++) {
      const g = n > cut - fade ? (gain * (cut - n)) / fade : gain;
      bus.left[n]! += vl[n - start]! * g * gl;
      bus.right[n]! += vr[n - start]! * g * gr;
    }
  }

  /** Ducks, sends and sums the stems (or just `only`), then adds the reverb and delay returns. */
  render(only: readonly Stem[] = STEMS): Stereo {
    const out = stereo(LENGTH);
    const toReverb = stereo(LENGTH);
    const toDelay = stereo(LENGTH);
    const curves = new Map<string, Float32Array>();
    const ducking = ({ depth, release }: Ducking) => {
      const key = `${depth}/${release}`;
      if (!curves.has(key)) curves.set(key, duck(LENGTH, this.kicks, depth, release));
      return curves.get(key)!;
    };
    for (const name of only) {
      const { gain, duck: ducked, reverb, delay } = MIX[name];
      const stem = this.stems[name];
      const curve = ducked ? ducking(ducked) : undefined;
      const g = db(gain);
      for (let i = 0; i < LENGTH; i++) {
        const k = curve ? g * curve[i]! : g;
        const l = stem.left[i]! * k;
        const r = stem.right[i]! * k;
        out.left[i]! += l;
        out.right[i]! += r;
        toReverb.left[i]! += l * reverb;
        toReverb.right[i]! += r * reverb;
        toDelay.left[i]! += l * delay;
        toDelay.right[i]! += r * delay;
      }
    }
    // A ~2 s hall kept out of the low mids (no boomy tails), and dotted-eighth
    // echoes that bounce across the beat.
    const verb = new Reverb({ room: 0.72, damp: 0.6, predelay: 0.02, lowCut: 450, highCut: 8000 });
    const echo = new PingPong(0.75 * BEAT, 0.42);
    const returns: Array<[Stereo, { gain: number; duck: Ducking }]> = [
      [renderEffect(verb, toReverb, GAPS), RETURNS.reverb],
      [renderEffect(echo, toDelay, GAPS), RETURNS.delay],
    ];
    for (const [wet, ret] of returns) {
      const curve = ducking(ret.duck);
      const g = db(ret.gain);
      for (let i = 0; i < LENGTH; i++) {
        out.left[i]! += wet.left[i]! * g * curve[i]!;
        out.right[i]! += wet.right[i]! * g * curve[i]!;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Parts

type Kit = ReturnType<typeof makeKit>;
type Drum = "snare" | "tomHigh" | "tomMid" | "tomLow";

function makeKit() {
  return {
    kick: inst.kick(),
    clap: inst.clap(),
    snare: inst.snare(),
    // A few takes of each short hit, so a bar of sixteenths doesn't machine-gun.
    closedHats: [0, 1, 2, 3].map((v) => inst.hat(false, v)),
    openHat: inst.hat(true),
    shakers: [0, 1, 2, 3].map((v) => inst.shaker(v)),
    crash: inst.crash(),
    darkCrash: inst.crash(true),
    // Toms on the key's G, D and A.
    tomHigh: inst.tom(55),
    tomMid: inst.tom(50),
    tomLow: inst.tom(45),
  };
}

/** Odd sixteenths of the hats and shaker land a touch late: a light house swing. */
const SWING = 0.08 * (BEAT / 4);
const HAT_ACCENT = [0.6, 0.35, 0.85, 0.42];
const SHAKER_ACCENT = [0.5, 0.85, 0.6, 1];
const HAT_PAN = 0.25;

function drums(mix: Mixer, kit: Kit): void {
  for (let bar = 0; bar < SECTION.end; bar++) {
    const g = GROOVE[sectionOf(bar)];
    const rng = new Rng(seed("drums", bar));
    for (let step = 0; step < 16; step++) {
      const t = at(bar, step / 4);
      const swing = step % 2 === 1 ? SWING : 0;
      if (g.kick && step % 4 === 0) {
        mix.add("kick", kit.kick, t);
        mix.kicks.push(t);
      }
      if (g.clap !== "off" && (step === 4 || step === 12)) {
        mix.add("clap", kit.clap, t);
        if (g.clap === "clap+snare") mix.add("clap", kit.snare, t, 0.55);
      }
      if (g.openHats && step % 4 === 2) {
        // The next closed hat chokes the open one, as on a real hi-hat.
        const choke = g.hats === "sixteenths" ? t + BEAT / 4 + SWING : t + BEAT / 2;
        mix.add("hats", kit.openHat, t, 0.55, HAT_PAN, choke);
      } else if (g.hats === "sixteenths" || (g.hats === "eighths" && step % 2 === 0)) {
        const take = kit.closedHats[(bar * 16 + step) % kit.closedHats.length]!;
        mix.add("hats", take, t + swing, HAT_ACCENT[step % 4]! * rng.range(0.9, 1.05), HAT_PAN);
      }
      if (g.shaker) {
        const take = kit.shakers[step % kit.shakers.length]!;
        mix.add("hats", take, t + swing, SHAKER_ACCENT[step % 4]! * rng.range(0.9, 1.05), -0.35);
      }
    }
  }
}

/** Fills leading out of a bar: [step, drum, velocity]. */
const FILLS: ReadonlyArray<[bar: number, hits: ReadonlyArray<[number, Drum, number]>]> = [
  // Midway through the features, into the second crash.
  [SECTION.features + 3, [[12, "snare", 0.45], [13, "snare", 0.55], [14, "tomHigh", 0.75], [15, "tomLow", 0.85]]],
  // Into the break: toms tumble down and a flam lands on the last sixteenth.
  [
    SECTION.build - 1,
    [[12, "tomHigh", 0.7], [13, "tomMid", 0.75], [14, "tomLow", 0.85], [15, "snare", 0.8], [15.5, "snare", 0.95]],
  ],
  // Into the final hit: a snare run into the toms.
  [
    SECTION.end - 1,
    [
      [8, "snare", 0.3], [9, "snare", 0.35], [10, "snare", 0.42], [11, "snare", 0.5],
      [12, "tomHigh", 0.7], [13, "tomMid", 0.75], [14, "tomLow", 0.85],
      [14.5, "snare", 0.8], [15, "snare", 0.9], [15.5, "snare", 1],
    ],
  ],
];

/** The build's roll accelerates (quarters, eighths, sixteenths, thirty-seconds) into the gap. */
const ROLL = [0, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.125, 3.25, 3.375];

function transitions(mix: Mixer, kit: Kit): void {
  const rng = new Rng(seed("transitions"));
  // A soft, dark crash with the first kick: the film opens on a hit, but saves the real one for the title.
  mix.add("crash", kit.darkCrash, 0, 0.5);
  for (const bar of [SECTION.title, SECTION.drop]) mix.add("crash", kit.crash, at(bar));
  // New phrases in the montage: its first bar and its fifth.
  for (const bar of [SECTION.features, SECTION.features + 4]) mix.add("crash", kit.crash, at(bar), 0.7);
  for (const bar of [SECTION.code, SECTION.build]) mix.add("riser", inst.riser(BAR, 50, rng), at(bar));
  for (const [bar, hits] of FILLS) {
    for (const [step, drum, velocity] of hits) mix.add("clap", kit[drum], at(bar, step / 4), velocity);
  }
  for (const beat of ROLL) {
    const p = beat / 3.5;
    mix.add("clap", inst.snare(8 * p), at(SECTION.build, beat), db(-18 + 18 * p));
  }
}

function bassline(mix: Mixer): void {
  for (let bar = 0; bar < SECTION.end; bar++) {
    const g = GROOVE[sectionOf(bar)];
    if (g.bass === "off") continue;
    for (const step of [2, 6, 10, 14]) {
      const { bass } = chordAt(bar, step / 4);
      // Every second bar of the loop the last offbeat jumps an octave: a small bounce into the next chord.
      const bounce = g.bass === "full" && step === 14 && (bar - SECTION.title) % 2 === 1 ? 12 : 0;
      const shape = g.bass === "sub" ? { saw: 0, bright: 1 } : { saw: 1, bright: 1 };
      // The intro's sub swells in across its bar.
      const gain = g.bass === "sub" ? 0.5 + step / 32 : 1;
      mix.add("bass", inst.bass(bass + bounce, 0.19, shape), at(bar, step / 4), gain);
    }
  }
}

// Stab rhythms in sixteenths: 3-3-2 eighths (the tresillo), or straight eighths for the build.
const TRESILLO = [0, 6, 12];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

const STABS: Record<StabStyle, { steps: readonly number[]; gain: number; bright: number; octave: boolean }> = {
  intro: { steps: TRESILLO, gain: 0.9, bright: 1.2, octave: false },
  // The drops double the top voice an octave up.
  drop: { steps: TRESILLO, gain: 1, bright: 1.35, octave: true },
  loop: { steps: TRESILLO, gain: 0.7, bright: 0.7, octave: false },
  features: { steps: TRESILLO, gain: 0.85, bright: 1, octave: false },
  build: { steps: EIGHTHS, gain: 0.8, bright: 1, octave: false },
};

function harmony(mix: Mixer): void {
  for (let bar = 0; bar < SECTION.end; bar++) {
    const g = GROOVE[sectionOf(bar)];
    const rng = new Rng(seed("harmony", bar));
    if (g.stabs) {
      const style = STABS[g.stabs];
      for (const step of style.steps) {
        const { tones } = chordAt(bar, step / 4);
        const notes = style.octave ? [...tones, tones[tones.length - 1]! + 12] : tones;
        const voice = inst.supersaw(notes, { gate: 0.26, decay: 0.2, bright: style.bright, release: 0.08 }, rng);
        // The build's eighths swell toward the drop.
        const swell = g.stabs === "build" ? 0.55 + (0.45 * step) / 14 : 1;
        mix.add("stabs", voice, at(bar, step / 4), style.gain * swell);
      }
    }
    if (g.pad) {
      for (const [from, to] of chordSpans(bar)) {
        const chord = chordAt(bar, from);
        // The root an octave or two above the bass fills the gap below the voicing.
        const notes = [chord.bass + (chord.bass < 36 ? 24 : 12), ...chord.tones];
        const voice = inst.pad(notes, (to - from) * BEAT, { attack: 0.25, release: 0.7, cutoff: 1800 }, rng);
        mix.add("pad", voice, at(bar, from), g.pad);
      }
    }
  }
}

// Sixteenths over the chord tones an octave up: rolling up and back, then (from
// the montage's fifth bar on) reaching the octave. Accents follow the hook's 3-3-2.
const ARP_ROLL = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3];
const ARP_CLIMB = [0, 1, 2, 3, 1, 2, 3, 4, 0, 1, 2, 3, 1, 2, 3, 4];
const ARP_ACCENTS = new Set([0, 3, 6, 8, 11, 14]);

function arpeggio(mix: Mixer): void {
  for (let bar = 0; bar < SECTION.end; bar++) {
    const g = GROOVE[sectionOf(bar)];
    if (!g.arp) continue;
    const rng = new Rng(seed("arp", bar));
    const pattern = bar < SECTION.features + 4 ? ARP_ROLL : ARP_CLIMB;
    for (let step = 0; step < 16; step++) {
      const tones = chordAt(bar, step / 4).tones.map((m) => m + 12);
      const i = pattern[step]!;
      const midi = i < tones.length ? tones[i]! : tones[i - tones.length]! + 12;
      const accent = ARP_ACCENTS.has(step) ? 1 : 0.65;
      mix.add("arp", inst.pluck(midi, 1, rng), at(bar, step / 4), g.arp * accent, step % 2 ? 0.2 : -0.2);
    }
  }
}

/**
 * Drop 2's hook over the turnaround, [bar of the drop, sixteenth, MIDI,
 * length in sixteenths]: 3-3-2 twice a bar with chord tones on the strong
 * beats. It ends on the A7's G, which resolves to F#5 on the final hit.
 */
const HOOK: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 78, 3], [0, 3, 78, 3], [0, 6, 76, 2], [0, 8, 74, 3], [0, 11, 76, 3], [0, 14, 78, 2],
  [1, 0, 81, 3], [1, 3, 81, 3], [1, 6, 78, 2], [1, 8, 78, 3], [1, 11, 76, 3], [1, 14, 74, 2],
  [2, 0, 79, 3], [2, 3, 78, 3], [2, 6, 76, 2], [2, 8, 73, 3], [2, 11, 76, 3], [2, 14, 79, 2],
];
/** F#5 held over the final chord, with vibrato. */
const HOOK_END = { midi: 78, beats: 3 };

function hook(mix: Mixer): void {
  const start = at(SECTION.drop);
  const notes = HOOK.map(([bar, step, midi, steps]) => ({
    t: at(SECTION.drop + bar, step / 4) - start,
    dur: (steps * BEAT) / 4,
    midi,
  }));
  notes.push({ t: at(SECTION.end) - start, dur: HOOK_END.beats * BEAT, midi: HOOK_END.midi });
  const last = notes[notes.length - 1]!;
  mix.add("lead", inst.lead(notes, last.t + last.dur + 0.6, new Rng(seed("lead"))), start);
}

/** The end card: kick, crash and sub boom under a ringing Dmaj9, then no more drums. */
function finale(mix: Mixer, kit: Kit): void {
  const t = at(SECTION.end);
  const rng = new Rng(seed("finale"));
  const { tones } = CHORDS.Dmaj9;
  mix.add("kick", kit.kick, t);
  mix.add("crash", kit.crash, t);
  mix.add("finale", inst.boom(), t, 0.9);
  mix.add("finale", inst.bass(38, 0.9, { saw: 0.8, bright: 0.8, release: 0.8 }), t, 0.7);
  mix.add("finale", inst.supersaw([...tones, 78], { gate: 1.5, decay: 0.8, bright: 1.2, release: 1.2 }, rng), t);
  mix.add("finale", inst.pad([50, 57, ...tones], 0.9, { attack: 0.02, release: 2.4, cutoff: 2200 }, rng), t, 0.9);
}

/**
 * The stab bus's 24 dB/oct lowpass: it opens from 500 Hz to 6 kHz across the
 * intro and again from 700 Hz across the build; otherwise it's wide open.
 */
function stabCutoff(t: number): number {
  const title = at(SECTION.title);
  const build = at(SECTION.build);
  const drop = at(SECTION.drop);
  if (t < title) return 500 * 12 ** (t / title);
  if (t >= build && t < drop) return 700 * (6000 / 700) ** ((t - build) / (drop - build));
  return 20_000;
}

function sweep(bus: Stereo, cutoffAt: (t: number) => number): void {
  const filters = [bus.left, bus.right].map((ch) => ({ ch, a: new Svf(), b: new Svf() }));
  // Glide on a log scale so a section boundary doesn't jump the cutoff.
  const glide = Math.exp(-1 / (0.02 * SR));
  let log = Math.log(cutoffAt(0));
  for (let i = 0; i < LENGTH; i++) {
    const target = Math.log(cutoffAt(i / SR));
    log = target + (log - target) * glide;
    const g = warp(Math.exp(log));
    for (const f of filters) {
      // Two stages with Butterworth Qs: a 24 dB/oct slope with no resonant bump.
      f.a.warped(g, 0.5412);
      f.b.warped(g, 1.3066);
      f.ch[i] = f.b.lp(f.a.lp(f.ch[i]!));
    }
  }
}

/** Plays every part into its stem; `render()` on the result mixes them (or a few, to solo them). */
export function renderSong(): Mixer {
  const mix = new Mixer();
  const kit = makeKit();
  drums(mix, kit);
  transitions(mix, kit);
  bassline(mix);
  harmony(mix);
  arpeggio(mix);
  hook(mix);
  finale(mix, kit);
  sweep(mix.stems.stabs, stabCutoff);
  return mix;
}

/** The whole song as a stereo mix, before mastering. */
export const renderMusic = (): Stereo => renderSong().render();
