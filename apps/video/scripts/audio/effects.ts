/**
 * Effects and dynamics: a Freeverb-style reverb, a tempo-synced ping-pong
 * delay, kick-keyed ducking, a bus compressor, a soft clipper and a
 * true-peak limiter.
 */
import { Biquad, OnePole, SR, db, smoothstep, stereo, toDb, toSamples, type Stereo } from "./dsp";
import { truePeakEnvelope } from "./loudness";

/** A time-based effect that adds its wet output over a sample range and can be silenced. */
export interface Effect {
  process(input: Stereo, out: Stereo, from: number, to: number): void;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Reverb

class Comb {
  private readonly buf: Float32Array;
  private i = 0;
  private store = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  tick(x: number, feedback: number, damp: number): number {
    const out = this.buf[this.i]!;
    // The one-pole lowpass in the loop makes highs die first, like a real room.
    this.store = out + (this.store - out) * damp;
    this.buf[this.i] = x + this.store * feedback;
    if (++this.i === this.buf.length) this.i = 0;
    return out;
  }

  clear(): void {
    this.buf.fill(0);
    this.store = 0;
  }
}

class Allpass {
  private readonly buf: Float32Array;
  private i = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  tick(x: number): number {
    const b = this.buf[this.i]!;
    this.buf[this.i] = x + b * 0.5;
    if (++this.i === this.buf.length) this.i = 0;
    return b - x;
  }

  clear(): void {
    this.buf.fill(0);
  }
}

// Jezar's tunings (samples at 44.1 kHz), mutually prime so the echoes smear.
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const SPREAD = 23;

export interface ReverbOptions {
  /** 0–1: a longer tail. */
  room: number;
  /** 0–1: a darker tail. */
  damp: number;
  /** Scales every delay line: below 1 is a smaller space. */
  size?: number;
  predelay?: number;
  /** Input band limits, Hz: no low-end mud or fizz in the tail. */
  lowCut?: number;
  highCut?: number;
}

/**
 * Freeverb (Jezar, public domain): eight damped combs into four allpasses
 * per side, the right side's lines a little longer for width.
 */
export class Reverb implements Effect {
  private readonly left: { combs: Comb[]; allpasses: Allpass[] };
  private readonly right: { combs: Comb[]; allpasses: Allpass[] };
  private readonly feedback: number;
  private readonly damp: number;
  private readonly pre: Float32Array;
  private preIndex = 0;
  private lowCut: Biquad;
  private highCut: OnePole;

  constructor(private readonly o: ReverbOptions) {
    const scale = (SR / 44_100) * (o.size ?? 1);
    const side = (spread: number) => ({
      combs: COMBS.map((n) => new Comb(Math.round((n + spread) * scale))),
      allpasses: ALLPASSES.map((n) => new Allpass(Math.round((n + spread) * scale))),
    });
    this.left = side(0);
    this.right = side(SPREAD);
    this.feedback = 0.7 + 0.28 * o.room;
    this.damp = 0.4 * o.damp;
    this.pre = new Float32Array(Math.max(1, toSamples(o.predelay ?? 0)));
    this.lowCut = Biquad.highpass(o.lowCut ?? 200);
    this.highCut = new OnePole(o.highCut ?? 9000);
  }

  process(input: Stereo, out: Stereo, from: number, to: number): void {
    const { feedback, damp, pre, left, right } = this;
    for (let n = from; n < to; n++) {
      // Freeverb reverberates the mono sum; the stereo image comes from the two sides' tunings.
      const x = this.highCut.lp(this.lowCut.tick((input.left[n]! + input.right[n]!) * 0.5));
      const delayed = pre[this.preIndex]!;
      pre[this.preIndex] = x;
      if (++this.preIndex === pre.length) this.preIndex = 0;
      const v = delayed * 0.015;
      let l = 0;
      let r = 0;
      for (const c of left.combs) l += c.tick(v, feedback, damp);
      for (const c of right.combs) r += c.tick(v, feedback, damp);
      for (const a of left.allpasses) l = a.tick(l);
      for (const a of right.allpasses) r = a.tick(r);
      out.left[n]! += l * 3;
      out.right[n]! += r * 3;
    }
  }

  clear(): void {
    for (const side of [this.left, this.right]) {
      for (const c of side.combs) c.clear();
      for (const a of side.allpasses) a.clear();
    }
    this.pre.fill(0);
    this.lowCut = Biquad.highpass(this.o.lowCut ?? 200);
    this.highCut = new OnePole(this.o.highCut ?? 9000);
  }
}

// ---------------------------------------------------------------------------
// Delay

/**
 * Ping-pong delay: echoes alternate left and right, each a little darker and
 * thinner than the last so the repeats stay behind the dry sound.
 */
export class PingPong implements Effect {
  private readonly l: Float32Array;
  private readonly r: Float32Array;
  private i = 0;
  private tone = { lp: new OnePole(1), hp: new OnePole(1) };

  constructor(
    delaySeconds: number,
    private readonly feedback: number,
    private readonly highCut = 4500,
    private readonly lowCut = 300,
  ) {
    this.l = new Float32Array(toSamples(delaySeconds));
    this.r = new Float32Array(toSamples(delaySeconds));
    this.clear();
  }

  process(input: Stereo, out: Stereo, from: number, to: number): void {
    const { l, r, feedback, tone } = this;
    for (let n = from; n < to; n++) {
      const echoL = l[this.i]!;
      const echoR = r[this.i]!;
      out.left[n]! += echoL;
      out.right[n]! += echoR;
      const x = (input.left[n]! + input.right[n]!) * 0.5;
      l[this.i] = x + tone.hp.hp(tone.lp.lp(echoR)) * feedback;
      r[this.i] = echoL * feedback;
      if (++this.i === l.length) this.i = 0;
    }
  }

  clear(): void {
    this.l.fill(0);
    this.r.fill(0);
    this.tone = { lp: new OnePole(this.highCut), hp: new OnePole(this.lowCut) };
  }
}

/**
 * Runs an effect across the whole track, but fades its output out just
 * before each gap and restarts it empty at the gap's end, so the drop gaps
 * are true silence and no old tail comes back with the drop.
 */
export function renderEffect(
  effect: Effect,
  input: Stereo,
  gaps: ReadonlyArray<readonly [number, number]>,
): Stereo {
  const n = input.left.length;
  const out = stereo(n);
  const fade = toSamples(0.004);
  let pos = 0;
  for (const [a, b] of gaps) {
    const start = toSamples(a);
    effect.process(input, out, pos, start);
    for (let i = Math.max(pos, start - fade); i < start; i++) {
      const g = (start - i) / fade;
      out.left[i]! *= g;
      out.right[i]! *= g;
    }
    effect.clear();
    pos = toSamples(b);
  }
  effect.process(input, out, pos, n);
  return out;
}

// ---------------------------------------------------------------------------
// Dynamics

/**
 * Kick-keyed ducking ("sidechain" pumping): the gain dips `depth` dB right
 * after each kick and swells back over `release` s, so bass and chords
 * breathe around the kick instead of masking it.
 */
export function duck(length: number, kicks: readonly number[], depth: number, release = 0.13): Float32Array {
  const g = new Float32Array(length).fill(1);
  const attack = toSamples(0.003);
  const hold = toSamples(0.015);
  const rel = toSamples(release);
  for (const k of kicks) {
    const start = toSamples(k);
    for (let i = 0; i < attack + hold + rel && start + i < length; i++) {
      const x = i < attack ? i / attack : 1 - smoothstep((i - attack - hold) / rel);
      const v = db(-depth * x);
      if (v < g[start + i]!) g[start + i] = v;
    }
  }
  return g;
}

export interface CompressorOptions {
  /** dBFS where compression starts (centre of the knee). */
  threshold: number;
  ratio: number;
  /** Knee width, dB. */
  knee: number;
  attack: number;
  release: number;
}

/** Stereo-linked feed-forward compressor, in place: the gentle glue on the mix bus. */
export function compress(bus: Stereo, o: CompressorOptions): void {
  const { left, right } = bus;
  const att = Math.exp(-1 / (o.attack * SR));
  const rel = Math.exp(-1 / (o.release * SR));
  const slope = 1 - 1 / o.ratio;
  let gr = 0;
  for (let i = 0; i < left.length; i++) {
    const over = toDb(Math.max(Math.abs(left[i]!), Math.abs(right[i]!))) - o.threshold;
    const want =
      2 * over <= -o.knee ? 0 : 2 * over >= o.knee ? slope * over : (slope * (over + o.knee / 2) ** 2) / (2 * o.knee);
    gr = want > gr ? att * gr + (1 - att) * want : rel * gr + (1 - rel) * want;
    const g = db(-gr);
    left[i]! *= g;
    right[i]! *= g;
  }
}

/**
 * Soft clipper, in place: linear up to `knee` × `ceiling`, then rounding into
 * the ceiling. Shaves the kick's sharpest peaks so the limiter barely works.
 */
export function softClip(bus: Stereo, ceiling: number, knee = 0.75): void {
  const t = knee * ceiling;
  const room = ceiling - t;
  for (const ch of [bus.left, bus.right]) {
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i]!;
      const a = Math.abs(x);
      if (a > t) ch[i] = Math.sign(x) * (t + room * Math.tanh((a - t) / room));
    }
  }
}

/** Minimum of x[i … i + w] for every i (monotonic deque, O(n)). */
function minAhead(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && x[queue[tail - 1]!]! >= x[i]!) tail--;
    queue[tail++] = i;
    while (queue[head]! > i + w) head++;
    out[i] = x[queue[head]!]!;
  }
  return out;
}

/**
 * Lookahead brickwall limiter on true peaks (4× oversampled), stereo-linked.
 * The gain ramps down over `lookahead` s before each over, so peaks are
 * caught without distortion, and recovers over `release` s. Returns the
 * largest gain reduction in dB.
 */
export function limit(bus: Stereo, ceiling: number, lookahead = 0.003, release = 0.08): number {
  const n = bus.left.length;
  const peakL = truePeakEnvelope(bus.left);
  const peakR = truePeakEnvelope(bus.right);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(peakL[i]!, peakR[i]!);
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  const w = Math.max(1, toSamples(lookahead));
  const gain = minAhead(need, w);
  // Recover smoothly, but never above what the upcoming peaks allow.
  const rel = Math.exp(-1 / (release * SR));
  let h = 1;
  for (let i = 0; i < n; i++) {
    h = Math.min(gain[i]!, 1 - (1 - h) * rel);
    gain[i] = h;
  }
  // A moving average over the lookahead turns the steps into ramps; every value
  // it averages already allows the peak at the window's end, so the peak is held.
  let sum = w;
  let most = 1;
  for (let i = 0; i < n; i++) {
    sum += gain[i]! - (i >= w ? gain[i - w]! : 1);
    const g = Math.min(1, sum / w);
    if (g < most) most = g;
    bus.left[i]! *= g;
    bus.right[i]! *= g;
  }
  return -toDb(most);
}
