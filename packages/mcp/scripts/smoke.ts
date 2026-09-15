/**
 * End-to-end smoke test: spawns the MCP server over stdio and exercises every
 * tool group against the real local Convex backend.
 *
 * Usage: ARCHER_API_KEY=<key> pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = process.env.ARCHER_API_KEY?.trim();
if (!API_KEY) {
  console.error(
    "ARCHER_API_KEY is not set. Create a key in the Archer app (sign in → Connect an agent → Create API key) and run:\n  ARCHER_API_KEY=<key> pnpm --filter @archer/mcp exec tsx scripts/smoke.ts",
  );
  process.exit(2);
}

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
check("26 tools registered", names.length === 26, names);

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

// workspace / api key
const info = await call("get_workspace_info");
check("api key resolves to a workspace + backend reachable", info.json?.api_key_valid === true && typeof info.json?.workspace_id === "string" && info.json?.backend_reachable === true, info.json);
check("get_workspace_info shows the key prefix", info.json?.api_key_prefix === API_KEY.slice(0, 14), info.json?.api_key_prefix);

// a bogus key must be rejected and must not touch the persisted key file
const KEY_FILE = join(homedir(), ".archer", "key");
const keyFileBefore = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8") : null;
const bogus = await call("set_api_key", { api_key: "archer_not_a_real_key" });
const keyFileAfter = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8") : null;
check("set_api_key rejects a bogus key", bogus.isError && bogus.text.includes("not valid"), bogus.text);
check("bogus set_api_key leaves ~/.archer/key untouched", keyFileBefore === keyFileAfter);
const infoAfter = await call("get_workspace_info");
check("workspace unchanged after bogus key", infoAfter.json?.workspace_id === info.json?.workspace_id);

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
  source: 'arch "Smoke Test" v0.1\n\ncomponent api "API" @vercel.functions {\n  src "apps/api"\n}\ncomponent db "DB" @postgres\ncomponent cache "Cache" @redis\n\napi -> db @sql\napi -> cache\n',
  summary: "Added a cache",
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

// history & attribution
const history = await call("get_history", { project_id: pid });
check("get_history lists revisions", Array.isArray(history.json) && history.json.length >= 2, history.text);
const cacheRev = (history.json as { summary?: string; author: { kind: string; name?: string }; changes: { added: number } }[]).find((r) => r.summary === "Added a cache");
check("agent-attributed revision with summary + changes", cacheRev?.author.kind === "agent" && !!cacheRev.author.name && cacheRev.changes.added >= 1, cacheRev);
const rev = await call("get_revision", { revision_id: (history.json as { revision_id: string }[])[0].revision_id });
check("get_revision returns source", typeof rev.json?.source === "string" && rev.json.source.startsWith("arch "));
const diff = await call("diff_project", { project_id: pid });
check("diff_project default has summary + diff", diff.json?.summary != null && Array.isArray(diff.json?.diff?.components), diff.text);
const diffSpan = await call("diff_project", {
  project_id: pid,
  from_revision_id: (history.json as { revision_id: string }[]).at(-1)!.revision_id,
});
check("diff_project from oldest sees cache added", diffSpan.json?.diff.components.some((c: { path: string; kind: string }) => c.path === "cache" && c.kind === "added"), diffSpan.text);
check("get_project has src line", (got3.json.source as string).includes('src "apps/api"'));

// questions round trip
const badAsk = await call("ask_question", { project_id: pid, path: "nope", text: "?" });
check("ask_question rejects unknown path", badAsk.isError);
const asked = await call("ask_question", { project_id: pid, path: "db", text: "Which Postgres version?" });
check("ask_question creates thread", !asked.isError && typeof asked.json?.question_id === "string", asked.text);
const qid = asked.json.question_id as string;
const gotQ = await call("get_project", { project_id: pid });
check("get_project shows open question", gotQ.json?.open_questions.some((q: { question_id: string }) => q.question_id === qid), gotQ.json?.open_questions);
const answered = await call("answer_question", { question_id: qid, text: "16" });
check("answer_question", !answered.isError);
const listedQ = await call("list_questions", { project_id: pid });
check("list_questions has 2 messages", listedQ.json?.find((q: { question_id: string }) => q.question_id === qid)?.messages.length === 2, listedQ.text);
const resolved = await call("resolve_question", { question_id: qid });
check("resolve_question", !resolved.isError && resolved.json?.status === "resolved");
const openAfter = await call("list_questions", { project_id: pid });
check("resolved thread not in open list", !openAfter.json?.some((q: { question_id: string }) => q.question_id === qid));

// drift
const badDrift = await call("report_drift", { project_id: pid, findings: [{ status: "missing", path: "ghost" }] });
check("report_drift rejects unknown path", badDrift.isError);
const drifted = await call("report_drift", {
  project_id: pid,
  findings: [
    { status: "missing", path: "cache", note: "No cache client in the repo" },
    { status: "extra", name: "Email worker", src: "apps/worker/email" },
  ],
});
check("report_drift accepted", !drifted.isError && drifted.json?.missing === 1 && drifted.json?.extra === 1, drifted.text);
const driftGot = await call("get_drift", { project_id: pid });
check("get_drift returns findings", driftGot.json?.report?.findings.length === 2, driftGot.text);
const gotD = await call("get_project", { project_id: pid });
check("get_project shows drift count", gotD.json?.drift?.findings_count === 2, gotD.json?.drift);
const synced = await call("report_drift", { project_id: pid, findings: [] });
check("empty report = in sync", synced.json?.in_sync === true);

// cleanup: delete custom type + project
const delType = await call("delete_custom_type", { tag: "custom.smoke_engine" });
check("delete_custom_type", !delType.isError);
const delProj = await call("delete_project", { project_id: pid, confirm: true });
check("delete_project", !delProj.isError && delProj.json?.deleted === pid);
const listedAfter = await call("list_projects");
check("project gone after delete", !listedAfter.json?.some((p: { id: string }) => p.id === pid));

// restore the key file exactly as we found it (belt and braces)
if (keyFileBefore === null) {
  if (existsSync(KEY_FILE)) unlinkSync(KEY_FILE);
} else {
  writeFileSync(KEY_FILE, keyFileBefore, { encoding: "utf8", mode: 0o600 });
}

await client.close();
console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
