import "server-only";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { CURRENT_VERSION, format, isEmptyDiff } from "@archer/lang";
import { analyzeSource, formatDiagnostic, prepareSource, typeTags } from "@archer/mcp/analysis";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  draftDiff,
  fileSource,
  planSync,
  publishBody,
  publishTitle,
  resolveMerge,
  type StoredFile,
} from "@/lib/repoSync";
import { SITE_URL } from "@/lib/site";
import {
  GitHubError,
  appTokenForRepo,
  createBranch,
  createPullRequest,
  getBranchHead,
  getFile,
  getPullRequest,
  getRepo,
  githubTokenForUser,
  lastCommitForPath,
  listArchFiles,
  putFile,
  type GitHubCommit,
} from "@/lib/server/github";

/**
 * The repo sync engine: everything that reads or writes a document's
 * repository file. The routes under app/api/github/* call it for the
 * signed-in user, and the push webhook calls it for the user who linked each
 * document. Convex is reached as that user with the service credential (like
 * the hosted MCP route), so their workspace role still decides what they may
 * do. The rules themselves (what counts as a draft, when to merge) are pure
 * and live in lib/repoSync.ts. See docs/repo-sync.md.
 */

/** Something the user can act on; `status` is the HTTP status the routes answer with. */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "sync",
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Who the engine acts as. */
export interface Actor {
  userId: string;
  /** Their GitHub token (or the App's, for a webhook), if any. */
  token: string | null;
}

/** The signed-in user as an Actor. */
export const actorFor = async (userId: string): Promise<Actor> => ({ userId, token: await githubTokenForUser(userId) });

let client: ConvexHttpClient | null = null;
const convex = (): ConvexHttpClient => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) throw new SyncError("NEXT_PUBLIC_CONVEX_URL is not set.", 500, "misconfigured");
  return (client ??= new ConvexHttpClient(url));
};

const secret = (): string => {
  const s = process.env.ARCHER_SERVICE_SECRET;
  if (!s) throw new SyncError("ARCHER_SERVICE_SECRET is not set.", 500, "misconfigured");
  return s;
};
/** Act in Convex as `userId` (see convex/access.ts). */
const actAs = (userId: string) => `svc_${secret()}.${userId}`;

const short = (sha: string) => sha.slice(0, 7);
const ACCESS_ERRORS = new Set(["not_found", "forbidden", "no_github_token", "unauthenticated"]);
const isAccessError = (e: unknown) => e instanceof GitHubError && ACCESS_ERRORS.has(e.code);

type StoredDoc = Doc<"documents"> & { role: string; repo: StoredFile };

/** A stored document the actor can edit (checked before anything reaches GitHub). */
async function getDoc(actor: Actor, workspaceId: string, documentId: string): Promise<StoredDoc> {
  const doc = await convex().query(api.documents.get, {
    id: documentId as Id<"documents">,
    workspaceId,
    apiKey: actAs(actor.userId),
  });
  if (!doc) throw new SyncError("Document not found.", 404, "not_found");
  if (doc.role === "viewer") throw new SyncError("This needs editor access; you are a viewer.", 403, "forbidden");
  if (!doc.repo?.path) throw new SyncError("This document isn't stored in a repository.", 400, "not_stored");
  return doc as StoredDoc;
}

async function knownTypes(actor: Actor, workspaceId: string): Promise<Set<string>> {
  const custom = await convex().query(api.library.list, { workspaceId, apiKey: actAs(actor.userId) });
  return typeTags(custom.map((t) => t.tag));
}

type SyncState = Omit<FunctionArgs<typeof api.repoSync.setState>, "id" | "workspaceId" | "apiKey">;

const setState = (actor: Actor, doc: StoredDoc, state: SyncState) =>
  convex().mutation(api.repoSync.setState, {
    id: doc._id,
    workspaceId: doc.workspaceId,
    apiKey: actAs(actor.userId),
    ...state,
  });

const commitInfo = (c: GitHubCommit | null, fallbackSha: string, owner: string, name: string) => ({
  sha: c?.sha ?? fallbackSha,
  url: c?.htmlUrl ?? `https://github.com/${owner}/${name}/commit/${fallbackSha}`,
  author: c?.authorLogin ?? c?.authorName ?? "GitHub",
  ...(c ? { message: c.message.split("\n")[0]!.slice(0, 200) } : {}),
});

/**
 * The branch head, read with `actor.token`, else as the Archer GitHub App.
 * Returns the token that worked, so the reads that follow use it too.
 */
async function readHead(actor: Actor, f: StoredFile): Promise<{ token: string | null; sha: string }> {
  try {
    return { token: actor.token, sha: await getBranchHead(actor.token, f.owner, f.name, f.branch) };
  } catch (e) {
    if (!isAccessError(e)) throw e;
    const app = await appTokenForRepo(f.owner, f.name).catch(() => null);
    if (app) {
      try {
        return { token: app, sha: await getBranchHead(app, f.owner, f.name, f.branch) };
      } catch {
        // fall through
      }
    }
    throw new SyncError(
      `Can't read ${f.owner}/${f.name} on ${f.branch}: the branch was deleted or renamed, or ${
        actor.token ? "your GitHub account" : "Archer"
      } has no access to it.`,
      404,
      "no_access",
    );
  }
}

/** Whether the document's publish pull request has closed (merged or not). */
async function prClosed(token: string | null, f: StoredFile): Promise<boolean> {
  if (!f.pr) return false;
  try {
    return (await getPullRequest(token, f.owner, f.name, f.pr.number)).state === "closed";
  } catch {
    return false;
  }
}

/** The user can read the repository with their own GitHub access (public repos: anyone). */
async function requireUserCanRead(actor: Actor, owner: string, name: string): Promise<void> {
  try {
    await getRepo(actor.token, owner, name);
  } catch (e) {
    if (isAccessError(e))
      throw new SyncError(
        actor.token
          ? `Can't find ${owner}/${name}, or your GitHub account can't read it. Private repositories need the repo scope (Grant access).`
          : `Can't find ${owner}/${name}. Sign in with GitHub to use private repositories.`,
        404,
        "no_access",
      );
    throw e;
  }
}

async function branchHeadOrThrow(actor: Actor, owner: string, name: string, branch: string): Promise<string> {
  try {
    return await getBranchHead(actor.token, owner, name, branch);
  } catch (e) {
    if (e instanceof GitHubError && e.code === "not_found")
      throw new SyncError(`${owner}/${name} has no branch "${branch}".`, 404, "no_branch");
    throw e;
  }
}

/* ---------------------------------------------------------------- Sync */

export type SyncOutcome =
  /** Nothing new on the branch (for this file). */
  | { status: "unchanged" }
  /** The file is linked but doesn't exist yet; publishing creates it. */
  | { status: "missing" }
  /** The branch has the draft's architecture (e.g. a publish PR merged): base moved, nothing else. */
  | { status: "adopted" }
  | { status: "imported" | "merged"; commit: string; author: string }
  | { status: "conflict"; conflicts: string[] }
  /** The file on the branch can't be used (errors, deleted); the last good version stays. */
  | { status: "problem"; message: string };

/**
 * Bring a document up to date with its file on the branch: import the new
 * version, merge it with the draft, or record a conflict for the user. Safe
 * to call any time (the editor calls it on open and on focus; the webhook on
 * every push that touches the file).
 */
export async function syncDocument(actor: Actor, workspaceId: string, documentId: string): Promise<SyncOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getDoc(actor, workspaceId, documentId);
    const f = doc.repo;
    const head = await readHead(actor, f);
    const prDone = await prClosed(head.token, f);
    const clearPr = prDone ? { pr: null } : {};
    const now = Date.now();

    if (f.base && head.sha === f.base.commit) {
      if (prDone || f.problem) await setState(actor, doc, { ...clearPr, problem: null, checked: true });
      return { status: "unchanged" };
    }
    const file = await getFile(head.token, f.owner, f.name, f.path, head.sha);
    if (!file) {
      if (!f.base) {
        if (prDone) await setState(actor, doc, clearPr);
        return { status: "missing" };
      }
      const message = `${f.path} isn't on ${f.branch} any more (as of ${short(head.sha)}). Restore it, or stop syncing to keep the document in Archer.`;
      if (f.problem?.message !== message)
        await setState(actor, doc, { ...clearPr, problem: { message, commit: head.sha, at: now } });
      return { status: "problem", message };
    }
    if (f.base && file.sha === f.base.blob) {
      // The branch moved, the file didn't: remember the newer commit.
      await setState(actor, doc, { ...clearPr, base: { ...f.base, commit: head.sha, at: now }, problem: null });
      return { status: "unchanged" };
    }

    const types = await knownTypes(actor, workspaceId);
    const analysis = analyzeSource(file.content, types);
    if (analysis.errors.length > 0) {
      const n = analysis.errors.length;
      const which = analysis.errors
        .slice(0, 2)
        .map((d) => `${d.code}${d.span ? ` on line ${d.span.start.line}` : ""}: ${d.message.replace(/\.$/, "")}`)
        .join("; ");
      const message = `${f.path} at ${short(head.sha)} has ${n === 1 ? "an error" : `${n} errors`} (${which}). Archer keeps the last good version until it's fixed.`;
      if (f.problem?.commit !== head.sha)
        await setState(actor, doc, { ...clearPr, problem: { message, commit: head.sha, at: now } });
      return { status: "problem", message };
    }

    const commit = commitInfo(
      await lastCommitForPath(head.token, f.owner, f.name, head.sha, f.path).catch(() => null),
      head.sha,
      f.owner,
      f.name,
    );
    const base = { commit: head.sha, blob: file.sha, source: fileSource(file.content), at: now };
    const plan = planSync({ base: f.base?.source ?? null, draft: doc.source, head: file.content });

    if (plan.action === "adopt") {
      await setState(actor, doc, { ...clearPr, base, incoming: null, problem: null });
      return { status: "adopted" };
    }
    if (plan.action === "conflict") {
      if (f.incoming?.blob !== file.sha)
        await setState(actor, doc, {
          ...clearPr,
          problem: null,
          incoming: {
            commit: head.sha,
            blob: file.sha,
            source: base.source,
            author: commit.author,
            ...(commit.message ? { message: commit.message } : {}),
            url: commit.url,
            conflicts: plan.conflicts,
            at: now,
          },
        });
      return { status: "conflict", conflicts: plan.conflicts };
    }

    const prep = prepareSource(plan.source, types, doc.source);
    if (!prep.ok) {
      // A merge that doesn't validate is a conflict in all but name.
      const conflicts = prep.errors.map(formatDiagnostic);
      await setState(actor, doc, {
        ...clearPr,
        incoming: { commit: head.sha, blob: file.sha, source: base.source, author: commit.author, url: commit.url, conflicts, at: now },
      });
      return { status: "conflict", conflicts };
    }
    const applied = await convex().mutation(api.repoSync.applyImport, {
      id: doc._id,
      workspaceId,
      apiKey: actAs(actor.userId),
      expectedUpdatedAt: doc.updatedAt,
      source: prep.text,
      title: prep.title,
      base,
      commit,
      clearPr: prDone,
    });
    if (!applied.applied) continue; // saved meanwhile: re-read and plan again
    return { status: plan.action === "merge" ? "merged" : "imported", commit: commit.sha, author: commit.author };
  }
  throw new SyncError("The document kept changing while syncing. Try again.", 409, "busy");
}

/**
 * Settle a conflict recorded by `syncDocument`: merge again, giving the
 * conflicting items to the draft ("draft") or to the repository's version
 * ("repo"). Either way the document then sits on top of that version, and
 * anything still different from it is draft to publish.
 */
export async function resolveConflict(
  actor: Actor,
  workspaceId: string,
  documentId: string,
  keep: "draft" | "repo",
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getDoc(actor, workspaceId, documentId);
    const incoming = doc.repo.incoming;
    if (!incoming) return;
    const types = await knownTypes(actor, workspaceId);
    const merged = resolveMerge({
      base: doc.repo.base?.source ?? null,
      draft: doc.source,
      head: incoming.source,
      prefer: keep === "draft" ? "draft" : "head",
    });
    const prep = prepareSource(merged, types, doc.source);
    if (!prep.ok)
      throw new SyncError(
        `The merged document has errors: ${prep.errors.map(formatDiagnostic).join("; ")}`,
        409,
        "invalid_merge",
      );
    const subject = incoming.message ? `"${incoming.message}"` : short(incoming.commit);
    const applied = await convex().mutation(api.repoSync.applyImport, {
      id: doc._id,
      workspaceId,
      apiKey: actAs(actor.userId),
      expectedUpdatedAt: doc.updatedAt,
      source: prep.text,
      title: prep.title,
      base: { commit: incoming.commit, blob: incoming.blob, source: incoming.source, at: Date.now() },
      commit: {
        sha: incoming.commit,
        url: incoming.url ?? `https://github.com/${doc.repo.owner}/${doc.repo.name}/commit/${incoming.commit}`,
        author: incoming.author ?? "GitHub",
        message: `Merged ${subject}, keeping ${keep === "draft" ? "the draft's" : "the repository's"} side of conflicts`,
      },
    });
    if (applied.applied) return;
  }
  throw new SyncError("The document kept changing while resolving. Try again.", 409, "busy");
}

/**
 * Sync, first settling a recorded conflict when `resolve` says which side to
 * keep (POST /api/github/sync, and the MCP's sync_with_github).
 */
export async function syncWith(
  actor: Actor,
  workspaceId: string,
  documentId: string,
  resolve?: "draft" | "repo",
): Promise<SyncOutcome> {
  if (resolve) await resolveConflict(actor, workspaceId, documentId, resolve);
  return syncDocument(actor, workspaceId, documentId);
}

/* ------------------------------------------------------------- Publish */

export type PublishResult =
  | { mode: "commit"; commit: string; url: string }
  | { mode: "pr"; number: number; url: string; updated: boolean };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "architecture";

/**
 * Write the draft to the repository: as a pull request (default; publishing
 * again while it's open adds a commit to it), or as a commit straight to the
 * branch. Refuses when the file changed since the last sync (`stale`: sync,
 * then publish again) or while a conflict is waiting.
 *
 * Commits use the user's own GitHub access. A pull request can also be opened
 * by the Archer GitHub App when their account can't write to the repository,
 * so teammates without write access can still propose changes for review.
 */
export async function publishDocument(
  actor: Actor,
  workspaceId: string,
  documentId: string,
  opts: { mode: "pr" | "commit"; message?: string },
): Promise<PublishResult> {
  const doc = await getDoc(actor, workspaceId, documentId);
  const f = doc.repo;
  if (f.incoming)
    throw new SyncError("The repository has changes that conflict with the draft. Resolve them first.", 409, "conflict");
  const analysis = analyzeSource(doc.source, await knownTypes(actor, workspaceId));
  if (analysis.errors.length > 0)
    throw new SyncError(
      `Fix the document's errors before publishing: ${analysis.errors.slice(0, 3).map(formatDiagnostic).join("; ")}`,
      422,
      "invalid",
    );
  const content = fileSource(doc.source);
  const empty = format({ kind: "doc", title: doc.title, version: CURRENT_VERSION, components: [], connections: [], layout: [] });
  const diff = draftDiff(f.base?.source ?? empty, doc.source);
  if (f.base && isEmptyDiff(diff))
    throw new SyncError(`Nothing to publish: ${f.path} already has this architecture.`, 409, "nothing");

  const head = await readHead(actor, f);
  const current = await getFile(head.token, f.owner, f.name, f.path, head.sha);
  // Publishing over a file that moved since the last sync would drop that
  // change, so sync first. Except when the sync already found this very
  // version unusable (errors, deleted): replacing it is how it gets fixed.
  const moved = f.base ? current?.sha !== f.base.blob : current !== null;
  if (moved && f.problem?.commit !== head.sha)
    throw new SyncError(`${f.path} changed on ${f.branch} since the last sync.`, 409, "stale");

  const title = opts.message?.trim() || publishTitle(diff, f.path);
  const now = Date.now();

  const commitDirectly = async (token: string | null): Promise<PublishResult> => {
    const res = await putFile(token, f.owner, f.name, {
      path: f.path,
      branch: f.branch,
      content,
      message: title,
      ...(current ? { sha: current.sha } : {}),
    });
    await setState(actor, doc, {
      base: { commit: res.commit, blob: res.blob, source: content, at: now },
      problem: null,
    });
    return { mode: "commit", commit: res.commit, url: res.url };
  };

  const pullRequest = async (token: string | null): Promise<PublishResult> => {
    if (f.pr) {
      const open = await getPullRequest(token, f.owner, f.name, f.pr.number).catch(() => null);
      if (open?.state === "open") {
        const onBranch = await getFile(token, f.owner, f.name, f.path, f.pr.branch);
        await putFile(token, f.owner, f.name, {
          path: f.path,
          branch: f.pr.branch,
          content,
          message: title,
          ...(onBranch ? { sha: onBranch.sha } : {}),
        });
        return { mode: "pr", number: open.number, url: open.url, updated: true };
      }
    }
    const branch = `archer/${slug(doc.title)}-${now.toString(36)}`;
    await createBranch(token, f.owner, f.name, branch, head.sha);
    await putFile(token, f.owner, f.name, {
      path: f.path,
      branch,
      content,
      message: title,
      ...(current ? { sha: current.sha } : {}),
    });
    const pr = await createPullRequest(token, f.owner, f.name, {
      title,
      body: publishBody(diff, `${SITE_URL}/documents/${documentId}`),
      head: branch,
      base: f.branch,
    });
    await setState(actor, doc, { pr: { number: pr.number, url: pr.url, branch, openedAt: now } });
    return { mode: "pr", number: pr.number, url: pr.url, updated: false };
  };

  const write = opts.mode === "commit" ? commitDirectly : pullRequest;
  try {
    return await write(actor.token);
  } catch (e) {
    if (!isAccessError(e)) throw e;
    const app = opts.mode === "pr" ? await appTokenForRepo(f.owner, f.name).catch(() => null) : null;
    if (app) return write(app);
    throw new SyncError(
      opts.mode === "commit"
        ? `Your GitHub account can't push to ${f.owner}/${f.name}. Grant Archer write access, or open a pull request instead.`
        : `Your GitHub account can't write to ${f.owner}/${f.name}. Grant Archer write access, or install the Archer GitHub App on the repository.`,
      403,
      "no_write_access",
    );
  }
}

/* ---------------------------------------------------------- Link / create */

export interface FileRef {
  owner: string;
  name: string;
  branch: string;
  path: string;
}

/** "acme-shop" → "Acme Shop" */
const titleFromRepo = (name: string) =>
  name.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Architecture";

/**
 * New document stored in a repository file ("From GitHub"): imported when the
 * file exists (it must validate), else a blank document whose first publish
 * creates the file. The user must be able to read the repository themselves.
 */
export async function createFromRepo(
  actor: Actor,
  workspaceId: string,
  ref: FileRef,
): Promise<{ id: string; imported: boolean }> {
  await requireUserCanRead(actor, ref.owner, ref.name);
  const sha = await branchHeadOrThrow(actor, ref.owner, ref.name, ref.branch);
  const file = await getFile(actor.token, ref.owner, ref.name, ref.path, sha);
  const types = await knownTypes(actor, workspaceId);
  if (file) {
    const prep = prepareSource(file.content, types);
    if (!prep.ok)
      throw new SyncError(`${ref.path} has errors, so it can't be imported yet.`, 422, "invalid", {
        errors: prep.errors.map(formatDiagnostic),
      });
    const commit = commitInfo(
      await lastCommitForPath(actor.token, ref.owner, ref.name, sha, ref.path).catch(() => null),
      sha,
      ref.owner,
      ref.name,
    );
    const id = await convex().mutation(api.repoSync.create, {
      workspaceId,
      apiKey: actAs(actor.userId),
      title: prep.title,
      source: prep.text,
      file: ref,
      base: { commit: sha, blob: file.sha, source: fileSource(file.content), at: Date.now() },
      commit,
    });
    return { id, imported: true };
  }
  const title = titleFromRepo(ref.name);
  const blank = format({ kind: "doc", title, version: CURRENT_VERSION, components: [], connections: [], layout: [] });
  const id = await convex().mutation(api.repoSync.create, {
    workspaceId,
    apiKey: actAs(actor.userId),
    title,
    source: blank,
    file: ref,
  });
  return { id, imported: false };
}

/**
 * Store an existing document in a repository file ("Move to GitHub"). When
 * the file already exists, the document becomes a draft that replaces it on
 * the next publish; otherwise that publish creates it.
 */
export async function linkFile(
  actor: Actor,
  workspaceId: string,
  documentId: string,
  ref: FileRef,
): Promise<{ existed: boolean }> {
  await requireUserCanRead(actor, ref.owner, ref.name);
  const sha = await branchHeadOrThrow(actor, ref.owner, ref.name, ref.branch);
  const file = await getFile(actor.token, ref.owner, ref.name, ref.path, sha);
  await convex().mutation(api.repoSync.link, {
    id: documentId as Id<"documents">,
    workspaceId,
    apiKey: actAs(actor.userId),
    file: ref,
    ...(file ? { base: { commit: sha, blob: file.sha, source: fileSource(file.content), at: Date.now() } } : {}),
  });
  return { existed: file !== null };
}

/** Every .arch file on a branch, read with the user's own access. */
export async function archFiles(actor: Actor, owner: string, name: string, branch: string) {
  await requireUserCanRead(actor, owner, name);
  const sha = await branchHeadOrThrow(actor, owner, name, branch);
  return listArchFiles(actor.token, owner, name, sha);
}

/* ---------------------------------------------------------------- Webhook */

interface PushPayload {
  ref?: string;
  deleted?: boolean;
  after?: string;
  repository?: { name?: string; owner?: { login?: string; name?: string } };
  installation?: { id?: number };
  commits?: { added?: string[]; modified?: string[]; removed?: string[] }[];
  pull_request?: { number?: number; merged?: boolean; base?: { ref?: string } };
  action?: string;
}

/** Files a push changed, or null when the payload can't tell (huge or forced pushes). */
function changedPaths(p: PushPayload): Set<string> | null {
  const commits = p.commits ?? [];
  if (commits.length === 0 || commits.length >= 2048) return null;
  const paths = new Set<string>();
  for (const c of commits) for (const path of [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]) paths.add(path);
  return paths;
}

export interface WebhookResult {
  event: string;
  documents: { id: string; status: string; message?: string }[];
}

/**
 * Handle a verified GitHub webhook delivery. `push` to a branch syncs every
 * document stored in a file the push changed; `pull_request` closed forgets a
 * document's publish PR. Each document is synced as the user who linked it,
 * reading as the Archer GitHub App when the delivery came from its
 * installation, else with that user's own GitHub token.
 */
export async function handleWebhook(event: string, payload: PushPayload): Promise<WebhookResult> {
  const out: WebhookResult = { event, documents: [] };
  const owner = payload.repository?.owner?.login ?? payload.repository?.owner?.name;
  const name = payload.repository?.name;
  if (!owner || !name) return out;

  const branch =
    event === "push"
      ? payload.ref?.startsWith("refs/heads/") && !payload.deleted
        ? payload.ref.slice("refs/heads/".length)
        : null
      : event === "pull_request" && payload.action === "closed"
        ? (payload.pull_request?.base?.ref ?? null)
        : null;
  if (!branch) return out;

  const docs = await convex().query(api.repoSync.documentsForPush, {
    serviceKey: `svc_${secret()}`,
    owner,
    name,
    branch,
  });
  const touched = event === "push" ? changedPaths(payload) : null;
  const appToken = docs.length ? await appTokenForRepo(owner, name, payload.installation?.id).catch(() => null) : null;

  for (const d of docs) {
    try {
      const actor: Actor = { userId: d.linkedBy, token: appToken ?? (await githubTokenForUser(d.linkedBy)) };
      if (event === "pull_request") {
        if (d.prNumber !== payload.pull_request?.number) continue;
        // Merged: the push that merge made imports the file. Closed: the draft stays a draft.
        const doc = await getDoc(actor, d.workspaceId, d.id);
        await setState(actor, doc, { pr: null });
        out.documents.push({ id: d.id, status: "pr_closed" });
        continue;
      }
      if (touched && !touched.has(d.path)) {
        out.documents.push({ id: d.id, status: "untouched" });
        continue;
      }
      const r = await syncDocument(actor, d.workspaceId, d.id);
      out.documents.push({ id: d.id, status: r.status, ...("message" in r ? { message: r.message } : {}) });
    } catch (e) {
      out.documents.push({ id: d.id, status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** JSON error response for a thrown SyncError / GitHubError. */
export function syncErrorResponse(e: unknown): Response {
  if (e instanceof SyncError)
    return Response.json(
      { error: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) },
      { status: e.status },
    );
  if (e instanceof GitHubError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[repo sync]", e);
  return Response.json({ error: e instanceof Error ? e.message : "Sync failed", code: "internal" }, { status: 500 });
}
