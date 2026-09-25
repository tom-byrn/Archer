import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Anything a person can do in the app, an agent can do over MCP (the guide's
 * capability map, packages/mcp/src/guide.ts). The app acts through Convex
 * functions and its GitHub routes (app/api/github/*); the MCP tools reach
 * Convex through packages/mcp/src/backend.ts and GitHub through
 * lib/server/mcpHost.ts, which runs the same engine the routes do.
 *
 * So this fails when a public Convex function or a GitHub route appears that
 * the MCP can't reach. Add a tool for it (docs/mcp.md, "Adding or changing a
 * tool"), or, when it only makes sense in a browser, list it in EXEMPT with
 * the reason.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** Public Convex functions agents have no use for, and why. */
const EXEMPT: Record<string, string> = {
  "workspaces.me": "The signed-in browser's own identity; agents get theirs from get_workspace_info.",
  "workspaces.claimLegacy": "Moves the anonymous workspace a browser used before sign-in into the account; only that browser knows its id.",
  "revisions.list": "Revision metadata for the History panel; get_history reads revisions.listFull.",
};

/** What each GitHub route does, by the engine function it calls: the MCP host must call it too. */
const GITHUB_ROUTES: Record<string, string> = {
  repos: "searchRepos",
  branches: "listBranches",
  commits: "listCommits",
  files: "archFiles",
  projects: "createFromRepo",
  link: "linkFile",
  sync: "syncWith",
  publish: "publishDocument",
};

const CONVEX_MODULES = ["agentPrefs", "documents", "drift", "library", "repoSync", "revisions", "workspaces"];

/** `module.name` of every public query and mutation. */
function publicFunctions(): string[] {
  const dir = fileURLToPath(new URL("../convex/", import.meta.url));
  const modules = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -3));
  return modules.flatMap((m) =>
    [...read(`../convex/${m}.ts`).matchAll(/export const (\w+) = (?:query|mutation)\(/g)].map((x) => `${m}.${x[1]}`),
  );
}

/** Convex functions the MCP tools call directly. */
const mcpFunctions = () =>
  new Set(
    [...read("../../../packages/mcp/src/backend.ts").matchAll(/[qm]ref\("(\w+)", "(\w+)"\)/g)].map((x) => `${x[1]}.${x[2]}`),
  );

/** Convex functions the repo sync engine calls: the MCP reaches them through its host. */
const engineFunctions = () =>
  new Set([...read("../lib/server/repoSync.ts").matchAll(/api\.(\w+)\.(\w+)/g)].map((x) => `${x[1]}.${x[2]}`));

describe("everything in the app is reachable over MCP", () => {
  it("knows every Convex module", () => {
    // A new module needs a look: add it here once its functions are covered.
    const withFunctions = new Set(publicFunctions().map((f) => f.split(".")[0]!));
    expect([...withFunctions].sort()).toEqual(CONVEX_MODULES);
  });

  it("every public Convex function is called by the MCP tools, reached through the host, or exempt", () => {
    const reachable = new Set([...mcpFunctions(), ...engineFunctions(), ...Object.keys(EXEMPT)]);
    const missing = publicFunctions().filter((f) => !reachable.has(f));
    expect(missing, "public Convex functions no MCP tool can reach").toEqual([]);
  });

  it("exempts only functions that exist and that nothing else reaches", () => {
    const all = new Set(publicFunctions());
    const reached = new Set([...mcpFunctions(), ...engineFunctions()]);
    for (const f of Object.keys(EXEMPT)) {
      expect(all.has(f), `${f} no longer exists`).toBe(true);
      expect(reached.has(f), `${f} is reachable now: drop its exemption`).toBe(false);
    }
  });

  it("the MCP tools call only functions that exist", () => {
    const all = new Set(publicFunctions());
    expect([...mcpFunctions()].filter((f) => !all.has(f))).toEqual([]);
  });

  it("every GitHub route's work is something the MCP host does too", () => {
    const dir = fileURLToPath(new URL("../app/api/github/", import.meta.url));
    // The webhook is GitHub calling Archer, not something a person does.
    const routes = readdirSync(dir).filter((r) => r !== "webhook").sort();
    expect(routes).toEqual(Object.keys(GITHUB_ROUTES).sort());
    const host = read("../lib/server/mcpHost.ts");
    for (const [route, fn] of Object.entries(GITHUB_ROUTES)) {
      expect(read(`../app/api/github/${route}/route.ts`), `${route} route calls ${fn}`).toContain(`${fn}(`);
      expect(host, `mcpHost calls ${fn} (the ${route} route)`).toContain(`${fn}(`);
    }
  });
});
