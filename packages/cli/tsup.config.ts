import { defineConfig } from "tsup";
import pkg from "./package.json";

// Defaults baked into the published bundle (see packages/mcp/src/backend.ts).
// Override with ARCHER_DEFAULT_CONVEX_URL / ARCHER_DEFAULT_APP_URL at build time.
const CONVEX_URL =
  process.env.ARCHER_DEFAULT_CONVEX_URL ?? "https://greedy-goldfinch-347.convex.cloud";
const APP_URL = process.env.ARCHER_DEFAULT_APP_URL ?? "https://archer.tombyrne.dev";

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
    "process.env.ARCHER_DEFAULT_APP_URL": JSON.stringify(APP_URL),
  },
});
