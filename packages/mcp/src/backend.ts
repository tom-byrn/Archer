import { AsyncLocalStorage } from "node:async_hooks";
import { ConvexHttpClient } from "convex/browser";
import { anyApi, type FunctionReference } from "convex/server";
import { analyzeSource, prepareSource, typeTags, type Analysis, type PreparedWrite } from "./analysis";

// Untyped references into apps/web/convex functions (validated server-side).
type Module = "documents" | "library" | "revisions" | "drift" | "workspaces" | "agentPrefs";
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
  incoming?: { commit: string; conflicts: string[] };
}
export interface ProjectDoc extends ProjectSummary {
  source: string;
  /** Linked GitHub repository, if the human (or an agent) set one. */
  repo?: RepoLink;
}
export interface CustomTypeRow {
  tag: string;
  name: string;
  color: string;
  glyph: string;
}
export interface Author {
  kind: "user" | "agent";
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

  // workspaces: the caller is a user who may belong to several
  listWorkspaces: (serviceKey: string) =>
    client.query(qref("workspaces", "list"), { apiKey: serviceKey }) as Promise<WorkspaceSummary[]>,
  getAgentWorkspace: (serviceKey: string) =>
    client.query(qref("agentPrefs", "get"), { apiKey: serviceKey }) as Promise<{ workspaceId: string } | null>,
  setAgentWorkspace: (serviceKey: string, workspaceId: string) =>
    client.mutation(mref("agentPrefs", "set"), { apiKey: serviceKey, workspaceId }) as Promise<unknown>,

  // drift
  getDrift: (ws: Workspace, documentId: string) =>
    client.query(qref("drift", "get"), { ...auth(ws), documentId }) as Promise<DriftRow | null>,
  reportDrift: (ws: Workspace, documentId: string, findings: DriftFinding[]) =>
    client.mutation(mref("drift", "report"), { ...auth(ws), documentId, findings, author: agentAuthor() }) as Promise<string>,
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
