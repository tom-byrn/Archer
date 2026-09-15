import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi, type FunctionReference } from "convex/server";

// Untyped references into apps/web/convex functions (validated server-side).
type Module = "documents" | "library" | "revisions" | "threads" | "drift";
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

export const CONVEX_URL =
  process.env.CONVEX_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  "http://127.0.0.1:3210";
export const APP_URL =
  process.env.ARCHER_APP_URL ??
  process.env.ARCHLANG_APP_URL ??
  "http://localhost:3000";

const WORKSPACE_FILE = join(homedir(), ".archer", "workspace");
/** Pre-rename fallbacks so existing setups keep working. */
const LEGACY_WORKSPACE_FILE = join(homedir(), ".archlang", "workspace");

const readWorkspaceFile = (path: string): string | null => {
  try {
    const id = readFileSync(path, "utf8").trim();
    return id === "" ? null : id;
  } catch {
    return null;
  }
};

export function resolveWorkspaceId(): string | null {
  return (
    process.env.ARCHER_WORKSPACE_ID ??
    process.env.ARCHLANG_WORKSPACE_ID ??
    readWorkspaceFile(WORKSPACE_FILE) ??
    readWorkspaceFile(LEGACY_WORKSPACE_FILE)
  );
}

export function persistWorkspaceId(id: string): void {
  mkdirSync(join(homedir(), ".archer"), { recursive: true });
  writeFileSync(WORKSPACE_FILE, id + "\n", "utf8");
}

export const NO_WORKSPACE_MESSAGE = `No workspace is configured, so project tools can't run yet. The workspace id scopes which projects you see — it must match the one the user's browser uses. Ask the user to copy their workspace id from the footer of the Archer home page (${APP_URL}), then call the set_workspace tool with it (persists to ~/.archer/workspace). Alternatively they can set the ARCHER_WORKSPACE_ID environment variable for this MCP server. Language tools (validate_source, format_source, compile_for_agent, auto_layout_source, get_guide) work without a workspace.`;

const client = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Agent identity: every write is attributed to the agent so humans can review
// what changed and by whom. ARCHER_AGENT_NAME wins; otherwise the MCP client's
// declared name (set by the server after the handshake); otherwise "agent".

let clientName: string | null = null;
export function setClientName(name: string | undefined | null): void {
  clientName = name && name.trim() !== "" ? name.trim() : null;
}
export function agentName(): string {
  const env = process.env.ARCHER_AGENT_NAME?.trim();
  return env && env !== "" ? env : (clientName ?? "agent");
}
export function agentAuthor(): { kind: "agent"; name: string } {
  return { kind: "agent", name: agentName() };
}

export interface ProjectSummary {
  _id: string;
  title: string;
  updatedAt: number;
}
export interface ProjectDoc extends ProjectSummary {
  source: string;
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

export const db = {
  listProjects: (workspaceId: string) =>
    client.query(qref("documents", "list"), { workspaceId }) as Promise<ProjectSummary[]>,
  getProject: (workspaceId: string, id: string) =>
    client.query(qref("documents", "get"), { workspaceId, id }) as Promise<ProjectDoc | null>,
  createProject: (workspaceId: string, title: string, source: string, summary?: string) =>
    client.mutation(mref("documents", "create"), {
      workspaceId,
      title,
      source,
      author: agentAuthor(),
      ...(summary ? { summary } : {}),
    }) as Promise<string>,
  updateProject: (workspaceId: string, id: string, title: string, source: string, summary?: string) =>
    client.mutation(mref("documents", "updateSource"), {
      workspaceId,
      id,
      title,
      source,
      author: agentAuthor(),
      ...(summary ? { summary } : {}),
    }) as Promise<void>,
  deleteProject: (workspaceId: string, id: string) =>
    client.mutation(mref("documents", "remove"), { workspaceId, id }) as Promise<void>,
  listCustomTypes: (workspaceId: string) =>
    client.query(qref("library", "list"), { workspaceId }) as Promise<CustomTypeRow[]>,
  saveCustomType: (workspaceId: string, t: CustomTypeRow) =>
    client.mutation(mref("library", "save"), { workspaceId, ...t }) as Promise<void>,
  deleteCustomType: (workspaceId: string, tag: string) =>
    client.mutation(mref("library", "remove"), { workspaceId, tag }) as Promise<void>,

  // revisions
  listRevisions: (workspaceId: string, documentId: string, limit?: number) =>
    client.query(qref("revisions", "listFull"), { workspaceId, documentId, limit }) as Promise<RevisionRow[]>,
  getRevision: (workspaceId: string, id: string) =>
    client.query(qref("revisions", "get"), { workspaceId, id }) as Promise<RevisionRow | null>,

  // question threads
  listThreads: (workspaceId: string, documentId: string, status?: "open" | "resolved") =>
    client.query(qref("threads", "list"), { workspaceId, documentId, ...(status ? { status } : {}) }) as Promise<ThreadRow[]>,
  createThread: (workspaceId: string, documentId: string, path: string, text: string) =>
    client.mutation(mref("threads", "create"), { workspaceId, documentId, path, text, author: agentAuthor() }) as Promise<string>,
  replyThread: (workspaceId: string, id: string, text: string) =>
    client.mutation(mref("threads", "reply"), { workspaceId, id, text, author: agentAuthor() }) as Promise<void>,
  setThreadStatus: (workspaceId: string, id: string, status: "open" | "resolved") =>
    client.mutation(mref("threads", "setStatus"), { workspaceId, id, status }) as Promise<void>,

  // drift
  getDrift: (workspaceId: string, documentId: string) =>
    client.query(qref("drift", "get"), { workspaceId, documentId }) as Promise<DriftRow | null>,
  reportDrift: (workspaceId: string, documentId: string, findings: DriftFinding[]) =>
    client.mutation(mref("drift", "report"), { workspaceId, documentId, findings, author: agentAuthor() }) as Promise<string>,
};

// ---------------------------------------------------------------------------

export const formatDiagnostic = (d: Diagnostic): string =>
  `${d.code} [${d.severity}]${d.span ? ` line ${d.span.start.line}` : ""}: ${d.message}`;

export async function knownTypesFor(
  workspaceId: string | null,
): Promise<Set<string>> {
  const types = knownTypes();
  if (workspaceId) {
    try {
      for (const t of await db.listCustomTypes(workspaceId)) types.add(t.tag);
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
  workspaceId: string | null,
): Promise<Analysis> {
  const parsed = parse(source);
  const diagnostics = [
    ...parsed.diagnostics,
    ...validate(parsed.doc, {
      knownTypes: await knownTypesFor(workspaceId),
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
  workspaceId: string | null,
  previousSource?: string,
): Promise<
  | { ok: true; text: string; title: string; warnings: Diagnostic[] }
  | { ok: false; errors: Diagnostic[]; warnings: Diagnostic[] }
> {
  const analysis = await analyze(source, workspaceId);
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
