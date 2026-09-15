#!/usr/bin/env tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  autoLayout,
  compileForAgent,
  componentPaths,
  diffDocs,
  format,
  parse,
  setDisplay,
  summarizeDiff,
  type ArchDoc,
  type DiffSummary,
} from "@archer/lang";
import { CATALOG, CONNECTION_TYPES, GLYPHS } from "@archer/catalog";
import {
  APP_URL,
  CONVEX_URL,
  NO_WORKSPACE_MESSAGE,
  agentName,
  analyze,
  db,
  formatDiagnostic,
  persistWorkspaceId,
  prepareWrite,
  resolveWorkspaceId,
  setClientName,
  type DriftFinding,
  type RevisionRow,
  type ThreadRow,
} from "./backend";
import { BRIEF, GUIDE } from "./guide";

const server = new McpServer({ name: "archer", version: "1.5.0" });

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});
const fail = (value: unknown) => ({ ...text(value), isError: true });

const requireWorkspace = (): string => {
  const id = resolveWorkspaceId();
  if (!id) throw new Error(NO_WORKSPACE_MESSAGE);
  return id;
};

const wrap =
  <A>(fn: (args: A) => Promise<ReturnType<typeof text>>) =>
  async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };

const diagnosticsReport = (ds: { severity: string }[] & Parameters<typeof formatDiagnostic>[0][]) =>
  ds.map(formatDiagnostic);

const iso = (ms: number) => new Date(ms).toISOString();

const threadView = (t: ThreadRow) => ({
  question_id: t._id,
  path: t.path,
  status: t.status,
  updated: iso(t.updatedAt),
  messages: t.messages.map((m) => ({
    author: m.author.kind === "user" ? "user" : (m.author.name ?? "agent"),
    text: m.text,
    at: iso(m.at),
  })),
});

const describeSummary = (s: DiffSummary): string => {
  const parts: string[] = [];
  if (s.added) parts.push(`+${s.added} component${s.added === 1 ? "" : "s"}`);
  if (s.removed) parts.push(`−${s.removed} removed`);
  if (s.changed) parts.push(`~${s.changed} changed`);
  if (s.connectionsAdded) parts.push(`+${s.connectionsAdded} connection${s.connectionsAdded === 1 ? "" : "s"}`);
  if (s.connectionsRemoved) parts.push(`−${s.connectionsRemoved} connection${s.connectionsRemoved === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "no architectural changes";
};

const revisionView = (r: RevisionRow, previous: ArchDoc | null) => {
  const doc = parse(r.source).doc;
  const summary = summarizeDiff(
    diffDocs(previous ?? { kind: "doc", title: doc.title, version: doc.version, components: [], connections: [], layout: [] }, doc),
  );
  return {
    revision_id: r._id,
    created_at: iso(r.createdAt),
    author: r.author,
    summary: r.summary,
    title: r.title,
    changes: summary,
    description: describeSummary(summary),
  };
};

const requireProject = async (workspaceId: string, projectId: string) => {
  const doc = await db.getProject(workspaceId, projectId);
  if (!doc) throw new Error(`No project with id ${projectId}. Use list_projects.`);
  return doc;
};

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
    description: `${BRIEF}\n\nReturns the complete agent guide: the mental model (project = one text document; canvas is a live render of it), standard read/modify/create workflows, how validation gates writes, layout rules, an error-code reference, writing advice with examples, and the full language specification. CALL THIS ONCE BEFORE YOUR FIRST WRITE in a session — everything else on this server assumes you know the language. Also available as the resource archer://guide.`,
    inputSchema: {},
  },
  wrap(async () => text(GUIDE)),
);

// --- stateless language tools ----------------------------------------------

server.registerTool(
  "validate_source",
  {
    title: "Validate Archer source",
    description:
      "Parse and validate an Archer document WITHOUT saving anything. Returns { valid, errors, warnings } with codes and line numbers (see the guide's error reference). Use this to check work-in-progress source before create_project/update_project, or to explain why a document is invalid. Errors block writes; warnings never do. Validation knows the built-in catalog AND this workspace's custom types.",
    inputSchema: { source: z.string().describe("Full Archer document text") },
  },
  wrap(async ({ source }) => {
    const a = await analyze(source, resolveWorkspaceId());
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
      "Return the canonical form of an Archer document (fixed section order, sorted connections, normalized indentation and fences). Does not save anything and does not require validity beyond being parseable. The app always stores canonical form, so diff your changes against this.",
    inputSchema: { source: z.string().describe("Full Archer document text") },
  },
  wrap(async ({ source }) => text(format(parse(source).doc))),
);

server.registerTool(
  "compile_for_agent",
  {
    title: "Compile an implementation spec",
    description:
      "Compile an Archer document into the agent-handoff form: canonical text with the layout block stripped and a short reading-guide preamble prepended. This is what you paste to a coding agent (or use yourself) as the implementation spec. Pass either raw source OR a project_id (loads the stored document). Fails if the document has validation errors.",
    inputSchema: {
      source: z.string().optional().describe("Archer source (omit when passing project_id)"),
      project_id: z.string().optional().describe("Stored project to compile (omit when passing source)"),
    },
  },
  wrap(async ({ source, project_id }) => {
    let src = source;
    if (src === undefined) {
      if (!project_id) throw new Error("Pass either source or project_id.");
      const doc = await db.getProject(requireWorkspace(), project_id);
      if (!doc) throw new Error(`No project with id ${project_id}.`);
      src = doc.source;
    }
    const a = await analyze(src, resolveWorkspaceId());
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
      "Complete or rebuild the layout block of a raw Archer document (no saving). Components without positions get deterministic grid placement (connection sources left of targets, planes sized to contain children); existing positions are kept unless reset=true. You rarely need this — create_project/update_project auto-layout for you — but it's useful to preview canonical output or fully re-arrange.",
    inputSchema: {
      source: z.string().describe("Full Archer document text"),
      reset: z.boolean().optional().describe("Discard existing positions and re-place everything (default false)"),
    },
  },
  wrap(async ({ source, reset }) => {
    const doc = parse(source).doc;
    return text(format(autoLayout(reset ? { ...doc, layout: [] } : doc)));
  }),
);

// --- catalog & custom types -------------------------------------------------

server.registerTool(
  "list_types",
  {
    title: "List component & connection types",
    description:
      "List usable type tags: the built-in technology catalog (~75 types across aws/gcp/azure/vercel/databases/infra/saas/generic), this workspace's custom types, the standard connection types (@http, @sql, @queue, ...), and the glyph names available when creating custom types. Optional search filters by tag/name/namespace. Type tags are OPTIONAL on components — untyped components are valid and render as generic boxes; unknown tags are only a warning.",
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
    const workspaceId = resolveWorkspaceId();
    const custom = workspaceId ? await db.listCustomTypes(workspaceId) : [];
    return text({
      catalog: CATALOG.filter(match).map(({ tag, name, namespace }) => ({ tag, name, namespace })),
      custom_types: custom.filter(match),
      connection_types: CONNECTION_TYPES,
      glyphs_for_custom_types: Object.keys(GLYPHS),
      note: workspaceId
        ? undefined
        : "No workspace configured — custom types not listed. See get_workspace_info.",
    });
  }),
);

server.registerTool(
  "create_custom_type",
  {
    title: "Create/update a custom component type",
    description:
      "Add a reusable component type to this workspace's library — exactly like a human clicking '+' in the app's palette. Use when the catalog lacks a technology or the user has domain-specific building blocks (e.g. 'Billing Engine'). The type gets a @custom.<slug> tag, appears in the human's palette immediately, renders with the chosen glyph/color, and validates cleanly in every project of the workspace. Calling it again with the same tag updates name/glyph/color.",
    inputSchema: {
      name: z.string().min(1).describe("Display name, e.g. 'Billing Engine'"),
      glyph: z.string().optional().describe("Glyph key from list_types (default 'box')"),
      color: z.string().optional().describe("Hex accent color like #6366f1 (default slate)"),
      tag: z.string().optional().describe("Override tag; 'custom.' prefix is enforced. Default: custom.<slug of name>"),
    },
  },
  wrap(async ({ name, glyph, color, tag }) => {
    const workspaceId = requireWorkspace();
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
    await db.saveCustomType(workspaceId, { tag: fullTag, name: name.trim(), color: c, glyph: g });
    return text({ created: fullTag, usage: `component my_id "${name.trim()}" @${fullTag}` });
  }),
);

server.registerTool(
  "delete_custom_type",
  {
    title: "Delete a custom component type",
    description:
      "Remove a custom type from the workspace library. Existing components using the tag stay valid but start showing a W301 unknown-type warning and render generic. Built-in catalog types cannot be deleted.",
    inputSchema: { tag: z.string().describe("The @custom.* tag (without @)") },
  },
  wrap(async ({ tag }) => {
    if (!tag.startsWith("custom."))
      throw new Error("Only custom.* types can be deleted.");
    await db.deleteCustomType(requireWorkspace(), tag);
    return text({ deleted: tag });
  }),
);

// --- projects ---------------------------------------------------------------

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description:
      "List every Archer project in the user's workspace: id, title, last-updated timestamp, and editor URL. Start here whenever the user refers to an existing architecture.",
    inputSchema: {},
  },
  wrap(async () => {
    const workspaceId = requireWorkspace();
    const projects = await db.listProjects(workspaceId);
    return text(
      projects.map((p) => ({
        id: p._id,
        title: p.title,
        updated: new Date(p.updatedAt).toISOString(),
        editor_url: `${APP_URL}/d/${p._id}`,
      })),
    );
  }),
);

server.registerTool(
  "get_project",
  {
    title: "Read a project",
    description:
      "Fetch a project's full Archer source plus its current diagnostics, the OPEN QUESTIONS humans left on components (answer them with answer_question when you can), and a drift summary. ALWAYS call this before update_project and base your edit on the exact source returned — updates replace the whole document. Components may carry a `src` path pointing into the codebase — use it to locate implementations. The layout block at the end is machine-managed presentation: keep it out of your mental model, and normally omit it from your edits (the server preserves it for you).",
    inputSchema: { project_id: z.string() },
  },
  wrap(async ({ project_id }) => {
    const workspaceId = requireWorkspace();
    const doc = await db.getProject(workspaceId, project_id);
    if (!doc) throw new Error(`No project with id ${project_id}. Use list_projects.`);
    const [a, threads, drift] = await Promise.all([
      analyze(doc.source, workspaceId),
      db.listThreads(workspaceId, project_id, "open"),
      db.getDrift(workspaceId, project_id),
    ]);
    return text({
      id: project_id,
      title: doc.title,
      editor_url: `${APP_URL}/d/${project_id}`,
      valid: a.errors.length === 0,
      errors: diagnosticsReport(a.errors),
      warnings: diagnosticsReport(a.warnings),
      open_questions: threads.map(threadView),
      drift: drift ? { reported_at: iso(drift.reportedAt), findings_count: drift.findings.length } : null,
      source: doc.source,
    });
  }),
);

server.registerTool(
  "create_project",
  {
    title: "Create a project",
    description:
      "Create a new Archer project from source. The document is validated first: any ERROR (syntax, unresolved connection endpoint, invalid payload, duplicate id) REJECTS the write and returns the diagnostics — fix and retry. On success the source is auto-laid-out, canonicalized, saved, and the result includes the id and an editor URL to share with the user. Write semantic content only; omit the layout block. Minimum viable document: 'arch \"Title\" v0.1'.",
    inputSchema: {
      source: z.string().describe("Full Archer document text (see get_guide for the language)"),
      summary: z.string().max(200).optional().describe("One line describing what you changed, shown in the human's activity feed next to your name. Always provide it."),
    },
  },
  wrap(async ({ source, summary }) => {
    const workspaceId = requireWorkspace();
    const prep = await prepareWrite(source, workspaceId);
    if (!prep.ok)
      return fail({
        message: "REJECTED — fix these errors and retry.",
        errors: diagnosticsReport(prep.errors),
        warnings: diagnosticsReport(prep.warnings),
      });
    const id = await db.createProject(workspaceId, prep.title, prep.text, summary ?? "Created the project");
    return text({
      id,
      title: prep.title,
      editor_url: `${APP_URL}/d/${id}`,
      warnings: diagnosticsReport(prep.warnings),
    });
  }),
);

server.registerTool(
  "update_project",
  {
    title: "Update a project (full replace)",
    description:
      "Replace a project's document with new source. Same validation gates as create_project: errors REJECT the write (nothing saved) and are returned for you to fix. Layout preservation is automatic: components that survive your edit keep their on-canvas positions; new components are auto-placed — so simply omit the layout block. The human's open canvas updates live. Always get_project first and edit that source; sending unrelated source will silently discard their content.",
    inputSchema: {
      project_id: z.string(),
      source: z.string().describe("Complete replacement document text"),
      summary: z.string().max(200).optional().describe("One line describing what you changed, shown in the human's activity feed next to your name. Always provide it."),
    },
  },
  wrap(async ({ project_id, source, summary }) => {
    const workspaceId = requireWorkspace();
    const existing = await db.getProject(workspaceId, project_id);
    if (!existing) throw new Error(`No project with id ${project_id}. Use list_projects.`);
    const prep = await prepareWrite(source, workspaceId, existing.source);
    if (!prep.ok)
      return fail({
        message: "REJECTED — nothing was saved. Fix these errors and retry.",
        errors: diagnosticsReport(prep.errors),
        warnings: diagnosticsReport(prep.warnings),
      });
    await db.updateProject(workspaceId, project_id, prep.title, prep.text, summary);
    return text({
      id: project_id,
      title: prep.title,
      saved: true,
      attributed_to: agentName(),
      editor_url: `${APP_URL}/d/${project_id}`,
      warnings: diagnosticsReport(prep.warnings),
    });
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
    const workspaceId = requireWorkspace();
    const existing = await db.getProject(workspaceId, project_id);
    if (!existing) throw new Error(`No project with id ${project_id}.`);
    await db.deleteProject(workspaceId, project_id);
    return text({ deleted: project_id, title: existing.title });
  }),
);

// --- presentation -----------------------------------------------------------

server.registerTool(
  "set_display",
  {
    title: "Collapse/expand a container",
    description:
      "Set how a container component renders on the canvas, like a human using the detail panel: 'plane' shows it as an area with its children laid out inside; 'icon' collapses it to a single box (children hidden, their connections re-routed to the container). Semantic content is untouched. Saves immediately.",
    inputSchema: {
      project_id: z.string(),
      path: z.string().describe("Dot-path of the container, e.g. 'backend' or 'backend.api'"),
      display: z.enum(["plane", "icon"]),
    },
  },
  wrap(async ({ project_id, path, display }) => {
    const workspaceId = requireWorkspace();
    const existing = await db.getProject(workspaceId, project_id);
    if (!existing) throw new Error(`No project with id ${project_id}.`);
    const doc = parse(existing.source).doc;
    const next = format(autoLayout(setDisplay(doc, path.split("."), display)));
    await db.updateProject(
      workspaceId, project_id, doc.title, next,
      `${display === "icon" ? "Collapsed" : "Expanded"} ${path} to ${display}`,
    );
    return text({ id: project_id, path, display, saved: true });
  }),
);

server.registerTool(
  "auto_layout_project",
  {
    title: "Re-arrange a project's canvas",
    description:
      "Run the deterministic grid auto-layout on a stored project and save. With reset=false (default) only components missing positions are placed; with reset=true ALL manual positioning is discarded and the whole canvas is re-arranged — only do that when the user asks for a tidy-up, since it destroys their hand arrangement.",
    inputSchema: {
      project_id: z.string(),
      reset: z.boolean().optional(),
    },
  },
  wrap(async ({ project_id, reset }) => {
    const workspaceId = requireWorkspace();
    const existing = await db.getProject(workspaceId, project_id);
    if (!existing) throw new Error(`No project with id ${project_id}.`);
    const doc = parse(existing.source).doc;
    const next = format(autoLayout(reset ? { ...doc, layout: [] } : doc));
    await db.updateProject(
      workspaceId, project_id, doc.title, next,
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
      "List a project's revisions, newest first: who saved (the human, or an agent by client name), when, their one-line summary, and a count of components/connections added, removed and changed versus the previous revision. Humans see this same feed in the app, which is why every write you make should carry a `summary`. Use it to understand what happened since you last looked, to find a revision id for get_revision/diff_project, or to explain a document's evolution to the user.",
    inputSchema: {
      project_id: z.string(),
      limit: z.number().int().min(1).max(200).optional().describe("Max revisions to return (default 20)"),
    },
  },
  wrap(async ({ project_id, limit }) => {
    const workspaceId = requireWorkspace();
    await requireProject(workspaceId, project_id);
    const n = limit ?? 20;
    // Fetch one extra so the oldest returned entry can be diffed too.
    const rows = await db.listRevisions(workspaceId, project_id, n + 1);
    const shown = rows.slice(0, n);
    return text(
      shown.map((r, i) => {
        const prev = rows[i + 1];
        return revisionView(r, prev ? parse(prev.source).doc : null);
      }),
    );
  }),
);

server.registerTool(
  "get_revision",
  {
    title: "Read a past revision",
    description:
      "Fetch the full Archer source of one historical revision (ids come from get_history). Read-only: to roll a project back, send this source to update_project with a summary saying so.",
    inputSchema: { revision_id: z.string() },
  },
  wrap(async ({ revision_id }) => {
    const workspaceId = requireWorkspace();
    const r = await db.getRevision(workspaceId, revision_id);
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
  "diff_project",
  {
    title: "Diff two revisions",
    description:
      "Structured architecture diff between two points in a project's history: components added/removed/changed (with which fields), connections added/removed, title changes. Layout moves never count. Defaults compare the latest change (the current document vs. the revision before it) — the fastest way to answer 'what did you / the human just change?'. Pass revision ids from get_history to compare arbitrary points.",
    inputSchema: {
      project_id: z.string(),
      from_revision_id: z.string().optional().describe("Older revision (default: the one just before `to`)"),
      to_revision_id: z.string().optional().describe("Newer revision (default: the current document)"),
    },
  },
  wrap(async ({ project_id, from_revision_id, to_revision_id }) => {
    const workspaceId = requireWorkspace();
    const project = await requireProject(workspaceId, project_id);
    const revisions = await db.listRevisions(workspaceId, project_id, 200);
    const byId = new Map(revisions.map((r) => [r._id, r]));
    const pick = (id: string) => {
      const r = byId.get(id);
      if (!r) throw new Error(`No revision with id ${id} in this project. Use get_history.`);
      return r;
    };

    let toLabel: string;
    let toSource: string;
    let toIndex: number; // index in `revisions` of the newest revision at/before `to`
    if (to_revision_id) {
      const r = pick(to_revision_id);
      toLabel = r._id;
      toSource = r.source;
      toIndex = revisions.findIndex((x) => x._id === r._id);
    } else {
      toLabel = "current";
      toSource = project.source;
      // If the stored document equals the newest revision, "before" is the one after it.
      toIndex = revisions[0] && revisions[0].source === project.source ? 0 : -1;
    }

    let fromLabel: string;
    let fromSource: string;
    if (from_revision_id) {
      const r = pick(from_revision_id);
      fromLabel = r._id;
      fromSource = r.source;
    } else {
      const prev = revisions[toIndex + 1];
      if (!prev) {
        fromLabel = "empty";
        fromSource = `arch "${parse(toSource).doc.title}" v0.1\n`;
      } else {
        fromLabel = prev._id;
        fromSource = prev.source;
      }
    }

    const diff = diffDocs(parse(fromSource).doc, parse(toSource).doc);
    const summary = summarizeDiff(diff);
    return text({
      from: fromLabel,
      to: toLabel,
      description: describeSummary(summary),
      summary,
      diff,
    });
  }),
);

// --- questions --------------------------------------------------------------

server.registerTool(
  "ask_question",
  {
    title: "Ask the human about a component",
    description:
      "Attach a question to one component when the architecture is ambiguous or you need a decision instead of guessing (e.g. 'Which auth provider should this use?'). The question appears as a badge on that component in the human's canvas and they answer inline; check back with list_questions (or get_project's open_questions). Prefer this over inventing architecture that contradicts the user's intent.",
    inputSchema: {
      project_id: z.string(),
      path: z.string().describe("Dot-path of the component, e.g. 'backend.api'"),
      text: z.string().min(1).max(2000).describe("The question, as you would ask a colleague"),
    },
  },
  wrap(async ({ project_id, path, text: body }) => {
    const workspaceId = requireWorkspace();
    const project = await requireProject(workspaceId, project_id);
    if (!componentPaths(parse(project.source).doc).has(path))
      throw new Error(`No component at path '${path}' in this project.`);
    const id = await db.createThread(workspaceId, project_id, path, body.trim());
    return text({ question_id: id, path, status: "open", asked_as: agentName() });
  }),
);

server.registerTool(
  "list_questions",
  {
    title: "List questions on a project",
    description:
      "Question threads attached to components — asked by you, other agents, or the human (humans leave questions for agents too). Each thread has a path, status and its messages. Start a session by reading the open ones and answering what you can with answer_question.",
    inputSchema: {
      project_id: z.string(),
      status: z.enum(["open", "resolved", "all"]).optional().describe("Default 'open'"),
    },
  },
  wrap(async ({ project_id, status }) => {
    const workspaceId = requireWorkspace();
    await requireProject(workspaceId, project_id);
    const st = status ?? "open";
    const rows = await db.listThreads(workspaceId, project_id, st === "all" ? undefined : st);
    return text(rows.map(threadView));
  }),
);

server.registerTool(
  "answer_question",
  {
    title: "Reply in a question thread",
    description:
      "Append a reply to a question thread — answer a question the human left for you, or follow up on your own. Replies are attributed to your client name. Resolve the thread with resolve_question once the matter is settled.",
    inputSchema: {
      question_id: z.string(),
      text: z.string().min(1).max(4000),
    },
  },
  wrap(async ({ question_id, text: body }) => {
    const workspaceId = requireWorkspace();
    await db.replyThread(workspaceId, question_id, body.trim());
    return text({ question_id, replied_as: agentName() });
  }),
);

server.registerTool(
  "resolve_question",
  {
    title: "Resolve or reopen a question",
    description:
      "Mark a question thread resolved (its badge disappears from the canvas) — do this after the human answered and you applied the decision. Pass resolved=false to reopen.",
    inputSchema: {
      question_id: z.string(),
      resolved: z.boolean().optional().describe("Default true"),
    },
  },
  wrap(async ({ question_id, resolved }) => {
    const workspaceId = requireWorkspace();
    const status = resolved === false ? "open" : "resolved";
    await db.setThreadStatus(workspaceId, question_id, status);
    return text({ question_id, status });
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
      "Record the result of a drift check: after comparing each component (via its `src` path or by searching the repo) against the actual code, send one finding per discrepancy. The report REPLACES the previous one, and an EMPTY list means 'in sync' — send it too, so the human sees a green state. Findings show as badges on the components in the canvas; 'extra' findings appear in a list the human can add to the document with one click. Do not modify the document during a drift check unless the user asked.",
    inputSchema: {
      project_id: z.string(),
      findings: z.array(findingSchema),
    },
  },
  wrap(async ({ project_id, findings }) => {
    const workspaceId = requireWorkspace();
    const project = await requireProject(workspaceId, project_id);
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
    await db.reportDrift(workspaceId, project_id, clean);
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
      "The most recent drift report for a project (who ran it, when, and every finding), or report: null if none has been run. Use it to pick up where a previous check left off or to see what the human still has to act on.",
    inputSchema: { project_id: z.string() },
  },
  wrap(async ({ project_id }) => {
    const workspaceId = requireWorkspace();
    await requireProject(workspaceId, project_id);
    const r = await db.getDrift(workspaceId, project_id);
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

// --- workspace --------------------------------------------------------------

server.registerTool(
  "get_workspace_info",
  {
    title: "Workspace status",
    description:
      "Report this server's configuration: which workspace id is active (or how to set one), the Convex backend URL, whether the backend is reachable, and project/custom-type counts. Call this first if any project tool errors.",
    inputSchema: {},
  },
  wrap(async () => {
    const workspaceId = resolveWorkspaceId();
    let reachable = false;
    let projectCount: number | null = null;
    let customTypeCount: number | null = null;
    if (workspaceId) {
      try {
        const [projects, types] = await Promise.all([
          db.listProjects(workspaceId),
          db.listCustomTypes(workspaceId),
        ]);
        reachable = true;
        projectCount = projects.length;
        customTypeCount = types.length;
      } catch {
        reachable = false;
      }
    }
    return text({
      workspace_id: workspaceId,
      convex_url: CONVEX_URL,
      app_url: APP_URL,
      backend_reachable: workspaceId ? reachable : undefined,
      project_count: projectCount,
      custom_type_count: customTypeCount,
      ...(workspaceId ? {} : { how_to_configure: NO_WORKSPACE_MESSAGE }),
    });
  }),
);

server.registerTool(
  "set_workspace",
  {
    title: "Set the active workspace",
    description:
      "Point this server at a workspace id (persisted to ~/.archer/workspace for future sessions). The id must come from the user — it's shown in the footer of the Archer home page — so their browser and your tools see the same projects. Never invent one: a made-up id silently creates an empty parallel workspace.",
    inputSchema: {
      workspace_id: z.string().min(1).describe("Workspace id copied by the user from the app's home page footer"),
    },
  },
  wrap(async ({ workspace_id }) => {
    persistWorkspaceId(workspace_id.trim());
    const projects = await db.listProjects(workspace_id.trim()).catch(() => null);
    return text({
      workspace_id: workspace_id.trim(),
      persisted_to: "~/.archer/workspace",
      visible_projects: projects?.length ?? "backend unreachable",
    });
  }),
);

// ---------------------------------------------------------------------------

await server.connect(new StdioServerTransport());
setClientName(server.server.getClientVersion()?.name);
// The handshake may complete after connect() resolves; re-read lazily too.
server.server.oninitialized = () => setClientName(server.server.getClientVersion()?.name);
console.error(`[archer-mcp] ready — convex: ${CONVEX_URL}, workspace: ${resolveWorkspaceId() ?? "(not set)"}, agent: ${agentName()}`);
