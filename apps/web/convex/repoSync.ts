import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { requireServer, requireServiceUser, requireWorkspace } from "./access";
import { recordRevision } from "./documents";
import { fileVersion, repoLink } from "./schema";

/**
 * Documents stored in a repository file (docs/repo-sync.md). The server-side
 * sync engine (apps/web/lib/server/repoSync.ts) reads GitHub and calls these
 * as a user with editor access, holding the service credential: linking a
 * file and importing from it are server-only, because the server first checks
 * that the user can read the repository (otherwise a push webhook, reading as
 * the Archer GitHub App, could import a private file into a workspace whose
 * members can't see it). `unlink` is open to the browser; `documentsForPush`
 * is for the webhook, before it knows which user to act as.
 */

type RepoLink = Infer<typeof repoLink>;

const fileRef = v.object({ owner: v.string(), name: v.string(), branch: v.string(), path: v.string() });
const baseVersion = v.object({ ...fileVersion, at: v.number() });
const commitInfo = v.object({
  sha: v.string(),
  url: v.string(),
  /** GitHub login, else the git author name. */
  author: v.string(),
  /** Subject line of the commit message. */
  message: v.optional(v.string()),
});
const prInfo = v.object({ number: v.number(), url: v.string(), branch: v.string(), openedAt: v.number() });
const incomingInfo = v.object({
  ...fileVersion,
  author: v.optional(v.string()),
  message: v.optional(v.string()),
  url: v.optional(v.string()),
  conflicts: v.array(v.string()),
  at: v.number(),
});
const problemInfo = v.object({ message: v.string(), commit: v.optional(v.string()), at: v.number() });

/** How a push webhook finds the documents stored on a branch. */
export const syncKeyOf = (r: { owner: string; name: string; branch: string }): string =>
  `${r.owner}/${r.name}@${r.branch}`.toLowerCase();

const NAME = /^[A-Za-z0-9_.-]+$/;

/** Validate a file reference: owner/name, a branch, and a repo-relative .arch path. */
export function checkFileRef(r: Infer<typeof fileRef>): Infer<typeof fileRef> {
  const owner = r.owner.trim();
  const name = r.name.trim().replace(/\.git$/, "");
  const branch = r.branch.trim();
  const path = r.path.trim().replace(/^\/+/, "");
  if (!NAME.test(owner) || !NAME.test(name)) throw new Error("Repository must be owner/name.");
  if (branch === "" || branch.length > 200 || /\s|\.\.|^-/.test(branch)) throw new Error("That branch name isn't valid.");
  const segments = path.split("/");
  if (
    !path.endsWith(".arch") ||
    path.length > 300 ||
    path.includes("\\") ||
    segments.some((s) => s === "" || s === "." || s === "..")
  )
    throw new Error("The file must be a repository path ending in .arch, e.g. architecture.arch or docs/system.arch.");
  return { owner, name, branch, path };
}

async function editableDoc(
  ctx: MutationCtx,
  id: Id<"documents">,
  workspaceId: string,
  apiKey: string | undefined,
): Promise<Doc<"documents">> {
  await requireWorkspace(ctx, workspaceId, apiKey, "editor");
  const doc = await ctx.db.get(id);
  if (!doc || doc.workspaceId !== workspaceId) throw new Error("Document not found");
  return doc;
}

/** A stored document, for the server only. */
async function storedDoc(ctx: MutationCtx, id: Id<"documents">, workspaceId: string, apiKey?: string) {
  requireServiceUser(apiKey);
  const doc = await editableDoc(ctx, id, workspaceId, apiKey);
  if (!doc.repo?.path) throw new Error("This document isn't stored in a repository.");
  return doc as Doc<"documents"> & { repo: RepoLink & { path: string } };
}

/** Create a document stored in a repository file: imported from it, or (no `base`) created by the first publish. */
export const create = mutation({
  args: {
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    title: v.string(),
    /** The document, laid out. */
    source: v.string(),
    file: fileRef,
    base: v.optional(baseVersion),
    /** The commit `source` came from, credited with the first revision. */
    commit: v.optional(commitInfo),
  },
  handler: async (ctx, a) => {
    const userId = requireServiceUser(a.apiKey);
    await requireWorkspace(ctx, a.workspaceId, a.apiKey, "editor");
    const file = checkFileRef(a.file);
    const now = Date.now();
    const repo: RepoLink = {
      ...file,
      linkedAt: now,
      linkedBy: userId,
      ...(a.base ? { base: a.base, checkedAt: now } : {}),
    };
    const id = await ctx.db.insert("documents", {
      workspaceId: a.workspaceId,
      title: a.title,
      source: a.source,
      updatedAt: now,
      seenRevisionAt: now,
      repo,
      syncKey: syncKeyOf(file),
    });
    await ctx.db.insert("revisions", {
      workspaceId: a.workspaceId,
      documentId: id,
      source: a.source,
      title: a.title,
      createdAt: now,
      author: a.commit ? { kind: "git", name: a.commit.author } : { kind: "user" },
      ...(a.commit
        ? { summary: a.commit.message ?? `Imported ${file.path}`, commit: { sha: a.commit.sha, url: a.commit.url } }
        : {}),
    });
    return id;
  },
});

/**
 * Store an existing document in a repository file ("Move to GitHub"). `base`
 * is the file's current version when it already exists: the document then
 * shows as a draft that replaces it; without one, the first publish creates
 * the file.
 */
export const link = mutation({
  args: {
    id: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    file: fileRef,
    base: v.optional(baseVersion),
  },
  handler: async (ctx, a) => {
    const userId = requireServiceUser(a.apiKey);
    await editableDoc(ctx, a.id, a.workspaceId, a.apiKey);
    const file = checkFileRef(a.file);
    const now = Date.now();
    const repo: RepoLink = {
      ...file,
      linkedAt: now,
      linkedBy: userId,
      checkedAt: now,
      ...(a.base ? { base: a.base } : {}),
    };
    await ctx.db.patch(a.id, { repo, syncKey: syncKeyOf(file) });
    return repo;
  },
});

/**
 * Stop syncing: the document is stored in Archer again, exactly as it is now.
 * The repository stays linked for the commit timeline; the file is untouched.
 */
export const unlink = mutation({
  args: { id: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const doc = await editableDoc(ctx, a.id, a.workspaceId, a.apiKey);
    if (!doc.repo) return;
    const { owner, name, branch, linkedAt } = doc.repo;
    await ctx.db.patch(a.id, { repo: { owner, name, branch, linkedAt }, syncKey: undefined });
  },
});

/**
 * A newer version of the file arrived: the document becomes `source` (the file
 * itself, or the file merged with the draft, laid out) and `base` moves to it.
 * Refused as stale when the document was saved after the server read it, so
 * a merge never overwrites an edit it didn't see; the caller re-reads and
 * retries.
 */
export const applyImport = mutation({
  args: {
    id: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    /** `updatedAt` of the document the server merged against. */
    expectedUpdatedAt: v.number(),
    source: v.string(),
    title: v.string(),
    base: baseVersion,
    commit: commitInfo,
    /** The publish pull request is done (merged, or its change arrived another way). */
    clearPr: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const doc = await storedDoc(ctx, a.id, a.workspaceId, a.apiKey);
    if (doc.updatedAt !== a.expectedUpdatedAt) return { applied: false as const };
    const now = Date.now();
    const { incoming: _i, problem: _p, pr, ...rest } = doc.repo;
    const repo: RepoLink = {
      ...rest,
      base: a.base,
      checkedAt: now,
      ...(pr && !a.clearPr ? { pr } : {}),
    };
    if (doc.source === a.source && doc.title === a.title) {
      await ctx.db.patch(a.id, { repo });
      return { applied: true as const, changed: false };
    }
    await ctx.db.patch(a.id, { source: a.source, title: a.title, updatedAt: now, repo });
    await recordRevision(
      ctx,
      doc,
      a.source,
      a.title,
      { kind: "git", name: a.commit.author },
      a.commit.message,
      { sha: a.commit.sha, url: a.commit.url },
    );
    return { applied: true as const, changed: true };
  },
});

/**
 * Sync bookkeeping that doesn't touch the document's content: the base after
 * a publish, the open pull request, a conflicting incoming version, the last
 * problem. `null` clears a field; an omitted field is left as it is.
 */
export const setState = mutation({
  args: {
    id: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    base: v.optional(baseVersion),
    pr: v.optional(v.union(prInfo, v.null())),
    incoming: v.optional(v.union(incomingInfo, v.null())),
    problem: v.optional(v.union(problemInfo, v.null())),
    checked: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const doc = await storedDoc(ctx, a.id, a.workspaceId, a.apiKey);
    const repo: Record<string, unknown> = { ...doc.repo };
    if (a.base) repo.base = a.base;
    for (const key of ["pr", "incoming", "problem"] as const) {
      const value = a[key];
      if (value === null) delete repo[key];
      else if (value !== undefined) repo[key] = value;
    }
    if (a.checked) repo.checkedAt = Date.now();
    await ctx.db.patch(a.id, { repo: repo as RepoLink });
  },
});

/**
 * The documents stored in `owner/name` on `branch`, for a push (or pull
 * request) webhook. Server credential only; returns just what the webhook
 * needs to act as each document's linking user.
 */
export const documentsForPush = query({
  args: { serviceKey: v.string(), owner: v.string(), name: v.string(), branch: v.string() },
  handler: async (ctx, a) => {
    requireServer(a.serviceKey);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_sync_key", (q) => q.eq("syncKey", syncKeyOf(a)))
      .collect();
    return docs.flatMap((d) =>
      d.repo?.path && d.repo.linkedBy
        ? [
            {
              id: d._id,
              workspaceId: d.workspaceId,
              path: d.repo.path,
              linkedBy: d.repo.linkedBy,
              prNumber: d.repo.pr?.number ?? null,
            },
          ]
        : [],
    );
  },
});
