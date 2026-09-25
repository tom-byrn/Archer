import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { autoLayout, format, lex, parse, type Diagnostic } from "@archer/lang";
import { analyzeSource, typeTags } from "@archer/mcp/analysis";
import type {
  ProjectCreated,
  ProjectListItem,
  ProjectRead,
  ProjectUpdated,
  TypeList,
  WorkspaceInfo,
  WorkspaceList,
  WorkspaceSwitched,
  WriteRejected,
} from "@archer/mcp/contract";
import * as account from "./auth";
import { APP_URL, MCP_URL } from "./config";
import { starterSource } from "./starter";
import { ToolError, callTool } from "./tools";

/** Exit codes: 0 ok, 1 the documents have problems, 2 usage / IO / auth. */
export const EXIT = { ok: 0, problems: 1, usage: 2 } as const;

export class UsageError extends Error {}

const STDIN = "-";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);

const readSource = (file: string): string => {
  try {
    return readFileSync(file === STDIN ? 0 : file, "utf8");
  } catch (e) {
    throw new UsageError(`Can't read ${file}: ${e instanceof Error ? e.message : e}`);
  }
};

const findArchFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : findArchFiles(path);
      return entry.name.endsWith(".arch") ? [path] : [];
    })
    .sort();

/** Expand CLI targets: files stay as given, directories (default: cwd) are searched. */
function expandTargets(targets: string[]): string[] {
  const files = (targets.length ? targets : ["."]).flatMap((t) => {
    if (t === STDIN) return [t];
    if (!existsSync(t)) throw new UsageError(`No such file or directory: ${t}`);
    return statSync(t).isDirectory() ? findArchFiles(t) : [t];
  });
  if (files.length === 0) throw new UsageError("No .arch files found.");
  return files;
}

// ---------------------------------------------------------------------------
// check

const diagnosticView = (d: Diagnostic) => ({
  code: d.code,
  severity: d.severity,
  message: d.message,
  ...(d.span ? { line: d.span.start.line, col: d.span.start.col } : {}),
});

const diagnosticLine = (file: string, d: Diagnostic): string => {
  const at = d.span ? `:${d.span.start.line}:${d.span.start.col}` : "";
  return `${file === STDIN ? "<stdin>" : file}${at}: ${d.severity} ${d.code}: ${d.message}`;
};

export async function check(
  targets: string[],
  opts: { json?: boolean; offline?: boolean },
): Promise<number> {
  const files = expandTargets(targets);
  // Workspace custom types are a nicety here: signed out (or offline) they
  // only surface as W301 warnings, never errors.
  const types = typeTags(opts.offline || !account.signedIn() ? [] : await customTypes().catch(() => []));

  const results = [];
  for (const file of files) {
    results.push({ file, ...analyzeSource(readSource(file), types) });
  }
  const errors = results.reduce((n, r) => n + r.errors.length, 0);
  const warnings = results.reduce((n, r) => n + r.warnings.length, 0);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          valid: errors === 0,
          files: results.map((r) => ({
            file: r.file,
            valid: r.errors.length === 0,
            errors: r.errors.map(diagnosticView),
            warnings: r.warnings.map(diagnosticView),
          })),
        },
        null,
        2,
      ),
    );
  } else {
    for (const r of results) for (const d of r.diagnostics) console.log(diagnosticLine(r.file, d));
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    console.error(
      `${errors === 0 ? "ok" : "FAILED"} — ${plural(files.length, "file")}, ${plural(errors, "error")}, ${plural(warnings, "warning")}`,
    );
  }
  return errors === 0 ? EXIT.ok : EXIT.problems;
}

// ---------------------------------------------------------------------------
// fmt

/** True when the source has a `#` comment, i.e. a `#` outside every token (strings, fences). */
function hasComments(source: string): boolean {
  const { tokens } = lex(source);
  let t = 0;
  for (let i = source.indexOf("#"); i !== -1; i = source.indexOf("#", i + 1)) {
    while (t < tokens.length && tokens[t]!.span.end.offset <= i) t++;
    if (t === tokens.length || tokens[t]!.span.start.offset > i) return true;
  }
  return false;
}

export function fmt(
  targets: string[],
  opts: { check?: boolean; layout?: boolean; "drop-comments"?: boolean },
): number {
  let problems = 0;
  for (const file of expandTargets(targets)) {
    const source = readSource(file);
    const parsed = parse(source);
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      // Formatting a best-effort parse could drop what the parser skipped.
      for (const d of errors) console.error(diagnosticLine(file, d));
      problems++;
      continue;
    }
    const formatted = format(opts.layout ? autoLayout(parsed.doc) : parsed.doc);
    if (file === STDIN) {
      process.stdout.write(formatted);
    } else if (formatted !== source) {
      if (opts.check) {
        console.log(`${file}: not formatted`);
        problems++;
      } else if (!opts["drop-comments"] && hasComments(source)) {
        // Comments aren't part of the document model, so canonical form loses them.
        console.error(`${file}: has # comments, which formatting removes — pass --drop-comments to format anyway`);
        problems++;
      } else {
        writeFileSync(file, formatted);
        console.log(`${file}: formatted`);
      }
    }
  }
  return problems === 0 ? EXIT.ok : EXIT.problems;
}

// ---------------------------------------------------------------------------
// account: sign-in and workspaces

/** Run `fn` with a client for the hosted server; auth and tool failures become usage errors. */
async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  let client: Client;
  try {
    client = await account.connect();
  } catch (e) {
    if (e instanceof account.LoginRequired) throw new UsageError(e.message);
    throw new UsageError(`Can't reach ${MCP_URL}: ${e instanceof Error ? e.message : e}`);
  }
  try {
    return await fn(client);
  } catch (e) {
    if (e instanceof account.LoginRequired || e instanceof ToolError) throw new UsageError(e.message);
    throw e;
  } finally {
    await client.close().catch(() => {});
  }
}

async function customTypes(): Promise<string[]> {
  const list = await withServer((client) => callTool<TypeList>(client, "list_types"));
  return list.custom_types.map((t) => t.tag);
}

export async function login(opts: { browser: boolean }): Promise<number> {
  await account.login({ browser: opts.browser, log: (line) => console.error(line) });
  const info = await withServer((client) => callTool<WorkspaceInfo>(client, "get_workspace_info"));
  const where = info.workspace_name ?? info.workspace_id;
  console.log(
    `Signed in to ${new URL(APP_URL).host} — workspace ${where}${info.workspace_role ? ` (${info.workspace_role})` : ""}`,
  );
  return EXIT.ok;
}

export async function logout(): Promise<number> {
  console.log((await account.logout()) ? `Signed out of ${APP_URL}` : "Not signed in.");
  return EXIT.ok;
}

/** List workspaces (current one starred), or switch to one — agents follow the switch too. */
export async function workspace(id: string | undefined, opts: { json?: boolean }): Promise<number> {
  return withServer(async (client) => {
    if (id !== undefined) {
      const w = await callTool<WorkspaceSwitched>(client, "use_workspace", { workspace_id: id });
      console.log(`Now using ${w.name} (${w.role}) — ${w.visible_projects ?? "?"} projects.`);
      if (w.role === "viewer") console.log("You are a viewer there: push will be refused.");
      return EXIT.ok;
    }
    const list = await callTool<WorkspaceList>(client, "list_workspaces");
    if (opts.json) {
      console.log(JSON.stringify(list.workspaces, null, 2));
    } else {
      for (const w of list.workspaces) console.log(`${w.current ? "*" : " "} ${w.id}  ${w.name}  ${w.role}`);
    }
    return EXIT.ok;
  });
}

// ---------------------------------------------------------------------------
// init

const MCP_CONFIG = ".mcp.json";
// The hosted server: the agent signs itself in (OAuth) on first use.
const MCP_ENTRY = { type: "http", url: MCP_URL };

/** Register the MCP server in ./.mcp.json, leaving other servers (and an existing entry) alone. */
function writeMcpConfig(): "created" | "updated" | "kept" {
  const exists = existsSync(MCP_CONFIG);
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (exists) {
    try {
      config = JSON.parse(readFileSync(MCP_CONFIG, "utf8"));
    } catch {
      throw new UsageError(`${MCP_CONFIG} is not valid JSON — fix it or pass --no-mcp.`);
    }
  }
  if (config.mcpServers?.archer) return "kept";
  config.mcpServers = { ...config.mcpServers, archer: MCP_ENTRY };
  writeFileSync(MCP_CONFIG, JSON.stringify(config, null, 2) + "\n");
  return exists ? "updated" : "created";
}

const titleFromDir = (): string =>
  basename(resolve("."))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function init(fileArg: string | undefined, opts: { title?: string; mcp: boolean }): number {
  const file = fileArg ?? "architecture.arch";
  if (extname(file) !== ".arch") throw new UsageError(`${file}: Archer files use the .arch extension.`);

  if (existsSync(file)) {
    console.log(`${file}: already exists, left unchanged`);
  } else {
    writeFileSync(file, starterSource(opts.title ?? titleFromDir()));
    console.log(`${file}: created`);
  }
  if (opts.mcp) console.log(`${MCP_CONFIG}: ${writeMcpConfig()} (MCP server "archer" → ${MCP_URL})`);

  console.log(
    [
      "",
      "Next:",
      `  archer check             validate every .arch file here (exit 1 on errors; --json for machines)`,
      `  archer guide             the language specification`,
      account.signedIn()
        ? `  archer push ${file}   create the project in your Archer workspace`
        : `  archer login             sign in with GitHub (in the browser), then: archer push ${file}`,
    ].join("\n"),
  );
  return EXIT.ok;
}

// ---------------------------------------------------------------------------
// push / pull / list — sync a local file with a project in the workspace

const LINKS_FILE = "archer.json";
interface Links {
  projects: Record<string, string>;
}

const readLinks = (): Links => {
  if (!existsSync(LINKS_FILE)) return { projects: {} };
  try {
    const parsed = JSON.parse(readFileSync(LINKS_FILE, "utf8")) as Partial<Links>;
    return { ...parsed, projects: parsed.projects ?? {} };
  } catch {
    throw new UsageError(`${LINKS_FILE} is not valid JSON.`);
  }
};

const linkKey = (file: string) => relative(".", file).split("\\").join("/");

function saveLink(file: string, projectId: string): void {
  const links = readLinks();
  if (links.projects[linkKey(file)] === projectId) return;
  links.projects[linkKey(file)] = projectId;
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2) + "\n");
}

/** Rethrow, turning "no such project" from the server (or an id Convex rejects outright) into a CLI message. */
function rethrowMissingProject(e: unknown, projectId: string): never {
  if (e instanceof ToolError && /^No project with id|v\.id\("documents"\)/.test(e.message))
    throw new UsageError(`No project with id ${projectId} in the current workspace (see: archer list, archer workspace).`);
  throw e;
}

export async function push(
  file: string,
  opts: { project?: string; message?: string },
): Promise<number> {
  const source = readSource(file);
  const projectId = opts.project ?? readLinks().projects[linkKey(file)];

  return withServer(async (client) => {
    // Validate here first for file:line:col diagnostics; the server applies
    // the same gate (and keeps the canvas layout) when it saves.
    const custom = await callTool<TypeList>(client, "list_types");
    const a = analyzeSource(source, typeTags(custom.custom_types.map((t) => t.tag)));
    if (a.errors.length > 0) {
      for (const d of [...a.errors, ...a.warnings]) console.log(diagnosticLine(file, d));
      console.error("REJECTED — nothing was saved. Fix the errors and push again.");
      return EXIT.problems;
    }
    for (const d of a.warnings) console.log(diagnosticLine(file, d));

    let saved: ProjectCreated;
    try {
      saved = projectId
        ? await callTool<ProjectUpdated>(client, "update_project", {
            project_id: projectId,
            source,
            ...(opts.message ? { summary: opts.message } : {}),
          })
        : await callTool<ProjectCreated>(client, "create_project", {
            source,
            summary: opts.message ?? "Created the project",
          });
    } catch (e) {
      const rejected = e instanceof ToolError ? (e.data as Partial<WriteRejected> | null) : null;
      if (Array.isArray(rejected?.errors)) {
        for (const line of [...rejected.errors, ...(rejected.warnings ?? [])]) console.log(`${file}: ${line}`);
        console.error("REJECTED — nothing was saved. Fix the errors and push again.");
        return EXIT.problems;
      }
      if (projectId) rethrowMissingProject(e, projectId);
      throw e;
    }
    saveLink(file, saved.id);
    console.log(`${projectId ? "Updated" : "Created"} "${saved.title}" — ${saved.editor_url}`);
    // A project stored in a repository file: the push only reached its draft.
    if ("note" in saved && typeof saved.note === "string") console.error(saved.note);
    return EXIT.ok;
  });
}

export async function pull(
  file: string,
  opts: { project?: string; force?: boolean },
): Promise<number> {
  const projectId = opts.project ?? readLinks().projects[linkKey(file)];
  if (!projectId)
    throw new UsageError(`${file} isn't linked to a project yet — pass --project <id> (see: archer list).`);
  const project = await withServer((client) =>
    callTool<ProjectRead>(client, "get_project", { project_id: projectId }).catch((e: unknown) =>
      rethrowMissingProject(e, projectId),
    ),
  );
  // A project stored in a repository file keeps its layout in Archer: the file
  // only holds the architecture, exactly as publishing writes it.
  const source = project.repository?.path
    ? format(parse(project.source).doc, { stripLayout: true })
    : project.source;
  if (!opts.force && existsSync(file) && readSource(file) !== source) {
    // Canonical form differs from hand-written text even with no real edits, so
    // we can't tell "stale" from "has local work" — make overwriting explicit.
    throw new UsageError(`${file} differs from the project — pass --force to overwrite it.`);
  }
  writeFileSync(file, source);
  saveLink(file, projectId);
  console.log(`${file}: pulled "${project.title}"`);
  return EXIT.ok;
}

export async function list(opts: { json?: boolean }): Promise<number> {
  const projects = await withServer((client) => callTool<ProjectListItem[]>(client, "list_projects"));
  if (opts.json) {
    console.log(JSON.stringify(projects.map(({ id, title, updated }) => ({ id, title, updated })), null, 2));
  } else {
    for (const p of projects) console.log(`${p.id}  ${p.title}`);
  }
  return EXIT.ok;
}
