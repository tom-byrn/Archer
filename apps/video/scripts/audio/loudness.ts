/**
 * Loudness and peak metering after ITU-R BS.1770-4 / EBU R128: K-weighted,
 * gated integrated loudness and 4× oversampled true peak. The master uses it
 * to hit its targets; the render script prints it.
 */
import { SR, type Stereo } from "./dsp";

// K-weighting at 48 kHz (BS.1770-4 tables 1 and 2): a +4 dB high shelf that
// models the head, then a high-pass that discounts the sub (b0, b1, b2, a1, a2).
const SHELF = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585] as const;
const RLB = [1, -2, 1, -1.99004745483398, 0.99007225036621] as const;

/** Adds each K-weighted sample's energy into its 100 ms segment. */
function kWeightedEnergy(x: Float32Array, segments: Float64Array, segment: number): void {
  const [b0, b1, b2, a1, a2] = SHELF;
  const [c0, c1, c2, d1, d2] = RLB;
  let s1 = 0, s2 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const y = b0 * v + s1;
    s1 = b1 * v - a1 * y + s2;
    s2 = b2 * v - a2 * y;
    const z = c0 * y + r1;
    r1 = c1 * y - d1 * z + r2;
    r2 = c2 * y - d2 * z;
    const seg = Math.floor(i / segment);
    if (seg < segments.length) segments[seg]! += z * z;
  }
}

const lufs = (meanSquare: number): number => -0.691 + 10 * Math.log10(meanSquare);

/** Integrated loudness in LUFS: 400 ms blocks, 75 % overlap, −70 LUFS absolute and −10 LU relative gates. */
export function integratedLoudness(bus: Stereo): number {
  const segment = SR / 10;
  const segments = new Float64Array(Math.floor(bus.left.length / segment));
  kWeightedEnergy(bus.left, segments, segment);
  kWeightedEnergy(bus.right, segments, segment);
  const blocks: number[] = [];
  for (let j = 0; j + 4 <= segments.length; j++) {
    blocks.push((segments[j]! + segments[j + 1]! + segments[j + 2]! + segments[j + 3]!) / (4 * segment));
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const audible = blocks.filter((z) => lufs(z) > -70);
  if (audible.length === 0) return -Infinity;
  const relative = lufs(mean(audible)) - 10;
  return lufs(mean(audible.filter((z) => lufs(z) > relative)));
}

// 4× oversampling interpolator for true peak: a Kaiser-windowed sinc, 12 taps
// per phase. Phase 0 is the sample itself, so only phases 1–3 are computed.
const OVERSAMPLE = 4;
const HALF = 6;

function besselI0(x: number): number {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

const PHASES: Float64Array[] = Array.from({ length: OVERSAMPLE - 1 }, (_, i) => {
  const p = (i + 1) / OVERSAMPLE;
  const beta = 8;
  const h = new Float64Array(2 * HALF);
  let sum = 0;
  for (let j = 0; j < 2 * HALF; j++) {
    // Tap j weighs x[n − (j − HALF)] for the point p of the way from x[n] to x[n + 1].
    const x = j - HALF + p;
    const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
    const w = besselI0(beta * Math.sqrt(1 - (x / HALF) ** 2)) / besselI0(beta);
    h[j] = sinc * w;
    sum += h[j]!;
  }
  return h.map((v) => v / sum);
});

/** Per-sample true-peak envelope: the largest |value| at the sample or on the way to the next one. */
export function truePeakEnvelope(x: Float32Array): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const at = (i: number) => (i >= 0 && i < n ? x[i]! : 0);
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]!);
    const inside = i >= HALF && i + HALF < n;
    for (const h of PHASES) {
      let acc = 0;
      if (inside) {
        for (let j = 0; j < 2 * HALF; j++) acc += x[i - j + HALF]! * h[j]!;
      } else {
        for (let j = 0; j < 2 * HALF; j++) acc += at(i - j + HALF) * h[j]!;
      }
      const a = Math.abs(acc);
      if (a > m) m = a;
    }
    out[i] = m;
  }
  return out;
}

/** True peak (linear) over both channels. */
export function truePeak(bus: Stereo): number {
  let m = 0;
  for (const ch of [bus.left, bus.right]) {
    const env = truePeakEnvelope(ch);
    for (let i = 0; i < env.length; i++) if (env[i]! > m) m = env[i]!;
  }
  return m;
}
