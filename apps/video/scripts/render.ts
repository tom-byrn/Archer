/**
 * Render the film: `pnpm render` → out/archer-launch.mp4 (1920×1080, 60 fps,
 * H.264 + AAC).
 *
 * 1. Bundle the page and open it in headless Chromium.
 * 2. Collect the sound cues the scenes registered and mix the soundtrack
 *    (scripts/audio) into out/soundtrack.wav.
 * 3. Seek frame by frame across several pages in parallel, saving PNGs to
 *    out/frames (kept, so `--from 12 --to 14` re-renders just a stretch).
 * 4. Encode with ffmpeg ($FFMPEG, or ffmpeg on the PATH).
 *
 * Flags: --from <s> --to <s> (frames to render), --workers <n>, --no-audio,
 * --skip-frames (just re-encode), --no-encode (just frames), --crf <n>.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { build, DIST, OUT, ROOT } from "./lib/build";
import { frameAt, launch, openFilm } from "./lib/browser";
import { serve } from "./lib/server";
import { DURATION, FPS, FRAMES } from "../src/time";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: number) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const framesDir = join(OUT, "frames");
const frameFile = (f: number) => join(framesDir, `f${String(f).padStart(5, "0")}.png`);
const from = Math.max(0, Math.floor(opt("from", 0) * FPS));
const to = Math.min(FRAMES, Math.ceil(opt("to", DURATION) * FPS));
const workers = Math.max(1, opt("workers", Math.min(6, availableParallelism())));

await mkdir(framesDir, { recursive: true });
await build();
const { url, server } = await serve([DIST, OUT]);
const browser = await launch();

try {
  // Cues → soundtrack.
  const first = await openFilm(browser, url);
  const cues = await first.evaluate(() => window.__video!.cues);
  await writeFile(join(OUT, "cues.json"), JSON.stringify(cues, null, 1));
  console.log(`${cues.length} sound cues`);
  if (!flag("no-audio")) await soundtrack();

  // Frames.
  if (!flag("skip-frames")) {
    const pages = [first, ...(await Promise.all(Array.from({ length: workers - 1 }, () => openFilm(browser, url))))];
    const total = to - from;
    const chunk = Math.ceil(total / pages.length);
    let done = 0;
    const started = Date.now();
    await Promise.all(
      pages.map(async (page, w) => {
        for (let f = from + w * chunk; f < Math.min(to, from + (w + 1) * chunk); f++) {
          await writeFile(frameFile(f), await frameAt(page, f / FPS));
          done++;
          if (done % 60 === 0 || done === total) {
            const rate = done / ((Date.now() - started) / 1000);
            process.stdout.write(`\rframes ${done}/${total}  ${rate.toFixed(1)} fps  eta ${Math.round((total - done) / rate)}s   `);
          }
        }
      }),
    );
    process.stdout.write("\n");
  }
} finally {
  await browser.close();
  server.close();
}

// Encode.
const missing = Array.from({ length: FRAMES }, (_, f) => f).filter((f) => !existsSync(frameFile(f)));
if (flag("no-encode")) {
  console.log("frames only (--no-encode)");
} else if (missing.length > 0) {
  console.log(`${missing.length} frames not rendered yet (first: ${missing[0]}); skipping the encode.`);
} else {
  const wav = join(OUT, "soundtrack.wav");
  const audio = existsSync(wav) && !flag("no-audio");
  const out = join(OUT, "archer-launch.mp4");
  await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", join(framesDir, "f%05d.png"),
    ...(audio ? ["-i", wav] : []),
    // sRGB frames → BT.709 video, tagged, so players show the colours as designed.
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", String(opt("crf", 16)),
    "-tune", "animation",
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-color_range", "tv",
    ...(audio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"] : []),
    "-movflags", "+faststart",
    "-t", DURATION.toFixed(3),
    out,
  ]);
  console.log(out);
}

/** Mix out/soundtrack.wav from out/cues.json with the soundtrack script. */
async function soundtrack() {
  if (!existsSync(join(ROOT, "scripts/music.ts"))) {
    console.log("no scripts/music.ts; rendering silent");
    return;
  }
  await run(process.execPath, ["--import", "tsx", join(ROOT, "scripts/music.ts")]);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}
