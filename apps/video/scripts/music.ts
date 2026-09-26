/**
 * Renders the soundtrack: the song plus one sound effect per cue in
 * out/cues.json (published by the picture), mastered to out/soundtrack.wav —
 * 48 kHz stereo 32-bit float, exactly the film's length. Without cues.json
 * (or with --demo) it mixes a built-in demo cue list, so the track can be
 * judged on its own.
 *
 * Usage: pnpm music [--demo] [--cues <file>] [--out <file>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Cue, CueKind } from "../src/cues";
import { DURATION } from "../src/time";
import { renderSoundtrack } from "./audio";
import { demoCues } from "./audio/demo";
import { toDb } from "./audio/dsp";
import { integratedLoudness, truePeak } from "./audio/loudness";
import { CUE_KINDS } from "./audio/sfx";
import { encodeWav } from "./audio/wav";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cuesPath = option("--cues") ? resolve(option("--cues")!) : resolve(pkg, "out/cues.json");
const outPath = option("--out") ? resolve(option("--out")!) : resolve(pkg, "out/soundtrack.wav");

const kinds = new Set<string>(CUE_KINDS);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function isCue(x: unknown): x is Cue {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  const optional = (v: unknown) => v === undefined || finite(v);
  return finite(c.t) && kinds.has(String(c.kind)) && optional(c.gain) && optional(c.pitch) && optional(c.dur);
}

function readCues(path: string): Cue[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${path}: expected a JSON array of cues`);
  const cues = raw.filter(isCue);
  if (cues.length < raw.length) console.warn(`skipped ${raw.length - cues.length} malformed cue(s) in ${path}`);
  const late = cues.filter((c) => c.t >= DURATION).length;
  if (late) console.warn(`${late} cue(s) start after the film ends and are dropped`);
  return cues;
}

const useDemo = args.includes("--demo") || !existsSync(cuesPath);
const cues = useDemo ? demoCues() : readCues(cuesPath);

const started = performance.now();
const { sampleRate, left, right } = renderSoundtrack(cues);
const seconds = (performance.now() - started) / 1000;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, encodeWav(left, right, sampleRate));

let peak = 0;
let energy = 0;
for (const ch of [left, right]) {
  for (let i = 0; i < ch.length; i++) {
    const v = ch[i]!;
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
  }
}
const counts = new Map<CueKind, number>();
for (const c of cues) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
const fmt = (x: number) => x.toFixed(1);

console.log(`${relative(process.cwd(), outPath) || outPath}`);
console.log(`  ${(left.length / sampleRate).toFixed(3)} s, ${sampleRate} Hz stereo, 32-bit float`);
console.log(
  `  cues: ${cues.length}${useDemo ? " (built-in demo)" : ""} — ` +
    [...counts].map(([k, n]) => `${k} ${n}`).join(", "),
);
console.log(
  `  loudness ${fmt(integratedLoudness({ left, right }))} LUFS, true peak ${fmt(toDb(truePeak({ left, right })))} dBTP, ` +
    `peak ${fmt(toDb(peak))} dBFS, RMS ${fmt(toDb(Math.sqrt(energy / (2 * left.length))))} dBFS`,
);
console.log(`  rendered in ${seconds.toFixed(1)} s`);
