import { AsyncLocalStorage } from "node:async_hooks";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi, type FunctionReference } from "convex/server";

// Untyped references into apps/web/convex functions (validated server-side).
type Module =
  | "documents"
  | "library"
  | "revisions"
  | "threads"
  | "drift"
  | "apiKeys"
  | "workspaces"
  | "agentPrefs";
const fn = (module: Module, name: string): unknown =>
  (anyApi as Record<string, Record<string, unknown>>)[module]![name];
const qref = (m: Module, n: string) => fn(m, n) as FunctionReference<"query">;
const mref = (m: Module, n: string) => fn(m, n) as FunctionReference<"mutation">;
import {
  autoLayout,
  format,
  layoutMap,
  normalizeLayout,
  parse,
  pathToString,
  validate,
  type ArchDoc,
  type Diagnostic,
} from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";

// The ARCHER_DEFAULT_* values are inlined by the published CLI's build
// (packages/cli/tsup.config.ts) so `npx archer-cli` targets the hosted app;
// running from the repo falls through to local dev.
export const CONVEX_URL =
  process.env.CONVEX_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.ARCHER_DEFAULT_CONVEX_URL ??
  "http://127.0.0.1:3210";
export const APP_URL =
  process.env.ARCHER_APP_URL ??
  process.env.ARCHLANG_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ??
  process.env.ARCHER_DEFAULT_APP_URL ??
  "http://localhost:3000";

// Filesystem locations are resolved lazily: this module is also imported by
// the hosted (serverless) MCP route, where nothing may touch the disk at
// import time.
const archerDir = (): string => join(homedir(), ".archer");
const keyFile = (): string => join(archerDir(), "key");
/** Pre-auth config locations — only read to give a migration hint. */
const legacyWorkspaceFiles = (): string[] => [
  join(archerDir(), "workspace"),
  join(homedir(), ".archlang", "workspace"),
];

const readFile = (path: string): string | null => {
  try {
    const v = readFileSync(path, "utf8").trim();
    return v === "" ? null : v;
  } catch {
    return null;
  }
};

/** The configured API key: ARCHER_API_KEY, else ~/.archer/key. */
export function resolveApiKey(): string | null {
  const env = process.env.ARCHER_API_KEY?.trim();
  if (env) return env;
  return readFile(keyFile());
}

/** True when the user still has a pre-auth workspace id configured. */
export function hasLegacyWorkspaceConfig(): boolean {
  return (
    !!process.env.ARCHER_WORKSPACE_ID ||
    !!process.env.ARCHLANG_WORKSPACE_ID ||
    legacyWorkspaceFiles().some((f) => readFile(f) !== null)
  );
}

export function persistApiKey(key: string): void {
  mkdirSync(archerDir(), { recursive: true });
  writeFileSync(keyFile(), key + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(keyFile(), 0o600);
  } catch {
    // best effort (e.g. Windows)
  }
  workspaceCache = undefined;
}

/** A resolved credential: the key and the workspace it unlocks. */
export interface Workspace {
  workspaceId: string;
  apiKey: string;
}

let workspaceCache: Promise<Workspace | null> | undefined;

/**
 * Resolve the configured API key to its workspace (one backend round trip,
 * cached for the process; invalidated by persistApiKey). Null when no key is
 * configured or the key is invalid.
 */
export function resolveWorkspace(): Promise<Workspace | null> {
  if (workspaceCache === undefined) {
    const apiKey = resolveApiKey();
    workspaceCache = apiKey ? lookupKey(apiKey) : Promise.resolve(null);
    // Don't cache transient backend failures.
    workspaceCache.catch(() => {
      workspaceCache = undefined;
    });
  }
  return workspaceCache;
}

/** Resolve an arbitrary key without touching the cache. */
export async function lookupKey(apiKey: string): Promise<Workspace | null> {
  const res = (await client.query(qref("apiKeys", "resolve"), { apiKey })) as
    | { workspaceId: string }
    | null;
  return res ? { workspaceId: res.workspaceId, apiKey } : null;
}

const MIGRATION_HINT =
  " NOTE: a pre-auth workspace id (ARCHER_WORKSPACE_ID / ~/.archer/workspace) is still configured — Archer now uses API keys instead; that id is ignored. Create a key in the app under \"Connect an agent\".";

export const NO_WORKSPACE_MESSAGE = `No API key is configured, so project tools can't run yet. An API key identifies the user's workspace — it must be created by the user in the Archer app: open ${APP_URL}, sign in with GitHub, click "Connect an agent", and create an API key. Then either set the ARCHER_API_KEY environment variable for this MCP server, or ask the user for the key and call the set_api_key tool with it (persists to ~/.archer/key). Never invent or guess a key. Language tools (validate_source, format_source, compile_for_agent, auto_layout_source, get_guide) work without one.`;

/** NO_WORKSPACE_MESSAGE plus a migration hint when legacy config exists (reads the disk, hence lazy). */
export const noWorkspaceMessage = (): string =>
  NO_WORKSPACE_MESSAGE + (hasLegacyWorkspaceConfig() ? MIGRATION_HINT : "");

export const INVALID_KEY_MESSAGE = `The configured API key was rejected by the backend (revoked, mistyped, or from a different deployment). Ask the user to create a new key in the Archer app (${APP_URL} → Connect an agent) and set ARCHER_API_KEY or call set_api_key.`;

const client = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Agent identity: every write is attributed to the agent so humans can review
// what changed and by whom. ARCHER_AGENT_NAME wins; otherwise the MCP client's
// declared name (set by the server after the handshake); otherwise "agent".

let clientName: string | null = null;
export function setClientName(name: string | undefined | null): void {
  clientName = name && name.trim() !== "" ? name.trim() : null;
}

/**
 * Per-request identity for the hosted (remote) server. One serverless process
 * serves many users concurrently, so nothing about the caller may live in
 * module state — the tool wrapper runs each call inside `requestContext.run`.
 * `serviceKey` is the credential Convex accepts in the `apiKey` argument for a
 * verified user: `svc_<ARCHER_SERVICE_SECRET>.<userId>`.
 */
export interface RequestContext {
  userId: string;
  agentName: string;
  serviceKey: string;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function agentName(): string {
  const ctx = requestContext.getStore();
  if (ctx) return ctx.agentName;
  const env = process.env.ARCHER_AGENT_NAME?.trim();
  return env && env !== "" ? env : (clientName ?? "agent");
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
  path?: string;
  linkedAt: number;
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
export interface ThreadMessage {
  author: Author;
  text: string;
  at: number;
}
export interface ThreadRow {
  _id: string;
  documentId: string;
  path: string;
  status: "open" | "resolved";
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
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

const auth = (ws: Workspace) => ({ workspaceId: ws.workspaceId, apiKey: ws.apiKey });

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

  // question threads
  listThreads: (ws: Workspace, documentId: string, status?: "open" | "resolved") =>
    client.query(qref("threads", "list"), { ...auth(ws), documentId, ...(status ? { status } : {}) }) as Promise<ThreadRow[]>,
  createThread: (ws: Workspace, documentId: string, path: string, text: string) =>
    client.mutation(mref("threads", "create"), { ...auth(ws), documentId, path, text, author: agentAuthor() }) as Promise<string>,
  replyThread: (ws: Workspace, id: string, text: string) =>
    client.mutation(mref("threads", "reply"), { ...auth(ws), id, text, author: agentAuthor() }) as Promise<void>,
  setThreadStatus: (ws: Workspace, id: string, status: "open" | "resolved") =>
    client.mutation(mref("threads", "setStatus"), { ...auth(ws), id, status }) as Promise<void>,

  // workspaces (hosted server: the caller is a user, not a single-workspace key)
  listWorkspaces: (apiKey: string) =>
    client.query(qref("workspaces", "list"), { apiKey }) as Promise<WorkspaceSummary[]>,
  getAgentWorkspace: (apiKey: string) =>
    client.query(qref("agentPrefs", "get"), { apiKey }) as Promise<{ workspaceId: string } | null>,
  setAgentWorkspace: (apiKey: string, workspaceId: string) =>
    client.mutation(mref("agentPrefs", "set"), { apiKey, workspaceId }) as Promise<unknown>,

  // drift
  getDrift: (ws: Workspace, documentId: string) =>
    client.query(qref("drift", "get"), { ...auth(ws), documentId }) as Promise<DriftRow | null>,
  reportDrift: (ws: Workspace, documentId: string, findings: DriftFinding[]) =>
    client.mutation(mref("drift", "report"), { ...auth(ws), documentId, findings, author: agentAuthor() }) as Promise<string>,
};

// ---------------------------------------------------------------------------

export const formatDiagnostic = (d: Diagnostic): string =>
  `${d.code} [${d.severity}]${d.span ? ` line ${d.span.start.line}` : ""}: ${d.message}`;

export async function knownTypesFor(
  ws: Workspace | null,
): Promise<Set<string>> {
  const types = knownTypes();
  if (ws) {
    try {
      for (const t of await db.listCustomTypes(ws)) types.add(t.tag);
    } catch {
      // Backend unreachable — validate against the static catalog only.
    }
  }
  return types;
}

export interface Analysis {
  doc: ArchDoc;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export async function analyze(
  source: string,
  ws: Workspace | null,
): Promise<Analysis> {
  const parsed = parse(source);
  const diagnostics = [
    ...parsed.diagnostics,
    ...validate(parsed.doc, {
      knownTypes: await knownTypesFor(ws),
      knownConnectionTypes: knownConnectionTypes(),
    }),
  ];
  return {
    doc: parsed.doc,
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === "error"),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
  };
}

/**
 * Carry the previous document's layout over to a new revision: any component
 * that still exists and has no explicit entry in the new source keeps its old
 * position/size/display. Then auto-layout completes whatever is left.
 */
export function mergeLayout(previous: ArchDoc, next: ArchDoc): ArchDoc {
  const nextEntries = new Set(next.layout.map((e) => pathToString(e.path)));
  const inherited = [...layoutMap(normalizeLayout(previous)).values()].filter(
    (e) => !nextEntries.has(pathToString(e.path)),
  );
  return autoLayout({ ...next, layout: [...next.layout, ...inherited] });
}

/** Validate-gate a write; returns canonical text or the blocking errors. */
export async function prepareWrite(
  source: string,
  ws: Workspace | null,
  previousSource?: string,
): Promise<
  | { ok: true; text: string; title: string; warnings: Diagnostic[] }
  | { ok: false; errors: Diagnostic[]; warnings: Diagnostic[] }
> {
  const analysis = await analyze(source, ws);
  if (analysis.errors.length > 0) {
    return { ok: false, errors: analysis.errors, warnings: analysis.warnings };
  }
  const laidOut = previousSource
    ? mergeLayout(parse(previousSource).doc, analysis.doc)
    : autoLayout(analysis.doc);
  return {
    ok: true,
    text: format(laidOut),
    title: analysis.doc.title,
    warnings: analysis.warnings,
  };
}
