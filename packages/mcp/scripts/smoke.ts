/**
 * End-to-end smoke test: exercises every tool group, in-process, against a
 * real Convex deployment — as a signed-in user, exactly the way the hosted
 * /mcp route runs them. Creates and deletes its own projects, custom type and
 * team workspace. The GitHub and image tools need the web app's host
 * (src/host.ts), so here they only report that they aren't available.
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
check("54 tools registered", names.length === 54, names);

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
const bad = await call("validate_source", { source: 'arch "T" v0.1\ncomponent a\na -> ghost' });
check("validate: E101 reported", bad.json?.valid === false && bad.json.errors[0].includes("E101"), bad.json);
const fmt = await call("format_source", { source: 'arch "T" v0.1\ncomponent a "A" @postgres' });
check("format: canonical", fmt.text.trim().endsWith('component a "A" @postgres'));
const laid = await call("auto_layout_source", { source: 'arch "T" v0.1\ncomponent a\ncomponent b\na -> b' });
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

// drift: dismiss one finding, then clear the report
await call("report_drift", {
  project_id: pid,
  findings: [
    { status: "missing", path: "cache" },
    { status: "extra", name: "Email worker" },
  ],
});
const dismissed = await call("dismiss_drift_finding", { project_id: pid, index: 1 });
check("dismiss_drift_finding drops one", dismissed.json?.remaining === 1 && dismissed.json?.dismissed?.name === "Email worker", dismissed.text);
const cleared = await call("clear_drift", { project_id: pid });
check("clear_drift removes the report", !cleared.isError && (await call("get_drift", { project_id: pid })).json?.report === null, cleared.text);

// projects: rename, duplicate, move, partial re-layout, restore
const renamed = await call("rename_project", { project_id: pid, title: "Smoke Test Renamed" });
check("rename_project saves", renamed.json?.saved === true && renamed.json?.previous_title === "Smoke Test", renamed.text);
const gotRenamed = await call("get_project", { project_id: pid });
check("rename_project rewrote the header", (gotRenamed.json?.source as string).startsWith('arch "Smoke Test Renamed" v0.1'), gotRenamed.text?.slice(0, 120));
const dup = await call("duplicate_project", { project_id: pid });
check("duplicate_project makes a copy", typeof dup.json?.id === "string" && dup.json?.title === "Smoke Test Renamed copy", dup.text);
const moved = await call("move_components", { project_id: pid, moves: [{ path: "db", at: [30, 0] }] });
check("move_components places db", moved.json?.placed?.[0]?.at?.[0] === 30, moved.text);
const relaid = await call("auto_layout_project", { project_id: pid, paths: ["db"] });
check("auto_layout_project with paths", !relaid.isError && relaid.json?.paths?.[0] === "db", relaid.text);
const allRevisions = await call("get_history", { project_id: pid, limit: 200 });
const oldest = (allRevisions.json as { revision_id: string }[]).at(-1)!.revision_id;
const restored = await call("restore_revision", { project_id: pid, revision_id: oldest });
check("restore_revision saves the old version", restored.json?.saved === true && restored.json?.restored_from === oldest, restored.text);
const gotRestored = await call("get_project", { project_id: pid });
check("restored source has no cache", !(gotRestored.json?.source as string).includes("cache"), gotRestored.text?.slice(0, 200));

// review
const unreviewed = await call("diff_project", { project_id: pid, compare: "since_review" });
check("diff_project since_review", !unreviewed.isError && typeof unreviewed.json?.from === "string", unreviewed.text);
const marked = await call("mark_reviewed", { project_id: pid });
check("mark_reviewed counts agent revisions", (marked.json?.marked_reviewed ?? 0) >= 1, marked.text);
const reviewedHistory = await call("get_history", { project_id: pid, limit: 200 });
check("history all reviewed after mark_reviewed", (reviewedHistory.json as { reviewed: boolean }[]).every((r) => r.reviewed), reviewedHistory.text?.slice(0, 300));

// sharing
const shared = await call("share_project", { project_id: pid, enabled: true });
check("share_project turns the link on", shared.json?.shared === true && String(shared.json?.url).includes("/share/"), shared.text);
const viaLink = await call("get_shared_project", { link: shared.json?.url });
check("get_shared_project reads it", viaLink.json?.project_id === pid, viaLink.text?.slice(0, 200));
check("get_project shows share_url", (await call("get_project", { project_id: pid })).json?.share_url === shared.json?.url);
const unshared = await call("share_project", { project_id: pid, enabled: false });
check("share_project turns the link off", unshared.json?.shared === false, unshared.text);
check("link dead after unsharing", (await call("get_shared_project", { link: shared.json?.url })).isError);

// samples
const samples = await call("list_samples");
check("list_samples lists the gallery", Array.isArray(samples.json) && samples.json.length > 0, samples.text);
const sample = await call("get_sample", { slug: samples.json?.[0]?.slug });
check("get_sample returns its source", typeof sample.json?.source === "string" && sample.json.source.startsWith("arch "), sample.text);

// host-backed tools without a host
const image = await call("render_diagram", { project_id: pid });
check("render_diagram needs the web app", image.isError && image.text.includes("isn't available"), image.text);
const gh = await call("list_github_repos", {});
check("GitHub tools need the web app", gh.isError && gh.text.includes("isn't available"), gh.text);

// a team workspace, start to finish
const team = await call("create_workspace", { name: "Smoke Team" });
check("create_workspace", typeof team.json?.workspace_id === "string" && team.json?.role === "owner", team.text);
const tid = team.json?.workspace_id as string;
const members = await call("list_members", { workspace_id: tid });
check("list_members: the user as owner", members.json?.members?.length === 1 && members.json.members[0].you === true && members.json.members[0].role === "owner", members.text);
const invited = await call("invite_member", { workspace_id: tid, email: "smoke-invitee@example.com", role: "viewer" });
check("invite_member: pending viewer", invited.json?.pending === true && invited.json?.role === "viewer", invited.text);
const promoted = await call("set_member_role", { workspace_id: tid, member_id: invited.json?.member_id, role: "editor" });
check("set_member_role", promoted.json?.role === "editor" && promoted.json?.previous_role === "viewer", promoted.text);
const lastOwner = await call("set_member_role", { workspace_id: tid, member_id: members.json?.members?.[0]?.member_id, role: "editor" });
check("the last owner can't be demoted", lastOwner.isError && lastOwner.text.includes("owner"), lastOwner.text);
const removed = await call("remove_member", { workspace_id: tid, member_id: invited.json?.member_id, confirm: true });
check("remove_member", !removed.isError, removed.text);
const renamedTeam = await call("rename_workspace", { workspace_id: tid, name: "Smoke Team Renamed" });
check("rename_workspace", renamedTeam.json?.name === "Smoke Team Renamed", renamedTeam.text);
const deletedTeam = await call("delete_workspace", { workspace_id: tid, confirm: true });
check("delete_workspace", !deletedTeam.isError && deletedTeam.json?.deleted === tid, deletedTeam.text);
check("team gone", !(await call("list_workspaces")).json?.workspaces?.some((w: { id: string }) => w.id === tid));

// cleanup: delete custom type + projects
if (typeof dup.json?.id === "string") await call("delete_project", { project_id: dup.json.id, confirm: true });
const delType = await call("delete_custom_type", { tag: "custom.smoke_engine" });
check("delete_custom_type", !delType.isError);
const delProj = await call("delete_project", { project_id: pid, confirm: true });
check("delete_project", !delProj.isError && delProj.json?.deleted === pid);
const listedAfter = await call("list_projects");
check("project gone after delete", !listedAfter.json?.some((p: { id: string }) => p.id === pid));

await client.close();
console.log(failures() === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures()} FAILURES`);
process.exit(failures() === 0 ? 0 : 1);
