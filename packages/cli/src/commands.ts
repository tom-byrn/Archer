import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { autoLayout, format, lex, parse, type Diagnostic } from "@archer/lang";
import {
  APP_URL,
  INVALID_KEY_MESSAGE,
  analyze,
  db,
  lookupKey,
  persistApiKey,
  prepareWrite,
  resolveApiKey,
  resolveWorkspace,
  type Workspace,
} from "@archer/mcp/backend";
import { starterSource } from "./starter";

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
  // Workspace custom types are a nicety here: without a key (or offline) they
  // only surface as W301 warnings, never errors.
  const ws = opts.offline || !resolveApiKey() ? null : await resolveWorkspace().catch(() => null);

  const results = [];
  for (const file of files) {
    const a = await analyze(readSource(file), ws);
    results.push({ file, ...a });
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
// auth

const NO_KEY = `No API key configured. Create one in the Archer app (${APP_URL} → avatar menu → Connect an agent), then run: archer login <key>  (or set ARCHER_API_KEY).`;

async function requireWorkspace(): Promise<Workspace> {
  if (!resolveApiKey()) throw new UsageError(NO_KEY);
  const ws = await resolveWorkspace();
  if (!ws) throw new UsageError(INVALID_KEY_MESSAGE);
  return ws;
}

async function promptForKey(): Promise<string> {
  if (!process.stdin.isTTY) return readSource(STDIN).trim();
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question("Archer API key: ")).trim();
  } finally {
    rl.close();
  }
}

export async function login(keyArg: string | undefined): Promise<number> {
  const key = keyArg?.trim() || (await promptForKey());
  if (!key) throw new UsageError(NO_KEY);
  const ws = await lookupKey(key);
  if (!ws) throw new UsageError(`That API key was rejected; nothing was saved. ${INVALID_KEY_MESSAGE}`);
  persistApiKey(key);
  console.log(`Saved to ~/.archer/key — workspace ${ws.workspaceId}`);
  return EXIT.ok;
}

// ---------------------------------------------------------------------------
// init

const MCP_CONFIG = ".mcp.json";
const MCP_ENTRY = { command: "npx", args: ["-y", "archer-cli", "mcp"] };

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

export async function init(
  fileArg: string | undefined,
  opts: { title?: string; key?: string; mcp: boolean },
): Promise<number> {
  const file = fileArg ?? "architecture.arch";
  if (extname(file) !== ".arch") throw new UsageError(`${file}: Archer files use the .arch extension.`);

  if (existsSync(file)) {
    console.log(`${file}: already exists, left unchanged`);
  } else {
    writeFileSync(file, starterSource(opts.title ?? titleFromDir()));
    console.log(`${file}: created`);
  }
  if (opts.mcp) console.log(`${MCP_CONFIG}: ${writeMcpConfig()} (MCP server "archer" → npx archer-cli mcp)`);
  // The key never goes in .mcp.json (that file gets committed); the server reads ~/.archer/key.
  if (opts.key) await login(opts.key);

  console.log(
    [
      "",
      "Next:",
      `  archer check             validate every .arch file here (exit 1 on errors; --json for machines)`,
      `  archer guide             the language specification`,
      resolveApiKey()
        ? `  archer push ${file}   create the project in your Archer workspace`
        : `  archer login <key>       connect your workspace, then: archer push ${file}`,
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

export async function push(
  file: string,
  opts: { project?: string; message?: string },
): Promise<number> {
  const source = readSource(file);
  const ws = await requireWorkspace();
  const projectId = opts.project ?? readLinks().projects[linkKey(file)];

  const existing = projectId ? await db.getProject(ws, projectId) : null;
  if (projectId && !existing)
    throw new UsageError(`No project with id ${projectId} in this workspace (see: archer list).`);

  const prep = await prepareWrite(source, ws, existing?.source);
  if (!prep.ok) {
    for (const d of [...prep.errors, ...prep.warnings]) console.log(diagnosticLine(file, d));
    console.error("REJECTED — nothing was saved. Fix the errors and push again.");
    return EXIT.problems;
  }
  for (const d of prep.warnings) console.log(diagnosticLine(file, d));

  let id = projectId;
  if (existing) await db.updateProject(ws, existing._id, prep.title, prep.text, opts.message);
  else id = await db.createProject(ws, prep.title, prep.text, opts.message ?? "Created the project");
  saveLink(file, id!);
  console.log(`${existing ? "Updated" : "Created"} "${prep.title}" — ${APP_URL}/documents/${id}`);
  return EXIT.ok;
}

export async function pull(
  file: string,
  opts: { project?: string; force?: boolean },
): Promise<number> {
  const ws = await requireWorkspace();
  const projectId = opts.project ?? readLinks().projects[linkKey(file)];
  if (!projectId)
    throw new UsageError(`${file} isn't linked to a project yet — pass --project <id> (see: archer list).`);
  const project = await db.getProject(ws, projectId);
  if (!project) throw new UsageError(`No project with id ${projectId} in this workspace (see: archer list).`);
  if (!opts.force && existsSync(file) && readSource(file) !== project.source) {
    // Canonical form differs from hand-written text even with no real edits, so
    // we can't tell "stale" from "has local work" — make overwriting explicit.
    throw new UsageError(`${file} differs from the project — pass --force to overwrite it.`);
  }
  writeFileSync(file, project.source);
  saveLink(file, projectId);
  console.log(`${file}: pulled "${project.title}"`);
  return EXIT.ok;
}

export async function list(opts: { json?: boolean }): Promise<number> {
  const projects = await db.listProjects(await requireWorkspace());
  if (opts.json) {
    console.log(
      JSON.stringify(
        projects.map((p) => ({ id: p._id, title: p.title, updated: new Date(p.updatedAt).toISOString() })),
        null,
        2,
      ),
    );
  } else {
    for (const p of projects) console.log(`${p._id}  ${p.title}`);
  }
  return EXIT.ok;
}
