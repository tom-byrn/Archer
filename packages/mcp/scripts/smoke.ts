/**
 * End-to-end smoke test: exercises every tool group, in-process, against a
 * real Convex deployment — as a signed-in user, exactly the way the hosted
 * /mcp route runs them. Creates and deletes its own project and custom type.
 *
 * Usage:
 *   ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> SMOKE_USER_ID=user_… \
 *     pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
 * (the secret must be the one set on that deployment; use a dev deployment)
 */
import { checks, connectInProcess, requireEnv } from "./inProcess";

requireEnv(
  ["ARCHER_SERVICE_SECRET", "CONVEX_URL", "SMOKE_USER_ID"],
  "ARCHER_SERVICE_SECRET=… CONVEX_URL=… SMOKE_USER_ID=user_… tsx scripts/smoke.ts",
);
const USER_ID = process.env.SMOKE_USER_ID!.trim();

const { client, call } = await connectInProcess({ userId: USER_ID, agentName: "smoke" });
const { check, failures } = checks();

// tools/list
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
check("25 tools registered", names.length === 25, names);

// guide + resource
const guide = await call("get_guide");
check("guide has brief + spec + workflows", guide.text.includes("architecture-design tool") && guide.text.includes("## 2. File structure") && guide.text.includes("Standard workflows"));
const resources = await client.listResources();
check("guide resource listed", resources.resources.some((r) => r.uri === "archer://guide"));

// worked examples
const examples = await call("list_examples");
check("list_examples lists the docs examples", Array.isArray(examples.json) && examples.json.length > 0, examples.text);
const example = await call("get_example", { slug: examples.json?.[0]?.slug });
check("get_example returns its source", typeof example.json?.source === "string" && example.json.source.startsWith("arch "), example.text);
check("example resources listed", resources.resources.some((r) => r.uri.startsWith("archer://examples/")));

// stateless language tools
const bad = await call("validate_source", { source: 'arch "T" v0.2\ncomponent a\na -> ghost' });
check("validate: E101 reported", bad.json?.valid === false && bad.json.errors[0].includes("E101"), bad.json);
const fmt = await call("format_source", { source: 'arch "T" v0.2\ncomponent a "A" @postgres' });
check("format: canonical", fmt.text.trim().endsWith('component a "A" @postgres'));
const laid = await call("auto_layout_source", { source: 'arch "T" v0.2\ncomponent a\ncomponent b\na -> b' });
check("auto_layout_source adds layout", laid.text.includes("layout {"));

// catalog
const types = await call("list_types", { search: "postgres" });
check("list_types finds postgres", types.json?.catalog.some((t: { tag: string }) => t.tag === "postgres"), types.json);

// workspace
const info = await call("get_workspace_info");
check("acting as the user, backend reachable", info.json?.auth === "oauth" && info.json?.user_id === USER_ID && info.json?.backend_reachable === true, info.json);
check("writes will be attributed to this agent", info.json?.agent_name === "smoke", info.json?.agent_name);
const spaces = await call("list_workspaces");
check("list_workspaces marks the current one", spaces.json?.workspaces?.some((w: { current: boolean }) => w.current), spaces.text);

const rejected = await call("create_project", { source: 'arch "Smoke" v0.2\ncomponent a\na -> ghost' });
check("create rejects invalid source", rejected.isError && rejected.text.includes("E101"));

const created = await call("create_project", {
  source: 'arch "Smoke Test" v0.2\n\ncomponent api "API" @vercel.functions\ncomponent db "DB" @postgres {\n  schema json ```\n{"t": 1}\n```\n}\n\napi -> db @sql\n',
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
  source: 'arch "Smoke Test" v0.2\n\ncomponent api "API" @vercel.functions {\n  src "apps/api"\n}\ncomponent db "DB" @postgres\ncomponent cache "Cache" @redis\n\napi -> db @sql\napi -> cache\n',
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

// compile
const compiled = await call("compile_for_agent", { project_id: pid });
check("compile_for_agent: preamble and layout", compiled.text.includes("Archer architecture document") && compiled.text.includes("layout {"));

// history & attribution
const history = await call("get_history", { project_id: pid });
check("get_history lists revisions", Array.isArray(history.json) && history.json.length >= 2, history.text);
const cacheRev = (history.json as { summary?: string; author: { kind: string; name?: string }; changes: { added: number } }[]).find((r) => r.summary === "Added a cache");
check("agent-attributed revision with summary + changes", cacheRev?.author.kind === "agent" && cacheRev.author.name === "smoke" && cacheRev.changes.added >= 1, cacheRev);
const rev = await call("get_revision", { revision_id: (history.json as { revision_id: string }[])[0]!.revision_id });
check("get_revision returns source", typeof rev.json?.source === "string" && rev.json.source.startsWith("arch "));
const diff = await call("diff_project", { project_id: pid });
check("diff_project default has summary + diff", diff.json?.summary != null && Array.isArray(diff.json?.diff?.components), diff.text);
const diffSpan = await call("diff_project", {
  project_id: pid,
  from_revision_id: (history.json as { revision_id: string }[]).at(-1)!.revision_id,
});
check("diff_project from oldest sees cache added", diffSpan.json?.diff.components.some((c: { path: string; kind: string }) => c.path === "cache" && c.kind === "added"), diffSpan.text);
check("get_project has src line", (got3.json.source as string).includes('src "apps/api"'));

// repository link
const badRepo = await call("link_repository", { project_id: pid, repository: { full_name: "not a repo" } });
check("link_repository rejects malformed name", badRepo.isError);
const linked = await call("link_repository", { project_id: pid, repository: { full_name: "acme/platform", branch: "develop" } });
check("link_repository links", !linked.isError && linked.json?.repository?.full_name === "acme/platform" && linked.json?.repository?.branch === "develop", linked.text);
const gotR = await call("get_project", { project_id: pid });
check("get_project shows repository", gotR.json?.repository?.full_name === "acme/platform", gotR.text?.slice(0, 200));
const unlinked = await call("link_repository", { project_id: pid, repository: null });
check("link_repository unlinks", !unlinked.isError && unlinked.json?.unlinked === true);
const gotR2 = await call("get_project", { project_id: pid });
check("get_project repository null after unlink", gotR2.json?.repository === null);

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

await client.close();
console.log(failures() === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures()} FAILURES`);
process.exit(failures() === 0 ? 0 : 1);
