import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getFunctionName } from "convex/server";
import { parse } from "@archer/lang";
import { fileSource, syncStatus, type StoredFile } from "../lib/repoSync";

/*
 * The repo sync engine (lib/server/repoSync.ts) end to end, against an
 * in-memory Convex (the repoSync/documents functions it calls, same rules) and
 * an in-memory GitHub behind `fetch`.
 */

// ------------------------------------------------------------- fake Convex

type Doc = {
  _id: string;
  workspaceId: string;
  title: string;
  source: string;
  updatedAt: number;
  repo: StoredFile & { linkedBy?: string; linkedAt: number };
};

const convex = vi.hoisted(() => {
  const state = {
    docs: new Map<string, Doc>(),
    revisions: [] as { documentId: string; author: { kind: string; name?: string }; summary?: string; commit?: unknown }[],
    clock: 1000,
  };
  const tick = () => ++state.clock;
  const userOf = (apiKey: string) => {
    const m = /^svc_test-secret-0123456789abcdefghijklmnop\.(user_\w+)$/.exec(apiKey);
    if (!m) throw new Error("Only the Archer server can do this.");
    return m[1]!;
  };
  const call = async (name: string, a: Record<string, any>): Promise<unknown> => {
    const doc = a.id ? state.docs.get(a.id) : undefined;
    switch (name) {
      case "documents:get":
        return doc ? { ...structuredClone(doc), role: "editor" } : null;
      case "library:list":
        return [];
      case "repoSync:create": {
        const id = `doc_${state.docs.size + 1}`;
        state.docs.set(id, {
          _id: id,
          workspaceId: a.workspaceId,
          title: a.title,
          source: a.source,
          updatedAt: tick(),
          repo: { ...a.file, linkedAt: 1, linkedBy: userOf(a.apiKey), ...(a.base ? { base: a.base } : {}) },
        });
        state.revisions.push({
          documentId: id,
          author: a.commit ? { kind: "git", name: a.commit.author } : { kind: "user" },
          ...(a.commit ? { summary: a.commit.message, commit: { sha: a.commit.sha, url: a.commit.url } } : {}),
        });
        return id;
      }
      case "repoSync:link":
        userOf(a.apiKey);
        doc!.repo = { ...a.file, linkedAt: 2, linkedBy: userOf(a.apiKey), ...(a.base ? { base: a.base } : {}) };
        return doc!.repo;
      case "repoSync:applyImport": {
        userOf(a.apiKey);
        if (doc!.updatedAt !== a.expectedUpdatedAt) return { applied: false };
        const { incoming: _i, problem: _p, pr, ...rest } = doc!.repo;
        doc!.repo = { ...rest, base: a.base, ...(pr && !a.clearPr ? { pr } : {}) };
        if (doc!.source === a.source && doc!.title === a.title) return { applied: true, changed: false };
        doc!.source = a.source;
        doc!.title = a.title;
        doc!.updatedAt = tick();
        state.revisions.push({ documentId: doc!._id, author: { kind: "git", name: a.commit.author }, summary: a.commit.message, commit: a.commit });
        return { applied: true, changed: true };
      }
      case "repoSync:setState": {
        userOf(a.apiKey);
        const repo: Record<string, unknown> = { ...doc!.repo };
        if (a.base) repo.base = a.base;
        for (const k of ["pr", "incoming", "problem"]) {
          if (a[k] === null) delete repo[k];
          else if (a[k] !== undefined) repo[k] = a[k];
        }
        doc!.repo = repo as unknown as Doc["repo"];
        return null;
      }
      case "repoSync:documentsForPush":
        if (a.serviceKey !== "svc_test-secret-0123456789abcdefghijklmnop") throw new Error("Not authorized.");
        return [...state.docs.values()]
          .filter((d) => `${d.repo.owner}/${d.repo.name}@${d.repo.branch}`.toLowerCase() === `${a.owner}/${a.name}@${a.branch}`.toLowerCase())
          .map((d) => ({ id: d._id, workspaceId: d.workspaceId, path: d.repo.path, linkedBy: d.repo.linkedBy, prNumber: d.repo.pr?.number ?? null }));
      default:
        throw new Error(`fake Convex: no ${name}`);
    }
  };
  return { state, call, tick };
});

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query(ref: never, args: Record<string, unknown>) {
      return convex.call(getFunctionName(ref), args);
    }
    mutation(ref: never, args: Record<string, unknown>) {
      return convex.call(getFunctionName(ref), args);
    }
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_me" }),
  clerkClient: async () => ({
    users: { getUserOauthAccessToken: async () => ({ data: [{ token: "tok_me" }] }) },
  }),
}));

process.env.ARCHER_SERVICE_SECRET = "test-secret-0123456789abcdefghijklmnop";
process.env.NEXT_PUBLIC_CONVEX_URL = "https://convex.test";
process.env.GITHUB_API_URL = "https://gh.test";

const { createFromRepo, handleWebhook, publishDocument, resolveConflict, syncDocument, linkFile } = await import(
  "../lib/server/repoSync"
);

// -------------------------------------------------------------- fake GitHub

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const blobSha = (content: string) => sha1(`blob ${Buffer.byteLength(content)}\0${content}`);

class FakeRepo {
  commits = new Map<string, { sha: string; parent: string | null; files: Map<string, string>; message: string; author: string }>();
  branches = new Map<string, string>();
  pulls: { number: number; head: string; base: string; state: "open" | "closed"; merged: boolean }[] = [];
  blobs = new Map<string, string>();
  trees = new Map<string, { base: string; entries: { path: string; sha: string | null }[] }>();
  pending = new Map<string, { tree: string; parent: string; message: string }>();
  private seq = 0;
  constructor(readonly isPrivate = false) {}

  commit(branch: string, changes: Record<string, string | null>, message: string, author: string): string {
    const parent = this.branches.get(branch) ?? null;
    const files = new Map(parent ? this.commits.get(parent)!.files : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) files.delete(path);
      else files.set(path, content);
    }
    const sha = sha1(`commit ${++this.seq} ${message}`);
    this.commits.set(sha, { sha, parent, files, message, author });
    this.branches.set(branch, sha);
    return sha;
  }
  at(ref: string) {
    return this.commits.get(this.branches.get(ref) ?? ref);
  }
  file(ref: string, path: string) {
    return this.at(ref)?.files.get(path);
  }
  merge(number: number) {
    const pr = this.pulls.find((p) => p.number === number)!;
    const head = this.at(pr.head)!;
    const changes: Record<string, string> = {};
    for (const [path, content] of head.files) if (this.file(pr.base, path) !== content) changes[path] = content;
    this.commit(pr.base, changes, `Merge pull request #${number}`, "sam");
    pr.state = "closed";
    pr.merged = true;
  }
}

let repo: FakeRepo;
const requests: string[] = [];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function github(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = init?.method ?? "GET";
  const authed = new Headers(init?.headers).has("authorization");
  requests.push(`${method} ${url.pathname}`);
  const m = /^\/repos\/acme\/shop(\/.*)?$/.exec(url.pathname);
  if (!m || (repo.isPrivate && !authed)) return json(404, { message: "Not Found" });
  const rest = m[1] ?? "";
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  let x: RegExpExecArray | null;
  if (rest === "") return json(200, { full_name: "acme/shop", name: "shop", owner: { login: "acme" }, private: repo.isPrivate, default_branch: "main", html_url: "" });
  if ((x = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
    const sha = repo.branches.get(x[1]!);
    return sha ? json(200, { object: { sha } }) : json(404, { message: "Not Found" });
  }
  if ((x = /^\/contents\/(.+)$/.exec(rest))) {
    const path = decodeURIComponent(x[1]!);
    if (method === "GET") {
      const content = repo.file(url.searchParams.get("ref") ?? "main", path);
      if (content === undefined) return json(404, { message: "Not Found" });
      return json(200, { type: "file", path, sha: blobSha(content), encoding: "base64", content: Buffer.from(content).toString("base64") });
    }
    const current = repo.file(body.branch, path);
    if (current !== undefined && body.sha !== blobSha(current)) return json(409, { message: `${path} does not match` });
    const content = Buffer.from(body.content, "base64").toString("utf8");
    const sha = repo.commit(body.branch, { [path]: content }, body.message, "sam");
    return json(200, { content: { sha: blobSha(content) }, commit: { sha, html_url: `https://gh.test/c/${sha}` } });
  }
  if (rest === "/commits") {
    const path = url.searchParams.get("path");
    for (let c = repo.at(url.searchParams.get("sha") ?? "main"); c; c = c.parent ? repo.commits.get(c.parent) : undefined) {
      const before = c.parent ? repo.commits.get(c.parent)!.files.get(path ?? "") : undefined;
      if (!path || c.files.get(path) !== before)
        return json(200, [{ sha: c.sha, html_url: `https://gh.test/c/${c.sha}`, commit: { message: c.message, author: { name: c.author, date: "2026-09-25T10:00:00Z" }, committer: { date: "2026-09-25T10:00:00Z" } }, author: { login: c.author, avatar_url: null } }]);
    }
    return json(200, []);
  }
  if ((x = /^\/git\/trees\/(.+)$/.exec(rest)))
    return json(200, { tree: [...repo.at(x[1]!)!.files.keys()].map((path) => ({ path, type: "blob" })), truncated: false });
  if (rest === "/git/refs") {
    repo.branches.set(body.ref.replace("refs/heads/", ""), body.sha);
    return json(201, { ref: body.ref, object: { sha: body.sha } });
  }
  if (rest === "/pulls" && method === "POST") {
    const pr = { number: repo.pulls.length + 1, head: body.head, base: body.base, state: "open" as const, merged: false };
    repo.pulls.push(pr);
    return json(201, { number: pr.number, html_url: `https://gh.test/pull/${pr.number}`, state: "open", merged: false, head: { ref: pr.head } });
  }
  if ((x = /^\/pulls\/(\d+)$/.exec(rest))) {
    const pr = repo.pulls.find((p) => p.number === Number(x![1]));
    return pr ? json(200, { number: pr.number, html_url: `https://gh.test/pull/${pr.number}`, state: pr.state, merged: pr.merged, head: { ref: pr.head } }) : json(404, {});
  }
  // Git data API: what a commit of several files goes through.
  if (rest === "/git/blobs" && method === "POST") {
    const content = Buffer.from(body.content, "base64").toString("utf8");
    repo.blobs.set(blobSha(content), content);
    return json(201, { sha: blobSha(content) });
  }
  if ((x = /^\/git\/commits\/(\w+)$/.exec(rest))) return json(200, { sha: x[1], tree: { sha: `tree-of-${x[1]}` } });
  if (rest === "/git/trees" && method === "POST") {
    const id = `tree-${repo.trees.size + 1}`;
    repo.trees.set(id, { base: body.base_tree.replace("tree-of-", ""), entries: body.tree });
    return json(201, { sha: id });
  }
  if (rest === "/git/commits" && method === "POST") {
    const id = `pending-${repo.pending.size + 1}`;
    repo.pending.set(id, { tree: body.tree, parent: body.parents[0], message: body.message });
    return json(201, { sha: id, html_url: `https://gh.test/c/${id}` });
  }
  if ((x = /^\/git\/refs\/heads\/(.+)$/.exec(rest)) && method === "PATCH") {
    const branch = x[1]!;
    const c = repo.pending.get(body.sha)!;
    if (repo.branches.get(branch) !== c.parent) return json(422, { message: "Update is not a fast forward" });
    const tree = repo.trees.get(c.tree)!;
    const changes: Record<string, string | null> = {};
    for (const e of tree.entries) changes[e.path] = e.sha === null ? null : repo.blobs.get(e.sha)!;
    const sha = repo.commit(branch, changes, c.message, "sam");
    return json(200, { object: { sha } });
  }
  if (rest === "/installation") return json(404, { message: "Not Found" });
  return json(404, { message: `fake GitHub: no ${method} ${rest}` });
}

// ------------------------------------------------------------------ fixtures

const FILE = `arch "Shop" v0.2

component web "Web" {
  desc "Storefront"
}

component api "API" {
  desc "Orders"
}

component db "DB" @postgres

api -> db @sql
web -> api @http
`;
const edit = (src: string, find: string, replace: string) => {
  expect(src).toContain(find);
  return src.replace(find, replace);
};
const WITH_CACHE = edit(FILE, 'component db "DB" @postgres', 'component db "DB" @postgres\n\ncomponent cache "Cache" @redis');

const ME = { userId: "user_me", token: "tok_me" };
const WS = "user_me";
const REF = { owner: "acme", name: "shop", branch: "main", path: "architecture.arch" };
const doc = (id: string) => convex.state.docs.get(id)!;
/** The user edits the document in the app (autosave). */
const userEdit = (id: string, find: string, replace: string) => {
  doc(id).source = edit(doc(id).source, find, replace);
  doc(id).updatedAt = convex.tick();
};
const push = (content: string, message = "Update", author = "claude") =>
  repo.commit("main", { "architecture.arch": content }, message, author);

beforeEach(() => {
  convex.state.docs.clear();
  convex.state.revisions.length = 0;
  requests.length = 0;
  repo = new FakeRepo();
  repo.commit("main", { "README.md": "# Shop\n", "architecture.arch": FILE }, "Describe the architecture", "sam");
  vi.stubGlobal("fetch", github);
});

async function imported() {
  const { id } = await createFromRepo(ME, WS, REF);
  return id;
}

// ---------------------------------------------------------------------- tests

describe("From GitHub", () => {
  it("imports the file: canonical architecture, laid out, credited to its commit", async () => {
    const { id, imported } = await createFromRepo(ME, WS, REF);
    expect(imported).toBe(true);
    expect(fileSource(doc(id).source)).toBe(FILE);
    expect(doc(id).source).toContain("layout {");
    expect(doc(id).repo.base).toMatchObject({ source: FILE, blob: blobSha(FILE), commit: repo.branches.get("main") });
    expect(convex.state.revisions[0]).toMatchObject({ author: { kind: "git", name: "sam" }, summary: "Describe the architecture" });
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
  });

  it("starts a blank document when the file doesn't exist yet", async () => {
    const { id, imported } = await createFromRepo(ME, WS, { ...REF, path: "docs/system.arch" });
    expect(imported).toBe(false);
    expect(parse(doc(id).source).doc.title).toBe("Shop");
    expect(doc(id).repo.base).toBeUndefined();
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "missing" });
  });

  it("refuses a file that doesn't validate, and a repository the user can't read", async () => {
    push(edit(FILE, "web -> api @http", "web -> search @http"));
    await expect(createFromRepo(ME, WS, REF)).rejects.toMatchObject({ code: "invalid" });
    repo = new FakeRepo(true);
    repo.commit("main", { "architecture.arch": FILE }, "x", "sam");
    await expect(createFromRepo({ userId: "user_me", token: null }, WS, REF)).rejects.toMatchObject({ code: "no_access" });
  });
});

describe("sync", () => {
  it("imports a push when there's no draft, keeping positions", async () => {
    const id = await imported();
    const before = parse(doc(id).source).doc.layout.find((e) => e.path.join(".") === "api");
    push(WITH_CACHE, "Add a cache");
    expect(await syncDocument(ME, WS, id)).toMatchObject({ status: "imported", author: "claude" });
    expect(fileSource(doc(id).source)).toBe(WITH_CACHE);
    expect(parse(doc(id).source).doc.layout.find((e) => e.path.join(".") === "api")?.at).toEqual(before?.at);
    expect(convex.state.revisions.at(-1)).toMatchObject({ author: { kind: "git", name: "claude" }, summary: "Add a cache" });
    expect(syncStatus(doc(id).repo, doc(id).source)).toEqual({ kind: "synced" });
  });

  it("only moves the base when other files change", async () => {
    const id = await imported();
    repo.commit("main", { "README.md": "# Shop!\n" }, "Docs", "sam");
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
    expect(doc(id).repo.base?.commit).toBe(repo.branches.get("main"));
  });

  it("merges a push that changed other things than the draft", async () => {
    const id = await imported();
    userEdit(id, 'desc "Storefront"', 'desc "Storefront and cart"');
    push(WITH_CACHE);
    expect(await syncDocument(ME, WS, id)).toMatchObject({ status: "merged" });
    const text = fileSource(doc(id).source);
    expect(text).toContain("Storefront and cart");
    expect(text).toContain('component cache "Cache"');
    const status = syncStatus(doc(id).repo, doc(id).source);
    expect(status.kind === "draft" && status.summary.changed).toBe(1);
  });

  it("records a conflict, then settles it for either side", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Mine"');
    push(edit(WITH_CACHE, 'desc "Orders"', 'desc "Theirs"'), "Rename orders");
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "conflict", conflicts: ["api: changed desc on both sides"] });
    expect(doc(id).source).toContain('"Mine"');
    expect(doc(id).repo.incoming).toMatchObject({ author: "claude", message: "Rename orders" });
    await expect(publishDocument(ME, WS, id, { mode: "commit" })).rejects.toMatchObject({ code: "conflict" });

    await resolveConflict(ME, WS, id, "draft");
    expect(doc(id).repo.incoming).toBeUndefined();
    expect(fileSource(doc(id).source)).toContain('"Mine"');
    expect(fileSource(doc(id).source)).toContain('component cache "Cache"'); // their other change stays
    expect(doc(id).repo.base?.blob).toBe(blobSha(edit(WITH_CACHE, 'desc "Orders"', 'desc "Theirs"')));
    expect(syncStatus(doc(id).repo, doc(id).source).kind).toBe("draft");
  });

  it("takes the repository's side on request", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Mine"');
    push(edit(FILE, 'desc "Orders"', 'desc "Theirs"'));
    await syncDocument(ME, WS, id);
    await resolveConflict(ME, WS, id, "repo");
    expect(fileSource(doc(id).source)).toContain('"Theirs"');
    expect(syncStatus(doc(id).repo, doc(id).source)).toEqual({ kind: "synced" });
  });

  it("keeps the last good version while the file has errors", async () => {
    const id = await imported();
    const good = doc(id).source;
    push(edit(FILE, "web -> api @http", "web -> search @http"), "WIP");
    const r = await syncDocument(ME, WS, id);
    expect(r).toMatchObject({ status: "problem" });
    expect(r.status === "problem" && r.message).toContain("E101");
    expect(doc(id).source).toBe(good);
    push(WITH_CACHE, "Fix it");
    expect(await syncDocument(ME, WS, id)).toMatchObject({ status: "imported" });
    expect(doc(id).repo.problem).toBeUndefined();
  });

  it("retries when the document is saved while a merge is in flight", async () => {
    const id = await imported();
    push(WITH_CACHE);
    // The user's autosave lands between the engine's read and its write.
    const realFetch = github;
    let raced = false;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (!raced && String(input).includes("/commits?")) {
        raced = true;
        userEdit(id, 'desc "Storefront"', 'desc "Storefront and cart"');
      }
      return realFetch(input, init);
    });
    expect(await syncDocument(ME, WS, id)).toMatchObject({ status: "merged" });
    const text = fileSource(doc(id).source);
    expect(text).toContain("Storefront and cart");
    expect(text).toContain('component cache "Cache"');
  });
});

describe("publish", () => {
  it("commits the draft's architecture (no layout), after which there's nothing to publish", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Orders and refunds"');
    const r = await publishDocument(ME, WS, id, { mode: "commit" });
    expect(r.mode).toBe("commit");
    expect(repo.file("main", "architecture.arch")).toBe(fileSource(doc(id).source));
    expect(repo.file("main", "architecture.arch")).not.toContain("layout");
    expect(repo.at("main")?.message).toBe("Update the description of api in architecture.arch");
    expect(syncStatus(doc(id).repo, doc(id).source)).toEqual({ kind: "synced" });
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
    await expect(publishDocument(ME, WS, id, { mode: "commit" })).rejects.toMatchObject({ code: "nothing" });
  });

  it("opens a pull request, adds to it while open, and adopts its merge", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Orders and refunds"');
    const first = await publishDocument(ME, WS, id, { mode: "pr", message: "Refunds" });
    expect(first).toMatchObject({ mode: "pr", number: 1, updated: false });
    expect(repo.file("main", "architecture.arch")).toBe(FILE);
    expect(doc(id).repo.pr?.number).toBe(1);

    userEdit(id, 'desc "Storefront"', 'desc "Storefront and cart"');
    expect(await publishDocument(ME, WS, id, { mode: "pr" })).toMatchObject({ number: 1, updated: true });
    expect(repo.file(repo.pulls[0]!.head, "architecture.arch")).toBe(fileSource(doc(id).source));

    repo.merge(1);
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "adopted" });
    expect(doc(id).repo.pr).toBeUndefined();
    expect(syncStatus(doc(id).repo, doc(id).source)).toEqual({ kind: "synced" });
  });

  it("refuses to publish over a file that moved since the last sync", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Orders and refunds"');
    push(WITH_CACHE);
    await expect(publishDocument(ME, WS, id, { mode: "commit" })).rejects.toMatchObject({ code: "stale" });
    await syncDocument(ME, WS, id);
    await publishDocument(ME, WS, id, { mode: "commit" });
    expect(repo.file("main", "architecture.arch")).toContain('component cache "Cache"');
    expect(repo.file("main", "architecture.arch")).toContain("Orders and refunds");
  });

  it("creates the file of a document moved to GitHub", async () => {
    const { id } = await createFromRepo(ME, WS, { ...REF, path: "docs/system.arch" });
    userEdit(id, 'arch "Shop" v0.2\n', 'arch "Shop" v0.2\n\ncomponent web "Web"\n');
    await publishDocument(ME, WS, id, { mode: "commit" });
    expect(repo.file("main", "docs/system.arch")).toBe('arch "Shop" v0.2\n\ncomponent web "Web"\n');
    // Moving onto a file that exists: the document becomes a draft that replaces it.
    const other = id;
    const { existed } = await linkFile(ME, WS, other, REF);
    expect(existed).toBe(true);
    expect(syncStatus(doc(other).repo, doc(other).source).kind).toBe("draft");
  });
});

describe("webhook", () => {
  const payload = (paths: string[]) => ({
    ref: "refs/heads/main",
    repository: { name: "shop", owner: { login: "acme" } },
    commits: [{ added: [], modified: paths, removed: [] }],
  });

  it("syncs documents whose file the push changed, as the user who linked them", async () => {
    const id = await imported();
    push(WITH_CACHE);
    expect(await handleWebhook("push", payload(["README.md"]))).toEqual({
      event: "push",
      documents: [{ id, status: "untouched" }],
    });
    expect(await handleWebhook("push", payload(["architecture.arch"]))).toEqual({
      event: "push",
      documents: [{ id, status: "imported" }],
    });
    expect(fileSource(doc(id).source)).toBe(WITH_CACHE);
    // Other branches and repositories aren't ours.
    expect((await handleWebhook("push", { ...payload(["architecture.arch"]), ref: "refs/heads/dev" })).documents).toEqual([]);
  });

  it("forgets a closed pull request", async () => {
    const id = await imported();
    userEdit(id, 'desc "Orders"', 'desc "Orders and refunds"');
    await publishDocument(ME, WS, id, { mode: "pr" });
    const closed = await handleWebhook("pull_request", {
      action: "closed",
      repository: { name: "shop", owner: { login: "acme" } },
      pull_request: { number: 1, merged: false, base: { ref: "main" } },
    });
    expect(closed.documents).toEqual([{ id, status: "pr_closed" }]);
    expect(doc(id).repo.pr).toBeUndefined();
  });
});

describe("guards", () => {
  it("lets publishing replace a file the last sync found broken", async () => {
    const id = await imported();
    push(edit(FILE, "web -> api @http", "web -> search @http"), "WIP");
    expect((await syncDocument(ME, WS, id)).status).toBe("problem");
    userEdit(id, 'desc "Orders"', 'desc "Orders and refunds"');
    await publishDocument(ME, WS, id, { mode: "commit" });
    expect(repo.file("main", "architecture.arch")).toBe(fileSource(doc(id).source));
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
    expect(doc(id).repo.problem).toBeUndefined();
  });

  it("refuses viewers before touching GitHub", async () => {
    const id = await imported();
    const get = convex.call;
    const asViewer = async (name: string, a: Record<string, unknown>) =>
      name === "documents:get" ? { ...((await get(name, a)) as object), role: "viewer" } : get(name, a);
    const spy = vi.spyOn(convex, "call").mockImplementation(asViewer);
    requests.length = 0;
    await expect(publishDocument(ME, WS, id, { mode: "pr" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(syncDocument(ME, WS, id)).rejects.toMatchObject({ code: "forbidden" });
    expect(requests).toEqual([]);
    spy.mockRestore();
  });
});

describe("a document kept in several files", () => {
  const ROOT = `arch "Shop" v0.2

component web "Web"

import "./services/billing/billing.arch" as billing

web -> billing.checkout
`;
  const BILLING = `arch "Billing" v0.2

component checkout "Checkout"

component ledger "Ledger"

checkout -> ledger
`;
  const BILLING_PATH = "services/billing/billing.arch";
  beforeEach(() => {
    repo.commit("main", { "architecture.arch": ROOT, [BILLING_PATH]: BILLING }, "Split billing out", "sam");
  });

  it("imports every file, put together, and knows each file's version", async () => {
    const id = await imported();
    const text = fileSource(doc(id).source);
    expect(text).toContain(`import "./services/billing/billing.arch" as billing "Billing" {`);
    expect(text).toContain("billing.checkout -> billing.ledger");
    expect(doc(id).repo.base?.blob).toBe(`architecture.arch=${blobSha(ROOT)};${BILLING_PATH}=${blobSha(BILLING)}`);
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
  });

  it("follows a push to a used file alone, credited to that commit", async () => {
    const id = await imported();
    repo.commit("main", { [BILLING_PATH]: BILLING.replace('component ledger "Ledger"', 'component ledger "Ledger"\n\ncomponent refunds "Refunds"') }, "Add refunds", "claude");
    expect(await handleWebhook("push", { ref: "refs/heads/main", after: "x", repository: { name: "shop", owner: { login: "acme" } }, commits: [{ modified: [BILLING_PATH] }] })).toMatchObject({
      documents: [{ id, status: "imported" }],
    });
    expect(fileSource(doc(id).source)).toContain('component refunds "Refunds"');
    expect(convex.state.revisions.at(-1)).toMatchObject({ author: { kind: "git", name: "claude" }, summary: "Add refunds" });
  });

  it("reports a broken used file by name and keeps the last good version", async () => {
    const id = await imported();
    repo.commit("main", { [BILLING_PATH]: BILLING.replace("checkout -> ledger", "checkout -> nowhere") }, "WIP", "claude");
    const r = await syncDocument(ME, WS, id);
    expect(r).toMatchObject({ status: "problem" });
    expect((r as { message: string }).message).toContain(`E101 in ${BILLING_PATH} on line 7`);
  });

  it("publishes an edit inside a used file to that file alone, in one commit", async () => {
    const id = await imported();
    userEdit(id, 'component ledger "Ledger"', 'component ledger "Ledger" {\n    desc "Double-entry"\n  }');
    const before = repo.at("main")!.sha;
    await publishDocument(ME, WS, id, { mode: "commit" });
    const after = repo.at("main")!;
    expect(after.parent).toBe(before);
    expect(after.files.get("architecture.arch")).toBe(ROOT);
    expect(after.files.get(BILLING_PATH)).toContain('desc "Double-entry"');
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
    expect(syncStatus(doc(id).repo, doc(id).source)).toEqual({ kind: "synced" });
  });

  it("opens a pull request that writes every file, and adds to it", async () => {
    const id = await imported();
    userEdit(id, 'component web "Web"', 'component web "Web" {\n  desc "Storefront"\n}');
    userEdit(id, 'component checkout "Checkout"', 'component checkout "Checkout" {\n    desc "Pay"\n  }');
    const pr = await publishDocument(ME, WS, id, { mode: "pr" });
    const branch = repo.pulls[0]!.head;
    expect(repo.file(branch, "architecture.arch")).toContain('desc "Storefront"');
    expect(repo.file(branch, BILLING_PATH)).toContain('desc "Pay"');
    expect(repo.file("main", BILLING_PATH)).toBe(BILLING);
    userEdit(id, 'desc "Pay"', 'desc "Pay now"');
    expect(await publishDocument(ME, WS, id, { mode: "pr" })).toMatchObject({ mode: "pr", number: (pr as { number: number }).number, updated: true });
    expect(repo.file(branch, BILLING_PATH)).toContain('desc "Pay now"');
  });

  it("deletes a file the document stops using, and creates one it starts using", async () => {
    const id = await imported();
    // In the editor: billing's inside moves back into the root, web's into a file of its own.
    doc(id).source = doc(id).source
      .replace(`import "./services/billing/billing.arch" as billing "Billing" {`, `component billing "Billing" {`)
      .replace(`component web "Web"`, `component web "Web" {\n  use "./web/web.arch"\n}`);
    doc(id).updatedAt = convex.tick();
    await publishDocument(ME, WS, id, { mode: "commit" });
    const main = repo.at("main")!;
    expect(main.files.has(BILLING_PATH)).toBe(false);
    expect(main.files.get("web/web.arch")).toBe(`arch "Web" v0.2\n`);
    expect(main.files.get("architecture.arch")).toContain(`component billing "Billing" {\n  component checkout "Checkout"`);
    expect(await syncDocument(ME, WS, id)).toEqual({ status: "unchanged" });
  });
});
