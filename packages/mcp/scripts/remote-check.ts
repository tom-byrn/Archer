/**
 * In-process check of the hosted server's auth wiring: registers the tools,
 * connects a client over an in-memory transport, and injects the auth info
 * the web route would attach after verifying an OAuth token. Read-only
 * against the backend (creates nothing).
 *
 * Usage:
 *   ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> REMOTE_CHECK_USER_ID=user_… \
 *     pnpm --filter @archer/mcp exec tsx scripts/remote-check.ts
 */
import { checks, connectInProcess, requireEnv } from "./inProcess";

requireEnv(
  ["ARCHER_SERVICE_SECRET", "CONVEX_URL", "REMOTE_CHECK_USER_ID"],
  "ARCHER_SERVICE_SECRET=… CONVEX_URL=… REMOTE_CHECK_USER_ID=user_… tsx scripts/remote-check.ts",
);
const USER_ID = process.env.REMOTE_CHECK_USER_ID!.trim();

const { client, call, dropAuth } = await connectInProcess({ userId: USER_ID, agentName: "remote-check" });
const { check, failures } = checks();

const names = (await client.listTools()).tools.map((t) => t.name);
check("26 tools registered", names.length === 26, names);
check("no set_api_key", !names.includes("set_api_key"));
check("list_workspaces + use_workspace present", names.includes("list_workspaces") && names.includes("use_workspace"));

const info = await call("get_workspace_info");
check("get_workspace_info: oauth + user id", info.json?.auth === "oauth" && info.json?.user_id === USER_ID, info.text);
check("get_workspace_info never mentions API keys", !/api[_ ]key/i.test(info.text), info.text);
check("backend reachable with the service credential", info.json?.backend_reachable === true, info.text);
check("agent name comes from the request", info.json?.agent_name === "remote-check", info.text);

const spaces = await call("list_workspaces");
const personal = spaces.json?.workspaces?.find((w: { id: string }) => w.id === USER_ID);
check("list_workspaces includes Personal", !spaces.isError && personal?.kind === "personal", spaces.text);
check("a current workspace is marked", spaces.json?.workspaces?.some((w: { current: boolean }) => w.current), spaces.text);

const projects = await call("list_projects");
check("list_projects returns the user's projects", !projects.isError && Array.isArray(projects.json), projects.text);
console.log(`       (${Array.isArray(projects.json) ? projects.json.length : "?"} projects visible)`);

const bogus = await call("use_workspace", { workspace_id: "not-a-workspace" });
check("use_workspace rejects non-members", bogus.isError && /not a member/.test(bogus.text), bogus.text);

const lang = await call("format_source", { source: 'arch "X" v0.2\ncomponent a\n' });
check("stateless language tool works", !lang.isError && lang.text.includes("component a"), lang.text);

dropAuth();
const anon = await call("list_projects");
check("no userId → Not authenticated", anon.isError && anon.text.includes("Not authenticated"), anon.text);
const anonInfo = await call("get_workspace_info");
check("no userId → get_workspace_info refused too", anonInfo.isError && anonInfo.text.includes("Not authenticated"), anonInfo.text);

await client.close();
console.log(failures() === 0 ? "\nREMOTE CHECK PASSED" : `\n${failures()} CHECK(S) FAILED`);
process.exit(failures() === 0 ? 0 : 1);
