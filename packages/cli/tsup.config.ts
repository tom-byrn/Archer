import { defineConfig } from "tsup";
import pkg from "./package.json";

// Defaults baked into the published bundle (see packages/mcp/src/backend.ts).
// Override at publish time: ARCHER_DEFAULT_APP_URL=https://… pnpm build
const CONVEX_URL =
  process.env.ARCHER_DEFAULT_CONVEX_URL ?? "https://greedy-goldfinch-347.convex.cloud";
const APP_URL = process.env.ARCHER_DEFAULT_APP_URL;
if (!APP_URL)
  console.warn("[archer-cli] ARCHER_DEFAULT_APP_URL is not set — editor URLs will default to http://localhost:3000.");

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "esm",
  target: "node20",
  clean: true,
  // Workspace packages are private and ship as TS source, so inline them;
  // real npm dependencies stay external.
  noExternal: [/^@archer\//],
  define: {
    "process.env.ARCHER_CLI_VERSION": JSON.stringify(pkg.version),
    "process.env.ARCHER_DEFAULT_CONVEX_URL": JSON.stringify(CONVEX_URL),
    ...(APP_URL ? { "process.env.ARCHER_DEFAULT_APP_URL": JSON.stringify(APP_URL) } : {}),
  },
});
