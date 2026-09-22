import { homedir } from "node:os";
import { join } from "node:path";

// ARCHER_DEFAULT_APP_URL is inlined by the published build (tsup.config.ts) so
// `npx archer-cli` targets the hosted app; running from the repo falls through
// to local dev.
export const APP_URL = (
  process.env.ARCHER_APP_URL ??
  process.env.ARCHER_DEFAULT_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

/** The hosted MCP server: what `archer login` signs in to, and the CLI's only backend. */
export const MCP_URL = `${APP_URL}/mcp`;

export const VERSION = process.env.ARCHER_CLI_VERSION ?? "dev";

/** Resolved lazily so tests (and HOME changes) take effect. */
export const archerDir = (): string => join(homedir(), ".archer");
