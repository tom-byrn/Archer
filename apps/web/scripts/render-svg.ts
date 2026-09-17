/**
 * Dev check for the SVG renderer: writes the sample document as SVG.
 *
 * Usage: pnpm --filter @archer/web exec tsx scripts/render-svg.ts [out.svg] [light|dark]
 */
import { writeFileSync } from "node:fs";
import { renderArchSvg } from "../lib/svg";
import { SAMPLE } from "../lib/sample";

const out = process.argv[2] ?? "/tmp/archer-sample.svg";
const theme = process.argv[3] === "dark" ? "dark" : "light";
writeFileSync(out, renderArchSvg(SAMPLE, { theme }));
console.log(`wrote ${out}`);
