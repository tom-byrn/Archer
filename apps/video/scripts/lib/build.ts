import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const DIST = join(ROOT, "dist");
export const OUT = join(ROOT, "out");

const options: esbuild.BuildOptions = {
  entryPoints: [join(ROOT, "src/main.ts")],
  outdir: DIST,
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  // Fonts ship as files next to the bundle; Phosphor icons come in as SVG text.
  loader: { ".woff2": "file", ".woff": "file", ".svg": "text" },
  assetNames: "assets/[name]-[hash]",
  logLevel: "warning",
};

/** Bundle the film page into dist/ (index.html, main.js, main.css, fonts). */
export async function build(): Promise<void> {
  await mkdir(DIST, { recursive: true });
  await esbuild.build(options);
  await copyFile(join(ROOT, "src/index.html"), join(DIST, "index.html"));
}

/** Rebuild on every change under src/ (the dev preview). */
export async function watch(onRebuild: () => void): Promise<void> {
  await mkdir(DIST, { recursive: true });
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: "html",
        setup(b) {
          b.onEnd(async (result) => {
            await copyFile(join(ROOT, "src/index.html"), join(DIST, "index.html"));
            if (result.errors.length === 0) onRebuild();
          });
        },
      },
    ],
  });
  await ctx.watch();
}
