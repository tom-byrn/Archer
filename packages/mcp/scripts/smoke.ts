/**
 * End-to-end smoke test: spawns the MCP server over stdio and exercises every
 * tool group against the real local Convex backend.
 *
 * Usage: ARCHER_WORKSPACE_ID=<id> pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "tsx",
  args: ["src/index.ts"],
  env: { ...process.env } as Record<string, string>,
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

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
  return { isError: res.isError === true, text: content, json: safeJson(content) };
};
const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// tools/list
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
check("17 tools registered", names.length === 17, names);

// guide + resource
const guide = await call("get_guide");
check("guide has brief + spec + workflows", guide.text.includes("architecture-design tool") && guide.text.includes("## 2. File structure") && guide.text.includes("Standard workflows"));
const resources = await client.listResources();
check("guide resource listed", resources.resources.some((r) => r.uri === "archer://guide"));

// stateless language tools
const bad = await call("validate_source", { source: 'arch "T" v0.1\ncomponent a\na -> ghost' });
check("validate: E101 reported", bad.json?.valid === false && bad.json.errors[0].includes("E101"), bad.json);
const fmt = await call("format_source", { source: 'arch "T" v0.1\ncomponent a "A" @postgres' });
check("format: canonical", fmt.text.trim().endsWith('component a "A" @postgres'));
const laid = await call("auto_layout_source", { source: 'arch "T" v0.1\ncomponent a\ncomponent b\na -> b' });
check("auto_layout_source adds layout", laid.text.includes("layout {"));

// catalog
const types = await call("list_types", { search: "postgres" });
check("list_types finds postgres", types.json?.catalog.some((t: { tag: string }) => t.tag === "postgres"), types.json);

// projects (needs workspace)
const info = await call("get_workspace_info");
check("workspace configured + reachable", info.json?.workspace_id != null && info.json?.backend_reachable === true, info.json);

const rejected = await call("create_project", { source: 'arch "Smoke" v0.1\ncomponent a\na -> ghost' });
check("create rejects invalid source", rejected.isError && rejected.text.includes("E101"));

const created = await call("create_project", {
  source: 'arch "Smoke Test" v0.1\n\ncomponent api "API" @vercel.functions\ncomponent db "DB" @postgres {\n  schema json ```\n{"t": 1}\n```\n}\n\napi -> db @sql\n',
});
check("create_project succeeds", !created.isError && typeof created.json?.id === "string", created.text);
const pid = created.json.id as string;

const listed = await call("list_projects");
check("list_projects includes new project", listed.json?.some((p: { id: string }) => p.id === pid));

const got = await call("get_project", { project_id: pid });
check("get_project returns source + valid", got.json?.valid === true && got.json.source.includes("component api"));
const dbLayoutLine = (got.json.source as string).split("\n").find((l: string) => l.trim().startsWith("db:"));

// update WITHOUT layout: db position must survive (layout merge)
const updated = await call("update_project", {
  project_id: pid,
  source: 'arch "Smoke Test" v0.1\n\ncomponent api "API" @vercel.functions\ncomponent db "DB" @postgres\ncomponent cache "Cache" @redis\n\napi -> db @sql\napi -> cache\n',
});
check("update_project succeeds", !updated.isError && updated.json?.saved === true, updated.text);
const got2 = await call("get_project", { project_id: pid });
const dbLayoutLine2 = (got2.json.source as string).split("\n").find((l: string) => l.trim().startsWith("db:"));
check("layout preserved across update", dbLayoutLine !== undefined && dbLayoutLine === dbLayoutLine2, { before: dbLayoutLine, after: dbLayoutLine2 });
check("new component auto-placed", (got2.json.source as string).includes("cache:"));

// custom types
const ct = await call("create_custom_type", { name: "Smoke Engine", glyph: "gear", color: "#6366f1" });
check("create_custom_type", ct.json?.created === "custom.smoke_engine", ct.text);
const typesAfter = await call("list_types", { search: "smoke" });
check("custom type listed", typesAfter.json?.custom_types.some((t: { tag: string }) => t.tag === "custom.smoke_engine"));
const useCustom = await call("update_project", {
  project_id: pid,
  source: got2.json.source.replace('component cache "Cache" @redis', 'component cache "Cache" @custom.smoke_engine'),
});
const got3 = await call("get_project", { project_id: pid });
check("custom tag validates clean (no W301)", !useCustom.isError && got3.json.warnings.length === 0, got3.json.warnings);

// display + compile
const disp = await call("set_display", { project_id: pid, path: "api", display: "icon" });
check("set_display saves", !disp.isError && disp.json?.saved === true);
const compiled = await call("compile_for_agent", { project_id: pid });
check("compile_for_agent: preamble, no layout", compiled.text.includes("Archer architecture document") && !compiled.text.includes("layout {"));

// cleanup: delete custom type + project
const delType = await call("delete_custom_type", { tag: "custom.smoke_engine" });
check("delete_custom_type", !delType.isError);
const delProj = await call("delete_project", { project_id: pid, confirm: true });
check("delete_project", !delProj.isError && delProj.json?.deleted === pid);
const listedAfter = await call("list_projects");
check("project gone after delete", !listedAfter.json?.some((p: { id: string }) => p.id === pid));

await client.close();
console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
