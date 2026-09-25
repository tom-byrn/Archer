import { AsyncLocalStorage } from "node:async_hooks";
import { ConvexHttpClient } from "convex/browser";
import { anyApi, type FunctionReference } from "convex/server";
import { analyzeSource, prepareSource, typeTags, type Analysis, type PreparedWrite } from "./analysis";

// Untyped references into apps/web/convex functions (validated server-side).
type Module = "documents" | "library" | "revisions" | "drift" | "workspaces" | "agentPrefs" | "repoSync";
const fn = (module: Module, name: string): unknown =>
  (anyApi as Record<string, Record<string, unknown>>)[module]![name];
const qref = (m: Module, n: string) => fn(m, n) as FunctionReference<"query">;
const mref = (m: Module, n: string) => fn(m, n) as FunctionReference<"mutation">;

// This module runs inside the web app's hosted /mcp route (and the scripts
// that exercise it); the app's own env names the backend and public origin.
export const CONVEX_URL =
  process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
export const APP_URL =
  process.env.ARCHER_APP_URL ??
  process.env.ARCHLANG_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ??
  "http://localhost:3000";

/**
 * Where tools act: a workspace, reached with the service credential of the
 * verified user (`svc_<ARCHER_SERVICE_SECRET>.<userId>`, see
 * apps/web/convex/access.ts). Convex functions take it in their `apiKey`
 * argument.
 */
export interface Workspace {
  workspaceId: string;
  serviceKey: string;
}

const client = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Agent identity: every write is attributed to the agent so humans can review
// what changed and by whom — the connecting OAuth client's name ("Claude
// Code", "Archer CLI"…), resolved by the web route.

/**
 * Per-request identity. One serverless process serves many users
 * concurrently, so nothing about the caller may live in module state — the
 * tool wrapper runs each call inside `requestContext.run`.
 */
export interface RequestContext {
  userId: string;
  agentName: string;
  serviceKey: string;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function agentName(): string {
  return requestContext.getStore()?.agentName ?? "agent";
}
export function agentAuthor(): { kind: "agent"; name: string } {
  return { kind: "agent", name: agentName() };
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
  pending?: boolean;
}

export interface ProjectSummary {
  _id: string;
  title: string;
  updatedAt: number;
  /** Where it's linked or stored (no sync bookkeeping). */
  repo?: Pick<RepoLink, "owner" | "name" | "branch" | "path" | "linkedAt">;
}
export interface RepoLink {
  owner: string;
  name: string;
  branch: string;
  /** Set when the project is stored in this .arch file (apps/web/lib/repoSync.ts). */
  path?: string;
  linkedAt: number;
  /** The file as last synced; the draft is whatever the project changes on top of it. */
  base?: { commit: string; blob: string; source: string; at: number };
  pr?: { number: number; url: string; branch: string; openedAt: number };
  /** A newer version of the file that conflicts with the draft. */
  incoming?: {
    commit: string;
    blob?: string;
    source?: string;
    author?: string;
    message?: string;
    url?: string;
    conflicts: string[];
    at?: number;
  };
  /** Why the last sync failed, until one succeeds. */
  problem?: { message: string; commit?: string; at: number };
  checkedAt?: number;
}
export interface ProjectDoc extends ProjectSummary {
  source: string;
  /** Linked GitHub repository, if the human (or an agent) set one. */
  repo?: RepoLink;
  /** Share slug while "anyone with the link can view" is on. */
  publicSlug?: string;
  /** Up to when the user has reviewed changes they didn't make. */
  seenRevisionAt?: number;
}
/** A document shared with "anyone with the link" (documents.getPublic). */
export interface PublicDoc {
  _id: string;
  title: string;
  source: string;
  updatedAt: number;
  repo: Pick<RepoLink, "owner" | "name" | "branch" | "path"> | null;
}
export interface CustomTypeRow {
  tag: string;
  name: string;
  color: string;
  glyph: string;
}
export interface Author {
  kind: "user" | "agent" | "git";
  name?: string;
}
export interface RevisionRow {
  _id: string;
  documentId: string;
  source: string;
  title: string;
  createdAt: number;
  author: Author;
  summary?: string;
  /** The commit a revision was imported from (author kind "git"). */
  commit?: { sha: string; url: string };
}
export type DriftStatus = "missing" | "changed" | "extra";
export interface DriftFinding {
  status: DriftStatus;
  path?: string;
  name?: string;
  src?: string;
  note?: string;
}
export interface DriftRow {
  _id: string;
  documentId: string;
  reportedAt: number;
  author: Author;
  findings: DriftFinding[];
}

export interface MemberRow {
  _id: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  createdAt: number;
  /** Invited by email, not signed in yet. */
  pending: boolean;
  /** The caller. */
  you: boolean;
}

const auth = (ws: Workspace) => ({ workspaceId: ws.workspaceId, apiKey: ws.serviceKey });

export const db = {
  listProjects: (ws: Workspace) =>
    client.query(qref("documents", "list"), { ...auth(ws) }) as Promise<ProjectSummary[]>,
  getProject: (ws: Workspace, id: string) =>
    client.query(qref("documents", "get"), { ...auth(ws), id }) as Promise<ProjectDoc | null>,
  createProject: (ws: Workspace, title: string, source: string, summary?: string) =>
    client.mutation(mref("documents", "create"), {
      ...auth(ws),
      title,
      source,
      author: agentAuthor(),
      ...(summary ? { summary } : {}),
    }) as Promise<string>,
  setRepo: (ws: Workspace, id: string, repo: { owner: string; name: string; branch: string } | null) =>
    client.mutation(mref("documents", "setRepo"), { ...auth(ws), id, repo }) as Promise<RepoLink | null>,
  updateProject: (ws: Workspace, id: string, title: string, source: string, summary?: string) =>
    client.mutation(mref("documents", "updateSource"), {
      ...auth(ws),
      id,
      title,
      source,
      author: agentAuthor(),
      ...(summary ? { summary } : {}),
    }) as Promise<void>,
  deleteProject: (ws: Workspace, id: string) =>
    client.mutation(mref("documents", "remove"), { ...auth(ws), id }) as Promise<void>,
  /** Turn "anyone with the link can view" on (→ the slug) or off (→ null). */
  setPublic: (ws: Workspace, id: string, enabled: boolean) =>
    client.mutation(mref("documents", "setPublic"), { ...auth(ws), id, enabled }) as Promise<string | null>,
  /** A shared document by its link's slug; needs no workspace. */
  getPublic: (slug: string) => client.query(qref("documents", "getPublic"), { slug }) as Promise<PublicDoc | null>,
  /** The user has reviewed every change up to now. */
  markSeen: (ws: Workspace, id: string) =>
    client.mutation(mref("documents", "markSeen"), { ...auth(ws), id }) as Promise<void>,
  /** Stop syncing a document stored in a repository file; the repository stays linked. */
  unlinkFile: (ws: Workspace, id: string) =>
    client.mutation(mref("repoSync", "unlink"), { ...auth(ws), id }) as Promise<void>,
  listCustomTypes: (ws: Workspace) =>
    client.query(qref("library", "list"), { ...auth(ws) }) as Promise<CustomTypeRow[]>,
  saveCustomType: (ws: Workspace, t: CustomTypeRow) =>
    client.mutation(mref("library", "save"), { ...auth(ws), ...t }) as Promise<void>,
  deleteCustomType: (ws: Workspace, tag: string) =>
    client.mutation(mref("library", "remove"), { ...auth(ws), tag }) as Promise<void>,

  // revisions
  listRevisions: (ws: Workspace, documentId: string, limit?: number) =>
    client.query(qref("revisions", "listFull"), { ...auth(ws), documentId, limit }) as Promise<RevisionRow[]>,
  getRevision: (ws: Workspace, id: string) =>
    client.query(qref("revisions", "get"), { ...auth(ws), id }) as Promise<RevisionRow | null>,
  /** The revision the user last reviewed (see documents.markSeen). */
  reviewBaseline: (ws: Workspace, documentId: string) =>
    client.query(qref("revisions", "baseline"), { ...auth(ws), documentId }) as Promise<RevisionRow | null>,

  // workspaces: the caller is a user who may belong to several
  listWorkspaces: (serviceKey: string) =>
    client.query(qref("workspaces", "list"), { apiKey: serviceKey }) as Promise<WorkspaceSummary[]>,
  getAgentWorkspace: (serviceKey: string) =>
    client.query(qref("agentPrefs", "get"), { apiKey: serviceKey }) as Promise<{ workspaceId: string } | null>,
  setAgentWorkspace: (serviceKey: string, workspaceId: string) =>
    client.mutation(mref("agentPrefs", "set"), { apiKey: serviceKey, workspaceId }) as Promise<unknown>,
  /** Bind invites addressed to the user's email to them, as signing in to the app does. */
  acceptInvites: (serviceKey: string, email: string) =>
    client.mutation(mref("workspaces", "acceptInvites"), { apiKey: serviceKey, email }) as Promise<{ accepted: number }>,
  createWorkspace: (serviceKey: string, name: string, email: string | null) =>
    client.mutation(mref("workspaces", "create"), {
      apiKey: serviceKey,
      name,
      ...(email ? { email } : {}),
    }) as Promise<string>,
  renameWorkspace: (serviceKey: string, workspaceId: string, name: string) =>
    client.mutation(mref("workspaces", "rename"), { apiKey: serviceKey, workspaceId, name }) as Promise<void>,
  deleteWorkspace: (serviceKey: string, workspaceId: string) =>
    client.mutation(mref("workspaces", "remove"), { apiKey: serviceKey, workspaceId }) as Promise<void>,
  leaveWorkspace: (serviceKey: string, workspaceId: string) =>
    client.mutation(mref("workspaces", "leave"), { apiKey: serviceKey, workspaceId }) as Promise<void>,
  listMembers: (serviceKey: string, workspaceId: string) =>
    client.query(qref("workspaces", "members"), { apiKey: serviceKey, workspaceId }) as Promise<MemberRow[]>,
  inviteMember: (serviceKey: string, workspaceId: string, email: string, role: MemberRow["role"]) =>
    client.mutation(mref("workspaces", "invite"), { apiKey: serviceKey, workspaceId, email, role }) as Promise<string>,
  setMemberRole: (serviceKey: string, memberId: string, role: MemberRow["role"]) =>
    client.mutation(mref("workspaces", "setRole"), { apiKey: serviceKey, memberId, role }) as Promise<void>,
  removeMember: (serviceKey: string, memberId: string) =>
    client.mutation(mref("workspaces", "removeMember"), { apiKey: serviceKey, memberId }) as Promise<void>,

  // drift
  getDrift: (ws: Workspace, documentId: string) =>
    client.query(qref("drift", "get"), { ...auth(ws), documentId }) as Promise<DriftRow | null>,
  reportDrift: (ws: Workspace, documentId: string, findings: DriftFinding[]) =>
    client.mutation(mref("drift", "report"), { ...auth(ws), documentId, findings, author: agentAuthor() }) as Promise<string>,
  /** Drop one finding (by its position) from a report. */
  dismissDrift: (ws: Workspace, driftId: string, index: number) =>
    client.mutation(mref("drift", "dismiss"), { ...auth(ws), id: driftId, index }) as Promise<void>,
  /** Remove the document's drift report altogether. */
  clearDrift: (ws: Workspace, documentId: string) =>
    client.mutation(mref("drift", "clear"), { ...auth(ws), documentId }) as Promise<void>,
};

// ---------------------------------------------------------------------------

/** Catalog types plus the workspace's custom ones (catalog only if unreachable). */
export async function knownTypesFor(ws: Workspace | null): Promise<Set<string>> {
  if (!ws) return typeTags();
  try {
    return typeTags((await db.listCustomTypes(ws)).map((t) => t.tag));
  } catch {
    // Backend unreachable — validate against the static catalog only.
    return typeTags();
  }
}

export async function analyze(source: string, ws: Workspace | null): Promise<Analysis> {
  return analyzeSource(source, await knownTypesFor(ws));
}

/** Validate-gate a write; returns canonical text or the blocking errors. */
export async function prepareWrite(
  source: string,
  ws: Workspace | null,
  previousSource?: string,
): Promise<PreparedWrite> {
  return prepareSource(source, await knownTypesFor(ws), previousSource);
}
