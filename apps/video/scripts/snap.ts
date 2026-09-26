/**
 * Stills for checking the film without rendering it: `pnpm snap 3.2 7 12.5`
 * writes out/snaps/t03.200.png…; `pnpm snap --sheet 0 39 0.5` writes a
 * contact sheet of every 0.5 s from 0 to 39 (out/snaps/sheet-0-39.png).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build, DIST, OUT } from "./lib/build";
import { frameAt, launch, openFilm } from "./lib/browser";
import { serve } from "./lib/server";

const args = process.argv.slice(2);
const dir = join(OUT, "snaps");
await mkdir(dir, { recursive: true });
await build();
const { url, server } = await serve([DIST, OUT]);
const browser = await launch();
const page = await openFilm(browser, url);

try {
  if (args[0] === "--sheet") {
    const [from = 0, to = 1, step = 0.5, cols = 6] = args.slice(1).map(Number);
    const times: number[] = [];
    for (let t = from; t <= to + 1e-9; t += step) times.push(Math.round(t * 1000) / 1000);
    const frames: string[] = [];
    for (const t of times) frames.push((await frameAt(page, t)).toString("base64"));
    const sheet = await browser.newPage({ viewport: { width: 1920, height: 400 } });
    const w = Math.floor(1920 / cols);
    const h = Math.round((w * 9) / 16);
    await sheet.setContent(
      `<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;width:1920px;font:12px monospace;color:#fff">` +
        frames
          .map(
            (b64, i) =>
              `<div style="position:relative;width:${w}px;height:${h}px;box-sizing:border-box;border:1px solid #444">` +
              `<img src="data:image/png;base64,${b64}" style="width:100%;height:100%;display:block">` +
              `<span style="position:absolute;left:4px;top:2px;background:#000a;padding:0 4px">${times[i]!.toFixed(2)}s</span></div>`,
          )
          .join("") +
        `</body>`,
    );
    const file = join(dir, `sheet-${from}-${to}.png`);
    await writeFile(file, await sheet.screenshot({ fullPage: true }));
    console.log(file);
  } else {
    for (const arg of args) {
      const t = Number(arg);
      const file = join(dir, `t${t.toFixed(3).padStart(7, "0")}.png`);
      await writeFile(file, await frameAt(page, t));
      console.log(file);
    }
  }
} finally {
  await browser.close();
  server.close();
}
