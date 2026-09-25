import { afterEach, describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { connectInProcess } from "../scripts/inProcess";
import { db } from "../src/backend";
import { EXAMPLE_STATE } from "../src/reference";
import { createFakeBackend } from "./fakeBackend";
import { FakeHostError, createFakeHost } from "./fakeHost";
import { seedExample } from "./seedExample";

// What the tools do beyond their documented examples (reference.test.ts):
// refusals, edge cases, and how they drive the host — against the example
// scenario, over the fake backend and fake GitHub.

process.env.ARCHER_SERVICE_SECRET ??= "test-service-secret";

const { user: USER, project: SHOP, storedProject: PAYMENTS, ownedTeam: PLATFORM, team: ACME } = EXAMPLE_STATE;

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup(opts: { withHost?: boolean; userId?: string } = {}) {
  const fake = createFakeBackend();
  const { host, github } = createFakeHost(fake, { email: EXAMPLE_STATE.email });
  seedExample(fake, github);
  Object.assign(db, fake.db);
  const mcp = await connectInProcess({
    userId: opts.userId ?? USER,
    agentName: "Claude Code",
    host: opts.withHost === false ? undefined : host,
  });
  close = () => mcp.client.close();
  return { fake, host, github, mcp, call: mcp.call };
}

const sourceOf = (fake: Awaited<ReturnType<typeof setup>>["fake"], id: string) => fake.state.projects.get(id)!.source;

describe("projects", () => {
  it("rename_project changes the header line and nothing else", async () => {
    const { fake, call } = await setup();
    const before = sourceOf(fake, SHOP.id);
    const r = await call("rename_project", { project_id: SHOP.id, title: 'The "Shop"' });
    expect(r.isError, r.text).toBe(false);
    const after = sourceOf(fake, SHOP.id);
    expect(parse(after).doc.title).toBe('The "Shop"');
    expect(after.split("\n").slice(1)).toEqual(before.split("\n").slice(1));
    expect(fake.state.revisions[0]!.summary).toBe('Renamed the project to "The "Shop""');
  });

  it("rename_project refuses a blank or multi-line title, and saves nothing for the same one", async () => {
    const { fake, call } = await setup();
    expect((await call("rename_project", { project_id: SHOP.id, title: "  " })).text).toContain("can't be empty");
    expect((await call("rename_project", { project_id: SHOP.id, title: "a\nb" })).text).toContain("one line");
    const revisions = fake.state.revisions.length;
    const same = await call("rename_project", { project_id: SHOP.id, title: "Shop" });
    expect(same.json).toMatchObject({ saved: false });
    expect(fake.state.revisions.length).toBe(revisions);
  });

  it("duplicate_project copies the source and arrangement under the new title", async () => {
    const { fake, call } = await setup();
    const r = await call("duplicate_project", { project_id: SHOP.id, title: "Shop v2" });
    const copy = sourceOf(fake, r.json.id);
    expect(parse(copy).doc.title).toBe("Shop v2");
    const arrangement = (source: string) => parse(source).doc.layout.map(({ path, at, size, display }) => ({ path, at, size, display }));
    expect(arrangement(copy)).toEqual(arrangement(sourceOf(fake, SHOP.id)));
    expect(fake.state.projects.get(r.json.id)).not.toHaveProperty("publicSlug");
    expect(fake.state.projects.get(r.json.id)).not.toHaveProperty("repo");
  });
});

describe("canvas", () => {
  it("move_components refuses unknown paths and empty moves, saving nothing", async () => {
    const { fake, call } = await setup();
    const before = sourceOf(fake, SHOP.id);
    const r = await call("move_components", {
      project_id: SHOP.id,
      moves: [{ path: "nope", at: [1, 1] }, { path: "web" }],
    });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("moves[0]: no component at 'nope'");
    expect(r.text).toContain("moves[1]: give 'at', 'size' or both");
    expect(sourceOf(fake, SHOP.id)).toBe(before);
  });

  it("move_components keeps a child inside its container, which grows to fit", async () => {
    const { fake, call } = await setup();
    const r = await call("move_components", {
      project_id: SHOP.id,
      moves: [{ path: "backend.db", at: [-5, 20], size: [6, 4] }],
    });
    expect(r.isError, r.text).toBe(false);
    const placed = r.json.placed[0];
    expect(placed.at[0]).toBeGreaterThanOrEqual(0);
    expect(placed.size).toEqual([6, 4]);
    const layout = parse(sourceOf(fake, SHOP.id)).doc.layout;
    const backend = layout.find((e) => e.path.join(".") === "backend")!;
    expect(backend.size![1]).toBeGreaterThanOrEqual(20 + 4);
  });

  it("auto_layout_project with paths moves only those components", async () => {
    const { fake, call } = await setup();
    await call("move_components", { project_id: SHOP.id, moves: [{ path: "stripe", at: [40, 40] }, { path: "web", at: [-10, 30] }] });
    const before = parse(sourceOf(fake, SHOP.id)).doc.layout;
    const r = await call("auto_layout_project", { project_id: SHOP.id, paths: ["backend"] });
    expect(r.json).toMatchObject({ paths: ["backend"], saved: true });
    const after = parse(sourceOf(fake, SHOP.id)).doc.layout;
    const at = (l: typeof before, p: string) => l.find((e) => e.path.join(".") === p)?.at;
    expect(at(after, "stripe")).toEqual(at(before, "stripe"));
    expect(at(after, "web")).toEqual(at(before, "web"));
  });

  it("auto_layout_project refuses paths with reset, and unknown paths", async () => {
    const { call } = await setup();
    expect((await call("auto_layout_project", { project_id: SHOP.id, paths: ["web"], reset: true })).text).toContain("not both");
    expect((await call("auto_layout_project", { project_id: SHOP.id, paths: ["ghost"] })).text).toContain("'ghost'");
  });
});

describe("history and review", () => {
  it("restore_revision brings back that version exactly, as a new revision", async () => {
    const { fake, call } = await setup();
    const old = fake.state.revisions.find((r) => r._id === SHOP.revisions[0]!.id)!;
    const r = await call("restore_revision", { project_id: SHOP.id, revision_id: old._id });
    expect(r.json).toMatchObject({ saved: true, restored_from: old._id });
    expect(sourceOf(fake, SHOP.id)).toBe(old.source);
    expect(fake.state.revisions[0]!.summary).toMatch(/^Restored the version from 2026-09-01T09:00:00/);
    const again = await call("restore_revision", { project_id: SHOP.id, revision_id: old._id });
    expect(again.json).toMatchObject({ saved: false });
  });

  it("restore_revision refuses another project's revision", async () => {
    const { call } = await setup();
    const r = await call("restore_revision", { project_id: SHOP.id, revision_id: PAYMENTS.revisions[0]!.id });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("in this project");
  });

  it("diff_project since_review shows what the user hasn't reviewed, until mark_reviewed", async () => {
    const { call } = await setup();
    const before = await call("diff_project", { project_id: PAYMENTS.id, compare: "since_review" });
    expect(before.json.from).toBe(PAYMENTS.revisions[0]!.id);
    expect(before.json.diff.components).toEqual([{ path: "fraud", kind: "added" }]);
    const history = await call("get_history", { project_id: PAYMENTS.id });
    expect(history.json.map((h: { reviewed: boolean }) => h.reviewed)).toEqual([false, true]);
    expect(history.json[1].commit.sha).toBe(PAYMENTS.revisions[0]!.commit!.sha);

    expect((await call("mark_reviewed", { project_id: PAYMENTS.id })).json.marked_reviewed).toBe(1);
    const after = await call("diff_project", { project_id: PAYMENTS.id, compare: "since_review" });
    expect(after.json.description).toBe("no architectural changes");
    const reviewed = await call("get_history", { project_id: PAYMENTS.id });
    expect(reviewed.json.every((h: { reviewed: boolean }) => h.reviewed)).toBe(true);
  });

  it("diff_project unpublished compares the draft with the file; incoming needs a conflict", async () => {
    const { call } = await setup();
    const unpublished = await call("diff_project", { project_id: PAYMENTS.id, compare: "unpublished" });
    expect(unpublished.json).toMatchObject({ from: "repository", to: "current" });
    expect(unpublished.json.diff.components).toEqual([{ path: "fraud", kind: "added" }]);
    expect((await call("diff_project", { project_id: PAYMENTS.id, compare: "incoming" })).text).toContain("No conflicting version");
    expect((await call("diff_project", { project_id: SHOP.id, compare: "unpublished" })).text).toContain("isn't stored");
    expect(
      (await call("diff_project", { project_id: SHOP.id, compare: "since_review", from_revision_id: "x" })).text,
    ).toContain("not both");
  });

  it("diff_project incoming compares the draft with the repository's conflicting version", async () => {
    const { fake, call } = await setup();
    const file = fake.state.projects.get(PAYMENTS.id)!.repo!;
    file.incoming = {
      commit: "a".repeat(40),
      source: 'arch "Payments" v0.1\n\ncomponent api "Payments API" @service\n',
      conflicts: ["api: changed src on both sides"],
    };
    const r = await call("diff_project", { project_id: PAYMENTS.id, compare: "incoming" });
    expect(r.json).toMatchObject({ from: "current", to: "incoming" });
    expect(r.json.diff.components.map((c: { path: string; kind: string }) => `${c.kind} ${c.path}`).sort()).toEqual([
      "changed api",
      "removed fraud",
      "removed ledger",
    ]);
    const project = await call("get_project", { project_id: PAYMENTS.id });
    expect(project.json.repository.sync).toMatchObject({ conflict: true, conflicts: ["api: changed src on both sides"] });
  });
});

describe("sharing and images", () => {
  it("share_project turns the link on and off; get_shared_project follows it", async () => {
    const { call } = await setup();
    const off = await call("share_project", { project_id: SHOP.id, enabled: false });
    expect(off.json).toEqual({ id: SHOP.id, shared: false });
    expect((await call("get_project", { project_id: SHOP.id })).json.share_url).toBeNull();
    expect((await call("get_shared_project", { link: SHOP.shareSlug })).text).toContain("Nothing is shared");

    const on = await call("share_project", { project_id: SHOP.id, enabled: true });
    expect(on.json.url).toMatch(/\/share\/slug\d+$/);
    const slug = on.json.url.split("/").pop();
    for (const link of [on.json.url, slug, `https://archer.tombyrne.dev/s/${slug}`]) {
      const shared = await call("get_shared_project", { link });
      expect(shared.isError, link).toBe(false);
      expect(shared.json.title).toBe("Shop");
    }
    expect((await call("get_shared_project", { link: "not a link" })).text).toContain("isn't a share link");
  });

  it("render_diagram passes the workspace's custom types and theme to the host", async () => {
    const { host, call } = await setup();
    let seen: unknown;
    host.renderSvg = (_source, opts) => {
      seen = opts;
      return "<svg/>";
    };
    expect((await call("render_diagram", { source: 'arch "X" v0.1\n' })).text).toBe("<svg/>");
    expect(seen).toEqual({ theme: "light", customTypes: EXAMPLE_STATE.customTypes });
  });

  it("render_diagram refuses syntax errors, and says when the server can't draw", async () => {
    const { call } = await setup();
    const broken = await call("render_diagram", { source: 'arch "X" v0.1\ncomponent {' });
    expect(broken.isError).toBe(true);
    expect(broken.json.errors[0]).toMatch(/^E001/);
    const { call: bare } = await setup({ withHost: false });
    const r = await bare("render_diagram", { project_id: SHOP.id });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("isn't available on this server");
  });
});

describe("drift", () => {
  it("dismiss_drift_finding checks the index; clear_drift removes the report", async () => {
    const { call } = await setup();
    expect((await call("dismiss_drift_finding", { project_id: SHOP.id, index: 2 })).text).toContain("index must be below 2");
    const r = await call("dismiss_drift_finding", { project_id: SHOP.id, index: 0 });
    expect(r.json).toMatchObject({ dismissed: { path: "backend.db" }, remaining: 1 });
    expect((await call("get_drift", { project_id: SHOP.id })).json.report.findings).toHaveLength(1);
    await call("clear_drift", { project_id: SHOP.id });
    expect((await call("get_drift", { project_id: SHOP.id })).json).toEqual({ report: null });
    expect((await call("dismiss_drift_finding", { project_id: SHOP.id, index: 0 })).text).toContain("no drift report");
  });
});

describe("stored in GitHub", () => {
  it("publish_to_github syncs first when the file moved, then publishes", async () => {
    const { host, call } = await setup();
    const calls: string[] = [];
    const publish = host.github.publish;
    let stale = true;
    host.github.publish = async (...args) => {
      calls.push("publish");
      if (stale) {
        stale = false;
        throw new FakeHostError("architecture.arch changed on main since the last sync.", "stale");
      }
      return publish(...args);
    };
    host.github.sync = async () => {
      calls.push("sync");
      return { status: "merged", commit: "b".repeat(40), author: "danakim" };
    };
    const r = await call("publish_to_github", { project_id: PAYMENTS.id });
    expect(r.isError, r.text).toBe(false);
    expect(calls).toEqual(["publish", "sync", "publish"]);
    expect(r.json).toMatchObject({ mode: "pr", number: 42 });
    expect(r.json.synced_first).toContain("Merged danakim's changes");
  });

  it("publish_to_github publishes nothing when catching up finds a conflict", async () => {
    const { host, call } = await setup();
    let publishes = 0;
    host.github.publish = async () => {
      publishes++;
      throw new FakeHostError("changed since the last sync", "stale");
    };
    host.github.sync = async () => ({ status: "conflict", conflicts: ["api: changed desc on both sides"] });
    const r = await call("publish_to_github", { project_id: PAYMENTS.id, mode: "commit" });
    expect(r.isError).toBe(true);
    expect(r.json.conflicts).toEqual(["api: changed desc on both sides"]);
    expect(publishes).toBe(1);
  });

  it("publish_to_github passes other failures through, and needs a stored project", async () => {
    const { host, call } = await setup();
    host.github.publish = async () => {
      throw new FakeHostError("Nothing to publish: architecture.arch already has this architecture.", "nothing");
    };
    expect((await call("publish_to_github", { project_id: PAYMENTS.id })).text).toContain("Nothing to publish");
    expect((await call("publish_to_github", { project_id: SHOP.id })).text).toContain("move_to_github stores it");
  });

  it("import_from_github reports a file's errors with its diagnostics", async () => {
    const { github, call } = await setup();
    github.repos.get("acme/shop")!.branches.get("main")!.set("docs/broken.arch", 'arch "Broken" v0.1\na -> b\n');
    const r = await call("import_from_github", { repository: "https://github.com/acme/shop", path: "/docs/broken.arch" });
    expect(r.isError).toBe(true);
    expect(r.json.message).toContain("docs/broken.arch has errors");
    expect(r.json.errors[0]).toMatch(/^E101/);
  });

  it("import_from_github starts a blank project for a file that doesn't exist yet", async () => {
    const { call } = await setup();
    const r = await call("import_from_github", { repository: "acme/payments", branch: "main", path: "docs/new.arch" });
    expect(r.json).toMatchObject({ imported: false, repository: { full_name: "acme/payments", path: "docs/new.arch" } });
    expect(r.json.note).toContain("publish_to_github creates the file");
    expect((await call("import_from_github", { repository: "acme/payments", path: "docs/new.txt" })).text).toContain("ending in .arch");
  });

  it("move_to_github defaults to the linked repository and refuses a stored project", async () => {
    const { fake, call } = await setup();
    const r = await call("move_to_github", { project_id: SHOP.id, path: "docs/shop.arch" });
    expect(r.json.repository).toEqual({ full_name: "acme/shop", branch: "main", path: "docs/shop.arch" });
    expect(fake.state.projects.get(SHOP.id)!.repo!.path).toBe("docs/shop.arch");
    const again = await call("move_to_github", { project_id: PAYMENTS.id, path: "x.arch" });
    expect(again.text).toContain("already stored in architecture.arch");
  });

  it("sync_with_github refuses resolve without a conflict, and resolves one", async () => {
    const { fake, host, call } = await setup();
    expect((await call("sync_with_github", { project_id: PAYMENTS.id, resolve: "draft" })).text).toContain("no conflict");
    fake.state.projects.get(PAYMENTS.id)!.repo!.incoming = { commit: "c".repeat(40), conflicts: ["api: changed desc on both sides"] };
    let resolved: string | undefined;
    const sync = host.github.sync;
    host.github.sync = async (userId, workspaceId, documentId, resolve) => {
      resolved = resolve;
      return sync(userId, workspaceId, documentId, resolve);
    };
    const r = await call("sync_with_github", { project_id: PAYMENTS.id, resolve: "repo" });
    expect(resolved).toBe("repo");
    expect(r.json.message).toMatch(/^Resolved the conflict keeping the repository's side\./);
    expect(r.json.sync.conflict).toBe(false);
  });

  it("stop_syncing keeps the repository linked", async () => {
    const { fake, call } = await setup();
    await call("stop_syncing", { project_id: PAYMENTS.id });
    const repo = fake.state.projects.get(PAYMENTS.id)!.repo!;
    expect(repo).toMatchObject({ owner: "acme", name: "payments", branch: "main" });
    expect(repo.path).toBeUndefined();
    expect((await call("stop_syncing", { project_id: PAYMENTS.id })).text).toContain("stored in Archer");
  });

  it("list_arch_files uses the default branch and names a missing one", async () => {
    const { call } = await setup();
    const r = await call("list_arch_files", { repository: "acme/shop" });
    expect(r.json).toMatchObject({ branch: "main", branches: ["main", "feature/returns"], files: [{ path: "docs/checkout.arch", project_id: null }] });
    expect((await call("list_arch_files", { repository: "acme/shop", branch: "dev" })).text).toContain('no branch "dev"');
    expect((await call("list_arch_files", { repository: "nope" })).text).toContain("owner/name");
  });

  it("list_github_repos says when private repositories are hidden", async () => {
    const { github, call } = await setup();
    github.privateAccess = false;
    const r = await call("list_github_repos", {});
    expect(r.json.private_access).toBe(false);
    expect(r.json.note).toContain("repo scope");
  });

  it("list_github_commits needs a linked repository and a real timestamp", async () => {
    const { fake, call } = await setup();
    expect((await call("list_github_commits", { project_id: SHOP.id, since: "yesterday" })).text).toContain("ISO timestamp");
    delete fake.state.projects.get(SHOP.id)!.repo;
    expect((await call("list_github_commits", { project_id: SHOP.id })).text).toContain("link_repository");
  });

  it("answers that GitHub isn't available without a host", async () => {
    const { call } = await setup({ withHost: false });
    const r = await call("sync_with_github", { project_id: PAYMENTS.id });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("GitHub isn't available on this server");
  });
});

describe("workspaces and members", () => {
  it("refuses to manage the Personal workspace", async () => {
    const { call } = await setup();
    for (const [tool, args] of [
      ["rename_workspace", { name: "Mine" }],
      ["list_members", {}],
      ["delete_workspace", { confirm: true }],
    ] as const) {
      const r = await call(tool, { workspace_id: USER, ...args });
      expect(r.isError, tool).toBe(true);
      expect(r.text, tool).toContain("Personal workspace");
    }
  });

  it("says plainly when the user isn't an owner", async () => {
    const { call } = await setup();
    const r = await call("invite_member", { workspace_id: ACME.id, email: "x@acme.dev" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Only owners can invite people; the user is an editor in Acme.");
  });

  it("invite_member defaults to editor, and re-inviting changes the role", async () => {
    const { call } = await setup();
    const first = await call("invite_member", { workspace_id: PLATFORM.id, email: " Lee@Acme.dev " });
    expect(first.json).toMatchObject({ email: "lee@acme.dev", role: "editor", pending: true });
    const again = await call("invite_member", { workspace_id: PLATFORM.id, email: "lee@acme.dev", role: "viewer" });
    expect(again.json.member_id).toBe(first.json.member_id);
    expect(again.json.note).toBe("lee@acme.dev was already invited: their role is now viewer.");
  });

  it("keeps a signed-in owner: the only one can't be demoted, removed or leave", async () => {
    const { call } = await setup();
    const you = PLATFORM.members[0]!.id;
    const demote = await call("set_member_role", { workspace_id: PLATFORM.id, member_id: you, role: "editor" });
    expect(demote.text).toContain("at least one other signed-in owner");
    expect((await call("leave_workspace", { workspace_id: PLATFORM.id, confirm: true })).text).toContain("other signed-in owner");
    // A pending invitation doesn't count as an owner.
    await call("set_member_role", { workspace_id: PLATFORM.id, member_id: PLATFORM.members[2]!.id, role: "owner" });
    expect((await call("remove_member", { workspace_id: PLATFORM.id, member_id: you, confirm: true })).text).toContain("other signed-in owner");
    await call("set_member_role", { workspace_id: PLATFORM.id, member_id: PLATFORM.members[1]!.id, role: "owner" });
    expect((await call("leave_workspace", { workspace_id: PLATFORM.id, confirm: true })).isError).toBe(false);
  });

  it("set_member_role and remove_member only touch members of that workspace", async () => {
    const { call } = await setup();
    const r = await call("remove_member", { workspace_id: PLATFORM.id, member_id: "member_acme", confirm: true });
    expect(r.text).toContain("No member 'member_acme' in this workspace");
  });

  it("create_workspace makes the user its owner, with their email, without switching to it", async () => {
    const { fake, call } = await setup();
    const r = await call("create_workspace", { name: "  Data  " });
    expect(r.json).toMatchObject({ name: "Data", role: "owner", current: false });
    const team = fake.state.teams.find((t) => t.id === r.json.workspace_id)!;
    expect(team.members).toMatchObject([{ userId: USER, email: EXAMPLE_STATE.email, role: "owner" }]);
    expect((await call("get_workspace_info")).json.workspace_id).toBe(USER);
  });

  it("list_workspaces accepts invitations addressed to the user, as signing in does", async () => {
    const { fake, call } = await setup();
    fake.state.teams.push({
      id: "team_invited",
      name: "Research",
      members: [
        { id: "m1", userId: "user_other", email: "other@acme.dev", role: "owner", createdAt: 1 },
        { id: "m2", email: EXAMPLE_STATE.email, role: "viewer", createdAt: 2 },
      ],
    });
    const r = await call("list_workspaces");
    expect(r.json.workspaces).toContainEqual({ id: "team_invited", name: "Research", kind: "team", role: "viewer", current: false });
  });

  it("deleting the current workspace puts the agents back on Personal", async () => {
    const { call } = await setup();
    await call("use_workspace", { workspace_id: PLATFORM.id });
    const r = await call("delete_workspace", { workspace_id: PLATFORM.id, confirm: true });
    expect(r.json.note).toContain("Personal workspace");
    expect((await call("get_workspace_info")).json.workspace_id).toBe(USER);
  });

  it("a viewer can read but not change a workspace's projects", async () => {
    const { fake, call } = await setup();
    fake.state.teams.find((t) => t.id === ACME.id)!.members[0]!.role = "viewer";
    fake.state.projects.set("proj_acme", { _id: "proj_acme", workspaceId: ACME.id, title: "Acme", source: 'arch "Acme" v0.1\n', updatedAt: 1 });
    await call("use_workspace", { workspace_id: ACME.id });
    expect((await call("get_project", { project_id: "proj_acme" })).isError).toBe(false);
    for (const [tool, args] of [
      ["share_project", { enabled: true }],
      ["rename_project", { title: "Mine" }],
      ["mark_reviewed", {}],
      ["clear_drift", {}],
    ] as const) {
      const r = await call(tool, { project_id: "proj_acme", ...args });
      expect(r.text, tool).toContain("This needs editor access; you are a viewer.");
    }
  });
});
