import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  autoLayout,
  compileForAgent,
  componentPaths,
  diffDocs,
  format,
  layoutMap,
  moveComponent,
  parse,
  relayoutComponents,
  resizeComponent,
  setDisplay,
  summarizeDiff,
  type ArchDoc,
  type DiffSummary,
} from "@archer/lang";
import { CATALOG, CONNECTION_TYPES, GLYPHS } from "@archer/catalog";
import {
  APP_URL,
  CONVEX_URL,
  agentName,
  analyze,
  db,
  prepareWrite,
  type DriftFinding,
  type ProjectDoc,
  type RevisionRow,
} from "./backend";
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
} from "./contract";
import { EXAMPLES, findExample, type Example } from "./examples";
import { registerGitHubTools, repositoryView } from "./githubTools";
import { BRIEF, GUIDE } from "./guide";
import { NO_HOST, type ArcherHost } from "./host";
import { SAMPLES, findSample, type Sample } from "./samples";
import { registerTeamTools } from "./teamTools";
import {
  caller,
  currentWorkspace,
  diagnosticsReport,
  fail,
  iso,
  optionalWorkspace,
  requireProject,
  requireWorkspace,
  text,
  wrap,
} from "./tool";

const describeSummary = (s: DiffSummary): string => {
  const parts: string[] = [];
  if (s.added) parts.push(`+${s.added} component${s.added === 1 ? "" : "s"}`);
  if (s.removed) parts.push(`−${s.removed} removed`);
  if (s.changed) parts.push(`~${s.changed} changed`);
  if (s.connectionsAdded) parts.push(`+${s.connectionsAdded} connection${s.connectionsAdded === 1 ? "" : "s"}`);
  if (s.connectionsRemoved) parts.push(`−${s.connectionsRemoved} connection${s.connectionsRemoved === 1 ? "" : "s"}`);
  if (s.connectionsChanged) parts.push(`~${s.connectionsChanged} connection${s.connectionsChanged === 1 ? "" : "s"} changed`);
  return parts.length ? parts.join(", ") : "no architectural changes";
};

const emptyLike = (doc: ArchDoc): ArchDoc => ({ ...doc, components: [], connections: [], layout: [] });

/** Whether the user has seen a revision: their own saves always count. */
const reviewed = (r: RevisionRow, seenAt: number | undefined) => r.author.kind === "user" || r.createdAt <= (seenAt ?? 0);

const revisionView = (r: RevisionRow, previous: ArchDoc | null) => {
  const doc = parse(r.source).doc;
  const summary = summarizeDiff(diffDocs(previous ?? emptyLike(doc), doc));
  return {
    revision_id: r._id,
    created_at: iso(r.createdAt),
    author: r.author,
    summary: r.summary,
    title: r.title,
    changes: summary,
    description: describeSummary(summary),
    // A revision imported from a commit to the repository file (repo sync).
    ...(r.commit ? { commit: r.commit } : {}),
  };
};

/** An example minus its source, with where a human can see it on the site. */
const exampleInfo = (e: Example) => ({
  slug: e.slug,
  title: e.title,
  summary: e.summary,
  features: e.features,
  docs_url: `${APP_URL}/language/examples#${e.slug}`,
  sandbox_url: `${APP_URL}/sandbox/${e.slug}`,
});

const sampleInfo = (s: Sample) => ({ slug: s.slug, title: s.title, description: s.description });

const editorUrl = (id: string) => `${APP_URL}/documents/${id}`;

/** Where a shared document can be seen, and its live image. */
const shareLinks = (slug: string) => {
  const url = `${APP_URL}/share/${slug}`;
  return {
    url,
    image_url: `${url}/image.svg`,
    embed: {
      light: `![Architecture](${url}/image.svg)`,
      dark: `![Architecture](${url}/image.svg?theme=dark)`,
    },
  };
};

/** Where a write to a project stored in a repository file went. */
const draftNote = (doc: ProjectDoc) =>
  doc.repo?.path
    ? {
        note: `Saved to the unpublished draft. This project is stored in ${doc.repo.path} in ${doc.repo.owner}/${doc.repo.name} (${doc.repo.branch}): publish the draft with publish_to_github when the user asks (a pull request by default). If you are working in that repository, edit ${doc.repo.path} directly instead.`,
      }
    : {};

const HEADER = /^([ \t]*arch[ \t]+)"(?:[^"\\\n]|\\.)*"/m;
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The source with the title in its `arch "…"` header replaced and every other
 * byte kept (comments, formatting, even a broken part elsewhere).
 */
function retitle(source: string, title: string): string {
  if (!HEADER.test(source)) throw new Error('The document has no `arch "Title" v0.1` header to rename. Fix it with update_project.');
  const next = source.replace(HEADER, (_, lead: string) => `${lead}${quote(title)}`);
  if (parse(next).doc.title !== title) throw new Error("Couldn't rename the document's header. Rename it with update_project.");
  return next;
}

const cleanTitle = (title: string): string => {
  const t = title.trim();
  if (t === "") throw new Error("The title can't be empty.");
  if (/[\r\n]/.test(t)) throw new Error("The title must be one line.");
  return t;
};

/** A stored source parsed, refusing when a syntax error means parsing would lose part of it. */
const parseWhole = (source: string, doing: string): ArchDoc => {
  const parsed = parse(source);
  const syntax = parsed.diagnostics.find((d) => d.code === "E001");
  if (syntax)
    throw new Error(
      `The document has a syntax error (line ${syntax.span?.start.line ?? "?"}: ${syntax.message}), so ${doing} would lose part of it. Fix it with update_project first.`,
    );
  return parsed.doc;
};

/** A project's source, or the source passed in (tools that take either). */
async function sourceOf(args: { source?: string; project_id?: string }): Promise<string> {
  if (args.source !== undefined) return args.source;
  if (!args.project_id) throw new Error("Pass either source or project_id.");
  const doc = await db.getProject(await requireWorkspace(), args.project_id);
  if (!doc) throw new Error(`No project with id ${args.project_id}.`);
  return doc.source;
}

/**
 * Register Archer's resources and tools on a server. Nothing is registered at
 * import time: the hosted HTTP route (remote.ts) builds a fresh McpServer per
 * request and calls this with the app's `host` (host.ts): GitHub, image
 * rendering and the user's email. Every call carries an OAuth-verified user id.
 */
export function registerArcherTools(server: McpServer, host: ArcherHost = NO_HOST): void {
  // --- documentation ----------------------------------------------------------

  server.registerResource(
    "guide",
    "archer://guide",
    {
      title: "Archer agent guide",
      description: "Complete guide to Archer and this server: workflows, validation, the language spec.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }],
    }),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get the Archer guide",
      description: `${BRIEF}\n\nReturns the complete agent guide: the mental model, workflows, how validation gates writes, layout rules, error codes, writing advice and the full language specification. CALL THIS ONCE BEFORE YOUR FIRST WRITE in a session: everything else here assumes you know the language. Also the resource archer://guide.`,
      inputSchema: {},
    },
    wrap(async () => text(GUIDE)),
  );

  // --- worked examples (the docs' /language/examples) -------------------------

  for (const e of EXAMPLES)
    server.registerResource(
      `example-${e.slug}`,
      `archer://examples/${e.slug}`,
      { title: `Example: ${e.title}`, description: e.summary, mimeType: "text/plain" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: e.source }] }),
    );

  server.registerTool(
    "list_examples",
    {
      title: "List the worked examples",
      description:
        "List the worked examples from Archer's docs: complete, valid documents that each show a few language features. Returns slug, title, summary, features and two links for the user: docs_url (its docs section) and sandbox_url (opens it in the editor with no account; nothing is saved). Read one with get_example or the resource archer://examples/<slug>.",
      inputSchema: {},
    },
    wrap(async () => text(EXAMPLES.map(exampleInfo))),
  );

  server.registerTool(
    "get_example",
    {
      title: "Read a worked example",
      description:
        "One of the docs' worked examples in full: its list_examples entry plus the canonical source. Read one to see idiomatic Archer before writing, to show the user how something is done, or pass the source to create_project for an editable copy. A trailing layout block is hand arrangement: leave it out of documents you write.",
      inputSchema: {
        slug: z
          .enum(EXAMPLES.map((e) => e.slug) as [string, ...string[]])
          .describe("Which example; list_examples describes each"),
      },
    },
    wrap(async ({ slug }) => {
      const e = findExample(slug);
      if (!e) throw new Error(`No example '${slug}'. Use list_examples.`);
      return text({ ...exampleInfo(e), source: e.source });
    }),
  );

  // --- samples (the dashboard's "From sample" gallery) ------------------------

  for (const s of SAMPLES)
    server.registerResource(
      `sample-${s.slug}`,
      `archer://samples/${s.slug}`,
      { title: `Sample: ${s.title}`, description: s.description, mimeType: "text/plain" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: s.source }] }),
    );

  server.registerTool(
    "list_samples",
    {
      title: "List the starter samples",
      description:
        "List the app's \"From sample\" gallery: realistic architectures to start a project from (examples teach features; samples are starting points). To start from one, read it with get_sample and pass its source to create_project, as the gallery does. Also the resources archer://samples/<slug>.",
      inputSchema: {},
    },
    wrap(async () => text(SAMPLES.map(sampleInfo))),
  );

  server.registerTool(
    "get_sample",
    {
      title: "Read a starter sample",
      description:
        "One \"From sample\" sample in full: its list_samples entry plus the canonical source. Pass the source to create_project to start a project from it.",
      inputSchema: {
        slug: z
          .enum(SAMPLES.map((s) => s.slug) as [string, ...string[]])
          .describe("Which sample; list_samples describes each"),
      },
    },
    wrap(async ({ slug }) => {
      const s = findSample(slug);
      if (!s) throw new Error(`No sample '${slug}'. Use list_samples.`);
      return text({ ...sampleInfo(s), source: s.source });
    }),
  );

  // --- stateless language tools ----------------------------------------------

  server.registerTool(
    "validate_source",
    {
      title: "Validate Archer source",
      description:
        "Validate Archer source WITHOUT saving: { valid, errors, warnings } with codes and line numbers. Use it to check work in progress before create_project/update_project, or to explain why a document is invalid. Errors block writes; warnings never do. Knows the catalog and this workspace's custom types.",
      inputSchema: { source: z.string().describe("Full Archer document text") },
    },
    wrap(async ({ source }) => {
      const a = await analyze(source, await optionalWorkspace());
      return text({
        valid: a.errors.length === 0,
        errors: diagnosticsReport(a.errors),
        warnings: diagnosticsReport(a.warnings),
      });
    }),
  );

  server.registerTool(
    "format_source",
    {
      title: "Format Archer source",
      description:
        "The canonical form of Archer source (fixed section order, sorted connections, normalized whitespace), saving nothing; the source only needs to parse. The app stores canonical form, so diff your changes against this.",
      inputSchema: { source: z.string().describe("Full Archer document text") },
    },
    wrap(async ({ source }) => text(format(parse(source).doc))),
  );

  server.registerTool(
    "compile_for_agent",
    {
      title: "Compile an implementation spec",
      description:
        "The implementation spec for a coding agent (the editor's Copy for agent): canonical source without the layout block, after a short reading guide. Pass source OR project_id. Fails if the document has validation errors.",
      inputSchema: {
        source: z.string().optional().describe("Archer source (omit when passing project_id)"),
        project_id: z.string().optional().describe("Stored project to compile (omit when passing source)"),
      },
    },
    wrap(async (args) => {
      const src = await sourceOf(args);
      const a = await analyze(src, await optionalWorkspace());
      if (a.errors.length > 0)
        return fail({
          message: "Document has validation errors; fix them before compiling.",
          errors: diagnosticsReport(a.errors),
        });
      return text(compileForAgent(a.doc));
    }),
  );

  server.registerTool(
    "auto_layout_source",
    {
      title: "Auto-layout Archer source",
      description:
        "Complete or rebuild the layout block of raw source, saving nothing. Existing positions are kept and new components placed next to what they connect to; with no positions (or reset=true) everything is arranged from scratch. Rarely needed, since create_project/update_project lay out for you, but useful to preview or fully re-arrange.",
      inputSchema: {
        source: z.string().describe("Full Archer document text"),
        reset: z.boolean().optional().describe("Discard existing positions and re-place everything (default false)"),
      },
    },
    wrap(async ({ source, reset }) => {
      const doc = parse(source).doc;
      return text(format(autoLayout(doc, { reset })));
    }),
  );

  // --- catalog & custom types -------------------------------------------------

  server.registerTool(
    "list_types",
    {
      title: "List component & connection types",
      description:
        "List usable type tags: the built-in catalog (~350: vendor-neutral building blocks like @load_balancer, @queue, @database and AI ones like @llm, @agent, @mcp, @rag; plus real technologies like @postgres, @aws.sqs), this workspace's custom types, connection types (@http, @sql, @queue…) and the glyphs for custom types. `search` filters by tag, name or namespace. Tags are optional: untyped components render as generic boxes, and an unknown tag is only a warning.",
      inputSchema: {
        search: z.string().optional().describe("Case-insensitive filter on tag, name, or namespace"),
      },
    },
    wrap(async ({ search }) => {
      const q = search?.toLowerCase().trim() ?? "";
      const match = (t: { tag: string; name: string; namespace?: string }) =>
        q === "" ||
        t.tag.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.namespace ?? "").includes(q);
      const ws = await optionalWorkspace();
      const custom = ws ? await db.listCustomTypes(ws) : [];
      return text({
        catalog: CATALOG.filter(match).map(({ tag, name, namespace }) => ({ tag, name, namespace })),
        custom_types: custom.filter(match),
        connection_types: CONNECTION_TYPES,
        glyphs_for_custom_types: Object.keys(GLYPHS),
        note: ws
          ? undefined
          : "The backend is unreachable — custom types not listed. See get_workspace_info.",
      } satisfies TypeList);
    }),
  );

  server.registerTool(
    "create_custom_type",
    {
      title: "Create/update a custom component type",
      description:
        "Add a component type to the workspace's library (the palette's '+'), when the catalog lacks a technology or the user has domain-specific blocks (e.g. 'Billing Engine'). It gets a @custom.<slug> tag, appears in the palette, renders with its glyph and color, and validates in every project of the workspace. The same tag again updates it.",
      inputSchema: {
        name: z.string().min(1).describe("Display name, e.g. 'Billing Engine'"),
        glyph: z.string().optional().describe("Glyph key from list_types (default 'box')"),
        color: z.string().optional().describe("Hex accent color like #6366f1 (default slate)"),
        tag: z.string().optional().describe("Override tag; 'custom.' prefix is enforced. Default: custom.<slug of name>"),
      },
    },
    wrap(async ({ name, glyph, color, tag }) => {
      const ws = await requireWorkspace();
      const g = glyph ?? "box";
      if (!(g in GLYPHS))
        throw new Error(`Unknown glyph '${g}'. Valid: ${Object.keys(GLYPHS).join(", ")}`);
      const c = color ?? "#64748b";
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error(`Color must be #rrggbb, got '${c}'.`);
      const slug = (tag ?? name)
        .toLowerCase()
        .replace(/^custom\./, "")
        .replace(/[^a-z0-9.]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^[0-9]+/, "");
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(slug))
        throw new Error(`Cannot derive a valid tag from '${tag ?? name}'.`);
      const fullTag = `custom.${slug}`;
      await db.saveCustomType(ws, { tag: fullTag, name: name.trim(), color: c, glyph: g });
      return text({ created: fullTag, usage: `component my_id "${name.trim()}" @${fullTag}` });
    }),
  );

  server.registerTool(
    "delete_custom_type",
    {
      title: "Delete a custom component type",
      description:
        "Remove a custom type from the workspace library. Components using its tag stay valid but render generic, with a W301 warning. Catalog types can't be deleted.",
      inputSchema: { tag: z.string().describe("The @custom.* tag (without @)") },
    },
    wrap(async ({ tag }) => {
      if (!tag.startsWith("custom."))
        throw new Error("Only custom.* types can be deleted.");
      await db.deleteCustomType(await requireWorkspace(), tag);
      return text({ deleted: tag });
    }),
  );

  // --- projects ---------------------------------------------------------------

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Every project in the current workspace: id, title, last update, editor URL, and its GitHub repository (with `path` if stored in a .arch file there). Start here whenever the user refers to an existing architecture.",
      inputSchema: {},
    },
    wrap(async () => {
      const ws = await requireWorkspace();
      const projects = await db.listProjects(ws);
      return text(
        projects.map((p): ProjectListItem => ({
          id: p._id,
          title: p.title,
          updated: new Date(p.updatedAt).toISOString(),
          editor_url: editorUrl(p._id),
          repository: p.repo
            ? {
                full_name: `${p.repo.owner}/${p.repo.name}`,
                branch: p.repo.branch,
                ...(p.repo.path ? { path: p.repo.path } : {}),
              }
            : null,
        })),
      );
    }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Read a project",
      description:
        "A project's full Archer source, with its diagnostics, drift summary, share link and repository. ALWAYS call this before update_project and edit the exact source returned: updates replace the whole document. `src` paths point into the codebase. The trailing layout block is presentation: leave it out of your edits (the server keeps it). If `repository.path` is set, the project is stored in that .arch file (`repository.sync` has its state): when working in that repository, edit the file instead of calling update_project.",
      inputSchema: { project_id: z.string() },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      const doc = await db.getProject(ws, project_id);
      if (!doc) throw new Error(`No project with id ${project_id}. Use list_projects.`);
      const [a, drift] = await Promise.all([analyze(doc.source, ws), db.getDrift(ws, project_id)]);
      return text({
        id: project_id,
        title: doc.title,
        editor_url: editorUrl(project_id),
        valid: a.errors.length === 0,
        errors: diagnosticsReport(a.errors),
        warnings: diagnosticsReport(a.warnings),
        drift: drift ? { reported_at: iso(drift.reportedAt), findings_count: drift.findings.length } : null,
        share_url: doc.publicSlug ? shareLinks(doc.publicSlug).url : null,
        repository: repositoryView(doc),
        source: doc.source,
      } satisfies ProjectRead);
    }),
  );

  server.registerTool(
    "link_repository",
    {
      title: "Link the project to a GitHub repository",
      description:
        "Record which GitHub repository (and branch) a project describes, like Link repository in the app. The app then shows the repo's commits next to revisions (list_github_commits), `src` paths link into it, and drift checks are against that branch. Use it when the user says which repo a project belongs to. repository: null unlinks (a stored project also stops syncing). To store the project in a file there, use move_to_github.",
      inputSchema: {
        project_id: z.string(),
        repository: z
          .union([
            z.object({
              full_name: z.string().describe("owner/name, e.g. acme/platform"),
              branch: z.string().optional().describe("Branch to track (default main)"),
            }),
            z.null(),
          ])
          .describe("The repository to link, or null to unlink"),
      },
    },
    wrap(async ({ project_id, repository }) => {
      const ws = await requireWorkspace();
      const existing = await db.getProject(ws, project_id);
      if (!existing) throw new Error(`No project with id ${project_id}.`);
      if (repository === null) {
        await db.setRepo(ws, project_id, null);
        return text({ id: project_id, repository: null, unlinked: true });
      }
      const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(repository.full_name.trim());
      if (!m) throw new Error("full_name must look like owner/name.");
      const link = await db.setRepo(ws, project_id, {
        owner: m[1]!,
        name: m[2]!,
        branch: repository.branch?.trim() || "main",
      });
      return text({
        id: project_id,
        repository: link ? { full_name: `${link.owner}/${link.name}`, branch: link.branch } : null,
        note: "Commits from this repository now appear in the human's History panel next to your revisions.",
      });
    }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create a project",
      description:
        "Create a project from source. Any ERROR (syntax, unresolved endpoint, invalid payload, duplicate id) REJECTS the write with the diagnostics: fix and retry. On success the source is laid out, canonicalized and saved, and the result has the id and an editor URL for the user. Write semantic content only (no layout block). Minimum document: 'arch \"Title\" v0.1'.",
      inputSchema: {
        source: z.string().describe("Full Archer document text (see get_guide for the language)"),
        summary: z.string().max(200).optional().describe("One line on what you changed, for the user's activity feed. Always give one."),
      },
    },
    wrap(async ({ source, summary }) => {
      const ws = await requireWorkspace();
      const prep = await prepareWrite(source, ws);
      if (!prep.ok)
        return fail({
          message: "REJECTED — fix these errors and retry.",
          errors: diagnosticsReport(prep.errors),
          warnings: diagnosticsReport(prep.warnings),
        } satisfies WriteRejected);
      const id = await db.createProject(ws, prep.title, prep.text, summary ?? "Created the project");
      return text({
        id,
        title: prep.title,
        editor_url: editorUrl(id),
        warnings: diagnosticsReport(prep.warnings),
      } satisfies ProjectCreated);
    }),
  );

  server.registerTool(
    "update_project",
    {
      title: "Update a project (full replace)",
      description:
        "Replace a project's document with new source. Same validation as create_project: errors REJECT the write (nothing saved) and come back for you to fix. Components that survive keep their canvas positions and new ones are placed, so omit the layout block. Open canvases update live. Always get_project first and edit that source: unrelated source silently discards the user's content.",
      inputSchema: {
        project_id: z.string(),
        source: z.string().describe("Complete replacement document text"),
        summary: z.string().max(200).optional().describe("One line on what you changed, for the user's activity feed. Always give one."),
      },
    },
    wrap(async ({ project_id, source, summary }) => {
      const ws = await requireWorkspace();
      const existing = await db.getProject(ws, project_id);
      if (!existing) throw new Error(`No project with id ${project_id}. Use list_projects.`);
      const prep = await prepareWrite(source, ws, existing.source);
      if (!prep.ok)
        return fail({
          message: "REJECTED — nothing was saved. Fix these errors and retry.",
          errors: diagnosticsReport(prep.errors),
          warnings: diagnosticsReport(prep.warnings),
        } satisfies WriteRejected);
      await db.updateProject(ws, project_id, prep.title, prep.text, summary);
      return text({
        id: project_id,
        title: prep.title,
        saved: true,
        attributed_to: agentName(),
        editor_url: editorUrl(project_id),
        warnings: diagnosticsReport(prep.warnings),
        ...draftNote(existing),
      } satisfies ProjectUpdated);
    }),
  );

  server.registerTool(
    "rename_project",
    {
      title: "Rename a project",
      description:
        "Change a project's title (Rename on the dashboard). Only the `arch \"…\"` header line changes; the rest of the source is untouched. Saved as a revision under your name.",
      inputSchema: {
        project_id: z.string(),
        title: z.string().min(1).max(200).describe("The new title"),
      },
    },
    wrap(async ({ project_id, title: raw }) => {
      const ws = await requireWorkspace();
      const existing = await requireProject(ws, project_id);
      const title = cleanTitle(raw);
      const previous = parse(existing.source).doc.title;
      if (previous === title && existing.title === title)
        return text({ id: project_id, title, previous_title: previous, saved: false, editor_url: editorUrl(project_id) });
      await db.updateProject(ws, project_id, title, retitle(existing.source, title), `Renamed the project to "${title}"`);
      return text({
        id: project_id,
        title,
        previous_title: previous,
        saved: true,
        editor_url: editorUrl(project_id),
        ...draftNote(existing),
      });
    }),
  );

  server.registerTool(
    "duplicate_project",
    {
      title: "Duplicate a project",
      description:
        "Copy a project, canvas arrangement included, into a new one in the same workspace (the dashboard's Duplicate), titled \"<title> copy\" unless you pass a title. The copy has its own history and isn't shared, linked or stored in a repository.",
      inputSchema: {
        project_id: z.string(),
        title: z.string().min(1).max(200).optional().describe("Title of the copy (default: the original's, plus \" copy\")"),
      },
    },
    wrap(async ({ project_id, title: raw }) => {
      const ws = await requireWorkspace();
      const original = await requireProject(ws, project_id);
      const title = cleanTitle(raw ?? `${original.title} copy`);
      const id = await db.createProject(ws, title, retitle(original.source, title), `Duplicated "${original.title}"`);
      return text({ id, title, editor_url: editorUrl(id), copied_from: project_id });
    }),
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete a project",
      description:
        "Permanently delete a project. Irreversible — there is no trash. Requires confirm=true, and you should only call this when the user explicitly asked for deletion of this specific project.",
      inputSchema: {
        project_id: z.string(),
        confirm: z.literal(true).describe("Must be true; acknowledges permanent deletion"),
      },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      const existing = await db.getProject(ws, project_id);
      if (!existing) throw new Error(`No project with id ${project_id}.`);
      await db.deleteProject(ws, project_id);
      return text({ deleted: project_id, title: existing.title });
    }),
  );

  // --- presentation -----------------------------------------------------------

  server.registerTool(
    "set_display",
    {
      title: "Collapse/expand a container",
      description:
        "Collapse or expand a container on the canvas: 'plane' shows its children inside it; 'icon' shows a single box (children hidden, their connections drawn to it). The architecture is untouched. Saves immediately.",
      inputSchema: {
        project_id: z.string(),
        path: z.string().describe("Dot-path of the container, e.g. 'backend' or 'backend.api'"),
        display: z.enum(["plane", "icon"]),
      },
    },
    wrap(async ({ project_id, path, display }) => {
      const ws = await requireWorkspace();
      const existing = await db.getProject(ws, project_id);
      if (!existing) throw new Error(`No project with id ${project_id}.`);
      const doc = parse(existing.source).doc;
      const next = format(autoLayout(setDisplay(doc, path.split("."), display)));
      await db.updateProject(
        ws, project_id, doc.title, next,
        `${display === "icon" ? "Collapsed" : "Expanded"} ${path} to ${display}`,
      );
      return text({ id: project_id, path, display, saved: true });
    }),
  );

  server.registerTool(
    "move_components",
    {
      title: "Move or resize components on the canvas",
      description:
        "Move or resize components on the canvas, like dragging them: set each one's `at` [column, row] and/or `size` in grid cells. Inside a container, positions are relative to it and it grows to fit. Nothing else moves and the architecture is untouched. For a tidy-up, use auto_layout_project.",
      inputSchema: {
        project_id: z.string(),
        moves: z
          .array(
            z.object({
              path: z.string().describe("Dot-path of the component, e.g. 'backend.api'"),
              at: z.array(z.number().int()).length(2).optional().describe("New position: [column, row]"),
              size: z.array(z.number().int().min(2)).length(2).optional().describe("New size: [width, height], at least 2 × 2"),
            }),
          )
          .min(1)
          .max(200)
          .describe("One entry per component; each needs `at`, `size` or both"),
      },
    },
    wrap(async ({ project_id, moves }) => {
      const ws = await requireWorkspace();
      const existing = await requireProject(ws, project_id);
      let doc = autoLayout(parseWhole(existing.source, "moving components"));
      const paths = componentPaths(doc);
      const problems = moves.flatMap((m, i) =>
        !paths.has(m.path)
          ? [`moves[${i}]: no component at '${m.path}'`]
          : !m.at && !m.size
            ? [`moves[${i}]: give 'at', 'size' or both`]
            : [],
      );
      if (problems.length) throw new Error(`Nothing moved:\n${problems.join("\n")}`);
      for (const m of moves) {
        const segs = m.path.split(".");
        if (m.size) doc = resizeComponent(doc, segs, [m.size[0]!, m.size[1]!]);
        if (m.at) doc = moveComponent(doc, segs, [m.at[0]!, m.at[1]!]);
      }
      const next = format(doc);
      const resized = moves.some((m) => m.size);
      const n = moves.length;
      await db.updateProject(
        ws, project_id, doc.title, next,
        `${resized ? "Arranged" : "Moved"} ${n === 1 ? moves[0]!.path : `${n} components`} on the canvas`,
      );
      const placed = layoutMap(doc);
      return text({
        id: project_id,
        placed: moves.map((m) => ({ path: m.path, at: placed.get(m.path)?.at, size: placed.get(m.path)?.size })),
        saved: next !== existing.source,
      });
    }),
  );

  server.registerTool(
    "auto_layout_project",
    {
      title: "Re-arrange a project's canvas",
      description:
        "Re-arrange a project's canvas and save. By default only components without a position are placed. reset=true discards ALL positions and re-arranges everything (collapsed state is kept): only when the user asks for a tidy-up, since it destroys their arrangement. `paths` re-arranges just those components and what's inside them (the editor's Re-layout selection).",
      inputSchema: {
        project_id: z.string(),
        reset: z.boolean().optional(),
        paths: z
          .array(z.string())
          .min(1)
          .optional()
          .describe("Re-arrange only these components (dot-paths) and what's inside them; not with reset"),
      },
    },
    wrap(async ({ project_id, reset, paths }) => {
      const ws = await requireWorkspace();
      const existing = await db.getProject(ws, project_id);
      if (!existing) throw new Error(`No project with id ${project_id}.`);
      if (paths && reset) throw new Error("Pass either paths or reset, not both.");
      if (paths) {
        const doc = parseWhole(existing.source, "re-arranging it");
        const known = componentPaths(doc);
        const unknown = paths.filter((p) => !known.has(p));
        if (unknown.length) throw new Error(`No component at ${unknown.map((p) => `'${p}'`).join(", ")}.`);
        const next = format(relayoutComponents(doc, paths.map((p) => p.split("."))));
        await db.updateProject(
          ws, project_id, doc.title, next,
          `Re-arranged ${paths.length === 1 ? paths[0] : `${paths.length} components`}`,
        );
        return text({ id: project_id, reset: false, paths, saved: true });
      }
      const doc = parse(existing.source).doc;
      const next = format(autoLayout(doc, { reset }));
      await db.updateProject(
        ws, project_id, doc.title, next,
        reset ? "Re-arranged the canvas" : "Placed unpositioned components",
      );
      return text({ id: project_id, reset: reset ?? false, saved: true });
    }),
  );

  // --- history ----------------------------------------------------------------

  server.registerTool(
    "get_history",
    {
      title: "Project history",
      description:
        "A project's revisions, newest first: who saved (the user, an agent by client name, or a commit to the project's repository file), when, their one-line summary, counts of what changed, and whether the user has reviewed it. The user sees the same feed, so always give writes a `summary`. Use it to see what happened since you last looked, or to find revision ids for get_revision, diff_project and restore_revision.",
      inputSchema: {
        project_id: z.string(),
        limit: z.number().int().min(1).max(200).optional().describe("Max revisions to return (default 20)"),
      },
    },
    wrap(async ({ project_id, limit }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const n = limit ?? 20;
      // Fetch one extra so the oldest returned entry can be diffed too.
      const rows = await db.listRevisions(ws, project_id, n + 1);
      const shown = rows.slice(0, n);
      return text(
        shown.map((r, i) => {
          const prev = rows[i + 1];
          return { ...revisionView(r, prev ? parse(prev.source).doc : null), reviewed: reviewed(r, project.seenRevisionAt) };
        }),
      );
    }),
  );

  server.registerTool(
    "get_revision",
    {
      title: "Read a past revision",
      description:
        "Fetch the full Archer source of one historical revision (ids come from get_history). Read-only: to roll a project back to it, use restore_revision.",
      inputSchema: { revision_id: z.string() },
    },
    wrap(async ({ revision_id }) => {
      const ws = await requireWorkspace();
      const r = await db.getRevision(ws, revision_id);
      if (!r) throw new Error(`No revision with id ${revision_id}. Use get_history.`);
      return text({
        revision_id: r._id,
        project_id: r.documentId,
        created_at: iso(r.createdAt),
        author: r.author,
        summary: r.summary,
        source: r.source,
      });
    }),
  );

  server.registerTool(
    "restore_revision",
    {
      title: "Restore a past revision",
      description:
        "Roll a project back to a revision from get_history (History's Restore): it becomes exactly that version, canvas arrangement included. Nothing is lost: the current version stays in the history, and the restore is a new revision. Only when the user asks.",
      inputSchema: {
        project_id: z.string(),
        revision_id: z.string(),
        summary: z.string().max(200).optional().describe("One line for the activity feed (default: which version was restored)"),
      },
    },
    wrap(async ({ project_id, revision_id, summary }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const r = await db.getRevision(ws, revision_id);
      if (!r || r.documentId !== project_id)
        throw new Error(`No revision with id ${revision_id} in this project. Use get_history.`);
      const changed = project.source !== r.source || project.title !== r.title;
      if (changed)
        await db.updateProject(ws, project_id, r.title, r.source, summary ?? `Restored the version from ${iso(r.createdAt)}`);
      return text({
        id: project_id,
        title: r.title,
        restored_from: r._id,
        saved: changed,
        editor_url: editorUrl(project_id),
        ...(changed ? draftNote(project) : { note: "The project already matches that revision; nothing changed." }),
      });
    }),
  );

  server.registerTool(
    "diff_project",
    {
      title: "Diff two versions",
      description:
        "Structured diff between two versions of a project: components added/removed/changed (with which fields), connections, title. Layout moves don't count. By default, the latest change (the current document vs. the revision before it). Pass revision ids from get_history for any two points, or `compare`: 'since_review' (what the user hasn't reviewed yet), 'unpublished' (a repository-stored project's draft vs. its file: what publish_to_github would write) or 'incoming' (the file's conflicting version vs. the draft).",
      inputSchema: {
        project_id: z.string(),
        from_revision_id: z.string().optional().describe("Older revision (default: the one just before `to`)"),
        to_revision_id: z.string().optional().describe("Newer revision (default: the current document)"),
        compare: z
          .enum(["since_review", "unpublished", "incoming"])
          .optional()
          .describe("Instead of revision ids: since_review, unpublished or incoming"),
      },
    },
    wrap(async ({ project_id, from_revision_id, to_revision_id, compare }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const emptyOf = (source: string) => format(emptyLike(parse(source).doc));

      let from: { label: string; source: string };
      let to: { label: string; source: string };
      if (compare) {
        if (from_revision_id || to_revision_id) throw new Error("Pass either compare or revision ids, not both.");
        const current = { label: "current", source: project.source };
        const f = project.repo?.path ? project.repo : null;
        if (compare === "since_review") {
          const base = await db.reviewBaseline(ws, project_id);
          from = base ? { label: base._id, source: base.source } : { label: "empty", source: emptyOf(project.source) };
          to = current;
        } else if (compare === "unpublished") {
          if (!f) throw new Error("This project isn't stored in a repository file, so it has nothing to publish. See move_to_github.");
          from = f.base ? { label: "repository", source: f.base.source } : { label: "empty", source: emptyOf(project.source) };
          to = current;
        } else {
          if (!f?.incoming?.source)
            throw new Error("No conflicting version of the repository file is waiting. sync_with_github checks for one.");
          from = current;
          to = { label: "incoming", source: f.incoming.source };
        }
      } else {
        const revisions = await db.listRevisions(ws, project_id, 200);
        const byId = new Map(revisions.map((r) => [r._id, r]));
        const pick = (id: string) => {
          const r = byId.get(id);
          if (!r) throw new Error(`No revision with id ${id} in this project. Use get_history.`);
          return r;
        };

        let toIndex: number; // index in `revisions` of the newest revision at/before `to`
        if (to_revision_id) {
          const r = pick(to_revision_id);
          to = { label: r._id, source: r.source };
          toIndex = revisions.findIndex((x) => x._id === r._id);
        } else {
          to = { label: "current", source: project.source };
          // If the stored document equals the newest revision, "before" is the one after it.
          toIndex = revisions[0] && revisions[0].source === project.source ? 0 : -1;
        }

        if (from_revision_id) {
          const r = pick(from_revision_id);
          from = { label: r._id, source: r.source };
        } else {
          const prev = revisions[toIndex + 1];
          from = prev ? { label: prev._id, source: prev.source } : { label: "empty", source: emptyOf(to.source) };
        }
      }

      const diff = diffDocs(parse(from.source).doc, parse(to.source).doc);
      const summary = summarizeDiff(diff);
      return text({
        from: from.label,
        to: to.label,
        description: describeSummary(summary),
        summary,
        diff,
      });
    }),
  );

  server.registerTool(
    "mark_reviewed",
    {
      title: "Mark changes as reviewed",
      description:
        "Mark every change to a project by agents or commits as reviewed (the editor's Mark reviewed), clearing the \"changed\" highlights for everyone. Only when the user says they've seen the changes or asks you to clear them; diff_project with compare: 'since_review' shows them.",
      inputSchema: { project_id: z.string() },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const revisions = await db.listRevisions(ws, project_id, 200);
      const unreviewed = revisions.filter((r) => !reviewed(r, project.seenRevisionAt));
      await db.markSeen(ws, project_id);
      return text({ id: project_id, marked_reviewed: unreviewed.length });
    }),
  );

  // --- sharing and export ------------------------------------------------------

  server.registerTool(
    "share_project",
    {
      title: "Share a project by link",
      description:
        "Turn \"anyone with the link can view\" on or off (the Share dialog). On returns the public link (read-only canvas and code, no sign-in), a live SVG image and README embed Markdown. Off kills the link; turning it on again makes a new one. Only when the user asks: anyone with the link can read the whole architecture.",
      inputSchema: {
        project_id: z.string(),
        enabled: z.boolean().describe("true: anyone with the link can view; false: turn the link off"),
      },
    },
    wrap(async ({ project_id, enabled }) => {
      const ws = await requireWorkspace();
      await requireProject(ws, project_id);
      const slug = await db.setPublic(ws, project_id, enabled);
      return text(slug ? { id: project_id, shared: true, ...shareLinks(slug) } : { id: project_id, shared: false });
    }),
  );

  server.registerTool(
    "get_shared_project",
    {
      title: "Read a shared project",
      description:
        "Read a project from a share link someone gave you (https://…/share/<slug>): its title, full source and repository, in any workspace. Stops working when its owner turns sharing off.",
      inputSchema: {
        link: z.string().min(1).describe("The share link, or just its slug"),
      },
    },
    wrap(async ({ link }) => {
      const m = /\/(?:share|s)\/([A-Za-z0-9_-]+)/.exec(link) ?? /^\s*([A-Za-z0-9_-]{8,})\s*$/.exec(link);
      if (!m) throw new Error("That isn't a share link: they look like https://…/share/<slug>.");
      const doc = await db.getPublic(m[1]!);
      if (!doc) throw new Error("Nothing is shared at that link: it was never shared, or its owner turned sharing off.");
      return text({
        project_id: doc._id,
        title: doc.title,
        updated: iso(doc.updatedAt),
        url: shareLinks(m[1]!).url,
        repository: doc.repo
          ? {
              full_name: `${doc.repo.owner}/${doc.repo.name}`,
              branch: doc.repo.branch,
              ...(doc.repo.path ? { path: doc.repo.path } : {}),
            }
          : null,
        source: doc.source,
      });
    }),
  );

  server.registerTool(
    "render_diagram",
    {
      title: "Get a link to a diagram image",
      description:
        "A link to an SVG image of a project's canvas, not the image itself (a big diagram's SVG runs to tens of thousands of tokens). Download it (e.g. `curl -o architecture.svg <url>`) or give it to the user. It works for an hour for anyone who has it, and draws the project as it is when opened. For a permanent image, use share_project.",
      inputSchema: {
        project_id: z.string(),
        theme: z.enum(["light", "dark"]).optional().describe("Default light"),
      },
    },
    wrap(async ({ project_id, theme }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const syntax = parse(project.source).diagnostics.filter((d) => d.code === "E001");
      if (syntax.length > 0)
        return fail({ message: "The project has syntax errors, so it can't be drawn. Fix them first.", errors: diagnosticsReport(syntax) });
      const t = theme ?? "light";
      const link = host.imageLink(caller().userId, { workspaceId: ws.workspaceId, documentId: project_id, theme: t });
      return text({ project_id, theme: t, url: `${APP_URL}${link.path}`, expires_at: iso(link.expiresAt) });
    }),
  );

  // --- drift ------------------------------------------------------------------

  const findingSchema = z.object({
    status: z.enum(["missing", "changed", "extra"]).describe("missing = declared but no implementation found; changed = implementation differs from desc/payloads; extra = exists in code but not in the document"),
    path: z.string().optional().describe("Dot-path of the component (required for missing/changed)"),
    name: z.string().optional().describe("Suggested display name for an undeclared part (required for extra)"),
    src: z.string().optional().describe("Where in the code you looked / found it (repo path or URL)"),
    note: z.string().max(1000).optional().describe("What differs, in one or two sentences"),
  });

  server.registerTool(
    "report_drift",
    {
      title: "Report code ↔ architecture drift",
      description:
        "Record a drift check: after comparing each component with the code (via its `src` or by searching the repo), send one finding per discrepancy. The report REPLACES the previous one, and an EMPTY list means 'in sync': send it too, so the user sees a green state. Findings show as badges on the canvas, and 'extra' ones can be added to the document in one click. Don't modify the document during a drift check unless asked.",
      inputSchema: {
        project_id: z.string(),
        findings: z.array(findingSchema),
      },
    },
    wrap(async ({ project_id, findings }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const paths = componentPaths(parse(project.source).doc);
      const problems: string[] = [];
      findings.forEach((f, i) => {
        if (f.status === "extra") {
          if (!f.name || f.name.trim() === "") problems.push(`findings[${i}]: 'extra' needs a name`);
        } else if (!f.path || !paths.has(f.path)) {
          problems.push(`findings[${i}]: '${f.status}' needs a path that exists (got '${f.path ?? ""}')`);
        }
      });
      if (problems.length) throw new Error(`Invalid findings — nothing recorded:\n${problems.join("\n")}`);
      const clean: DriftFinding[] = findings.map((f) => ({
        status: f.status,
        ...(f.path ? { path: f.path } : {}),
        ...(f.name ? { name: f.name.trim() } : {}),
        ...(f.src ? { src: f.src } : {}),
        ...(f.note ? { note: f.note } : {}),
      }));
      await db.reportDrift(ws, project_id, clean);
      const count = (s: DriftFinding["status"]) => clean.filter((f) => f.status === s).length;
      return text({
        project_id,
        reported_as: agentName(),
        in_sync: clean.length === 0,
        missing: count("missing"),
        changed: count("changed"),
        extra: count("extra"),
      });
    }),
  );

  server.registerTool(
    "get_drift",
    {
      title: "Read the latest drift report",
      description:
        "A project's latest drift report (who ran it, when, every finding), or report: null. Use it to pick up a previous check or see what's left to act on. A finding's position in `findings` is its index for dismiss_drift_finding.",
      inputSchema: { project_id: z.string() },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      await requireProject(ws, project_id);
      const r = await db.getDrift(ws, project_id);
      if (!r) return text({ report: null });
      return text({
        report: {
          reported_at: iso(r.reportedAt),
          author: r.author,
          in_sync: r.findings.length === 0,
          findings: r.findings,
        },
      });
    }),
  );

  server.registerTool(
    "dismiss_drift_finding",
    {
      title: "Dismiss a drift finding",
      description:
        "Drop one finding from the latest drift report (its × in the app), e.g. once the user has acted on it. `index` is its position in get_drift's findings; later ones move up, so dismiss several from the highest index down. When the last one goes, the report reads as in sync.",
      inputSchema: {
        project_id: z.string(),
        index: z.number().int().min(0).describe("Position of the finding in get_drift's findings, from 0"),
      },
    },
    wrap(async ({ project_id, index }) => {
      const ws = await requireWorkspace();
      await requireProject(ws, project_id);
      const r = await db.getDrift(ws, project_id);
      if (!r) throw new Error("This project has no drift report.");
      const finding = r.findings[index];
      if (!finding)
        throw new Error(`The report has ${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}: index must be below ${r.findings.length}.`);
      const remaining = r.findings.length - 1;
      await db.dismissDrift(ws, r._id, index);
      return text({ project_id, dismissed: finding, remaining });
    }),
  );

  server.registerTool(
    "clear_drift",
    {
      title: "Clear the drift report",
      description:
        "Delete a project's drift report (Clear in the Drift panel): the badges go, and the project reads as never checked. (report_drift with an empty list records 'in sync' instead.)",
      inputSchema: { project_id: z.string() },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      await requireProject(ws, project_id);
      await db.clearDrift(ws, project_id);
      return text({ project_id, cleared: true });
    }),
  );

  // --- workspace --------------------------------------------------------------

  server.registerTool(
    "get_workspace_info",
    {
      title: "Workspace status",
      description:
        "Who you're acting for and where: the user, the CURRENT workspace (see list_workspaces and use_workspace), your agent name, whether the backend is reachable, and project and custom-type counts. Call it first if a project tool errors.",
      inputSchema: {},
    },
    wrap(async () => {
      const ctx = caller();
      let reachable = false;
      let current: { id: string; name?: string; role?: string } = { id: ctx.userId };
      let projectCount: number | null = null;
      let customTypeCount: number | null = null;
      try {
        const ws = await currentWorkspace(ctx);
        const [all, projects, types] = await Promise.all([
          db.listWorkspaces(ctx.serviceKey),
          db.listProjects(ws),
          db.listCustomTypes(ws),
        ]);
        reachable = true;
        const found = all.find((w) => w.id === ws.workspaceId);
        current = { id: ws.workspaceId, name: found?.name, role: found?.role };
        projectCount = projects.length;
        customTypeCount = types.length;
      } catch {
        // reported via backend_reachable
      }
      return text({
        auth: "oauth",
        user_id: ctx.userId,
        workspace_id: current.id,
        workspace_name: current.name ?? null,
        workspace_role: current.role ?? null,
        agent_name: agentName(),
        convex_url: CONVEX_URL,
        app_url: APP_URL,
        backend_reachable: reachable,
        project_count: projectCount,
        custom_type_count: customTypeCount,
      } satisfies WorkspaceInfo);
    }),
  );

  /**
   * Bind invites addressed to the user's email to them, as signing in to the
   * app does: someone invited to a team who only ever uses agents would never
   * see it otherwise. Best effort.
   */
  const acceptPendingInvites = async (serviceKey: string, userId: string) => {
    try {
      const email = await host.userEmail(userId);
      if (email) await db.acceptInvites(serviceKey, email);
    } catch {
      // The app accepts them at the next sign-in too.
    }
  };

  server.registerTool(
    "list_workspaces",
    {
      title: "List the user's workspaces",
      description:
        "List the user's workspaces (Personal plus any team workspaces, each with their role: owner/editor write, viewer reads) and mark the current one, which every project tool acts on (default Personal). Invitations to the user's email are accepted first, as signing in to the app does. Call it when the user mentions a team or project you can't find, then switch with use_workspace.",
      inputSchema: {},
    },
    wrap(async () => {
      const ctx = caller();
      await acceptPendingInvites(ctx.serviceKey, ctx.userId);
      const [all, ws] = await Promise.all([db.listWorkspaces(ctx.serviceKey), currentWorkspace(ctx)]);
      return text({
        current_workspace_id: ws.workspaceId,
        workspaces: all.map((w) => ({
          id: w.id,
          name: w.name,
          kind: w.kind,
          role: w.role,
          current: w.id === ws.workspaceId,
        })),
      } satisfies WorkspaceList);
    }),
  );

  server.registerTool(
    "use_workspace",
    {
      title: "Switch the current workspace",
      description:
        "Make another of the user's workspaces current, so every project tool acts there. The choice is remembered for the user across sessions, agents and the CLI, so only switch when the user asks for (or clearly means) another workspace, and say which one you're in. Pass an id from list_workspaces (Personal's id is the user id).",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Workspace id from list_workspaces"),
      },
    },
    wrap(async ({ workspace_id }) => {
      const ctx = caller();
      const id = workspace_id.trim();
      await acceptPendingInvites(ctx.serviceKey, ctx.userId);
      const all = await db.listWorkspaces(ctx.serviceKey);
      const target = all.find((w) => w.id === id);
      if (!target)
        throw new Error(
          `The user is not a member of workspace '${id}'. Valid ids: ${all.map((w) => `${w.id} (${w.name})`).join(", ")}.`,
        );
      await db.setAgentWorkspace(ctx.serviceKey, id);
      const projects = await db
        .listProjects({ workspaceId: id, serviceKey: ctx.serviceKey })
        .catch(() => null);
      return text({
        current_workspace_id: id,
        name: target.name,
        kind: target.kind,
        role: target.role,
        visible_projects: projects?.length ?? null,
        ...(target.role === "viewer"
          ? { note: "The user is a viewer here: reads work, writes will be refused." }
          : {}),
      } satisfies WorkspaceSwitched);
    }),
  );

  registerTeamTools(server, host);

  // --- GitHub: projects stored in a repository file ----------------------------

  registerGitHubTools(server, host);
}
