/**
 * Dev check for the SVG renderer: writes the Acme SaaS sample as SVG.
 *
 * Usage: pnpm --filter @archer/web exec tsx scripts/render-svg.ts [out.svg] [light|dark]
 */
import { writeFileSync } from "node:fs";
import { renderArchSvg } from "../lib/svg";
import { ACME_SAAS } from "@archer/mcp/samples";

const out = process.argv[2] ?? "/tmp/archer-sample.svg";
const theme = process.argv[3] === "dark" ? "dark" : "light";
writeFileSync(out, renderArchSvg(ACME_SAAS, { theme }));
console.log(`wrote ${out}`);
