/**
 * In-process check of the HOSTED (remote) mode: registers the tools on a
 * McpServer with mode "remote", connects a client over an in-memory transport,
 * and injects the auth info the web route would attach after verifying an
 * OAuth token. Read-only against the backend (creates nothing).
 *
 * Usage:
 *   ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> REMOTE_CHECK_USER_ID=user_… \
 *     pnpm --filter @archer/mcp exec tsx scripts/remote-check.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const missing = ["ARCHER_SERVICE_SECRET", "CONVEX_URL", "REMOTE_CHECK_USER_ID"].filter(
  (k) => !process.env[k] || process.env[k]!.trim() === "",
);
if (missing.length > 0) {
  console.error(`remote-check needs: ${missing.join(", ")}`);
  process.exit(2);
}
const USER_ID = process.env.REMOTE_CHECK_USER_ID!.trim();

// Import after the env check: backend.ts reads CONVEX_URL at import time.
const { registerArcherTools } = await import("../src/server");

const server = new McpServer({ name: "archer", version: "remote-check" });
registerArcherTools(server, { mode: "remote" });

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

// What the web route does after verifying the OAuth token: every incoming
// message carries authInfo.extra = { userId, agentName }.
let authenticated = true;
const deliver = serverTransport.onmessage!;
serverTransport.onmessage = (message, extra) =>
  deliver.call(serverTransport, message, {
    ...extra,
    authInfo: {
      token: "t",
      clientId: "test",
      scopes: [],
      extra: authenticated ? { userId: USER_ID, agentName: "remote-check" } : {},
    },
  });

const client = new Client({ name: "remote-check", version: "0.0.0" });
await client.connect(clientTransport);

let failures = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("      ", JSON.stringify(detail).slice(0, 400));
  }
};
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content as { text?: string }[])[0]?.text ?? "";
  let json: any = null;
  try {
    json = JSON.parse(content);
  } catch {
    // plain text result
  }
  return { isError: res.isError === true, text: content, json };
};

const names = (await client.listTools()).tools.map((t) => t.name);
check("28 tools registered", names.length === 28, names);
check("no set_api_key in hosted mode", !names.includes("set_api_key"));
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
check("list_projects returns the user's projects", !projects.isError, projects.text);
console.log(`       (${(projects.json?.projects ?? projects.json ?? []).length ?? "?"} projects visible)`);

const bogus = await call("use_workspace", { workspace_id: "not-a-workspace" });
check("use_workspace rejects non-members", bogus.isError && /not a member/.test(bogus.text), bogus.text);

const lang = await call("format_source", { source: 'arch "X" v0.1\ncomponent a\n' });
check("stateless language tool works", !lang.isError && lang.text.includes("component a"), lang.text);

authenticated = false;
const anon = await call("list_projects");
check("no userId → Not authenticated", anon.isError && anon.text.includes("Not authenticated"), anon.text);
const anonInfo = await call("get_workspace_info");
check("no userId → get_workspace_info refused too", anonInfo.isError && anonInfo.text.includes("Not authenticated"), anonInfo.text);

await client.close();
console.log(failures === 0 ? "\nREMOTE CHECK PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
