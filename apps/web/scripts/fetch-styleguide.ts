/**
 * One-off tooling: fetch a site's design system via Context.dev and save it
 * for theme work. Costs 10 credits per run — do not loop.
 *
 * Usage: pnpm --filter @archer/web exec tsx scripts/fetch-styleguide.ts <domain> [light|dark] [outfile]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getStyleguide } from "../lib/server/contextdev";

// Load apps/web/.env.local (tsx doesn't).
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
} catch {
  // fall back to the ambient environment
}

async function main() {
  const domain = process.argv[2] ?? "mintlify.com";
  const rawScheme = process.argv[3];
  const scheme =
    rawScheme === "light" || rawScheme === "dark" ? rawScheme : undefined;
  const out =
    process.argv[4] ?? `styleguide-${domain}${scheme ? `-${scheme}` : ""}.json`;

  const result = await getStyleguide(domain, scheme);
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`saved ${out} (${JSON.stringify(result).length} bytes)`);
}

void main();
