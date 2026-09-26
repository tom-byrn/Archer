import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Resource, Tool } from "@modelcontextprotocol/sdk/types.js";
import { REMOTE_SERVER_VERSION } from "./remote";
import { registerArcherTools } from "./server";

/**
 * The tool reference on the docs site (/docs/mcp). What a tools/list can say
 * (names, titles, descriptions, input schemas) comes from the registrations
 * themselves through `describeServer`, so it can't drift. This file adds what
 * a listing can't: grouping, the access each tool needs, an example call and
 * what it returns. test/reference.test.ts runs every example against the real
 * tools and fails when a tool is missing here or a result no longer has the
 * documented shape.
 */

export interface ServerDescription {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
}

/** The tools and resources exactly as an agent lists them. Needs no backend or sign-in. */
export async function describeServer(): Promise<ServerDescription> {
  const server = new McpServer({ name: "archer", version: REMOTE_SERVER_VERSION });
  registerArcherTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "archer-docs", version: REMOTE_SERVER_VERSION });
  await client.connect(clientTransport);
  try {
    const [{ tools }, { resources }] = await Promise.all([client.listTools(), client.listResources()]);
    return { name: "archer", version: REMOTE_SERVER_VERSION, tools, resources };
  } finally {
    await client.close();
  }
}

/**
 * What a call touches: nothing stored (`none`), the current workspace
 * (`read`: any role; `write`: editor or owner, viewers are refused), or the
 * user's own account (`account`: their workspaces and which one is current).
 */
export type Access = "none" | "read" | "write" | "account";

export const ACCESS_LABELS: Record<Access, string> = {
  none: "Stateless",
  read: "Reads the current workspace",
  write: "Writes to the current workspace (editor or owner)",
  account: "Your account",
};

export interface ToolDoc {
  access: Access;
  /** Arguments of the example call. */
  args: Record<string, unknown>;
  /**
   * What the example call returns: the parsed JSON, or the text for tools
   * that answer in plain text. `"…"` stands for anything: an elided value, a
   * run of text, or (as an array's last element) more elements like those
   * shown.
   */
  result: unknown;
  /** More to know, as markdown. */
  notes?: string[];
}

export interface ToolGroup {
  title: string;
  /** Markdown. */
  intro: string;
  tools: string[];
}

// ---------------------------------------------------------------------------
// The example scenario. Every example call runs against this state: a user
// whose Personal workspace is current and who is an editor in the team
// workspace "Acme", and a project "Shop" that Claude Code created, the user
// then edited on the canvas, linked to its repository and checked for drift.

const USER = "user_2wKx9TqLm4RbVc7NpZ3hJd8sFyA";
const TEAM = "jn7dt5pzq1b3wk8m2c9x4v6hre0fs7ya";
const PROJECT = "k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5";
const REV_CREATED = "kd73ac5x2dmbn4xq8v1ng6ytzh7p9wsf";
const REV_EDITED = "kd7e1q8vd2m3p5sz0b6tyhc9w4xnrj8a";
const APP = "https://archer.tombyrne.dev";
const EDITOR_URL = `${APP}/documents/${PROJECT}`;
const FENCE = "```";

/** "Shop" as Claude Code created it. */
const SHOP_CREATED = `arch "Shop" v0.1

component web "Storefront" @vercel.nextjs

component backend "Backend" {
  component api "API" @vercel.functions
  component db "Orders DB" @postgres
}

backend.api -> backend.db @sql
web -> backend.api @http
`;

/** …after the user added Stripe and a code link on the canvas. The current document. */
const SHOP = `arch "Shop" v0.1

component web "Storefront" @vercel.nextjs

component backend "Backend" {
  component api "API" @vercel.functions {
    src "apps/api"
  }
  component db "Orders DB" @postgres
}

component stripe "Stripe" @stripe

backend.api -> backend.db @sql
backend.api -> stripe @http : "charges"
web -> backend.api @http
`;

/** The update_project example: an agent adds an order-events queue with its message schema. */
const SHOP_WITH_QUEUE = `arch "Shop" v0.1

component web "Storefront" @vercel.nextjs

component backend "Backend" {
  component api "API" @vercel.functions {
    src "apps/api"
  }
  component db "Orders DB" @postgres
  component events "Order Events" @queue
}

component stripe "Stripe" @stripe

backend.api -> backend.db @sql
backend.api -> backend.events @queue : "order placed" {
  message json ${FENCE}
  { "order_id": "uuid", "total_cents": "int" }
  ${FENCE}
}
backend.api -> stripe @http : "charges"
web -> backend.api @http
`;

/** Ids and documents the reference test seeds its backend with. */
export const EXAMPLE_STATE = {
  user: USER,
  agentName: "Claude Code",
  team: { id: TEAM, name: "Acme", role: "editor" as const },
  project: {
    id: PROJECT,
    title: "Shop",
    /** Oldest first; the last one is the current document. */
    revisions: [
      {
        id: REV_CREATED,
        source: SHOP_CREATED,
        author: { kind: "agent" as const, name: "Claude Code" },
        summary: "Created the project",
      },
      { id: REV_EDITED, source: SHOP, author: { kind: "user" as const } },
    ],
    repo: { owner: "acme", name: "shop", branch: "main" },
    drift: [
      {
        status: "changed" as const,
        path: "backend.db",
        src: "apps/api/src/db/schema.ts",
        note: "Orders now carry a currency column the document doesn't mention.",
      },
      { status: "extra" as const, name: "Email Worker", src: "apps/worker/email" },
    ],
  },
  customTypes: [{ tag: "custom.billing_engine", name: "Billing Engine", color: "#6366f1", glyph: "gear" }],
};

const REVISION_CHANGES = {
  added: 1,
  removed: 0,
  changed: 1,
  connectionsAdded: 1,
  connectionsRemoved: 0,
  connectionsChanged: 0,
};

// ---------------------------------------------------------------------------

export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    title: "Guide and examples",
    intro:
      "Reading for the agent. `get_guide` comes first: everything else on the server assumes the agent knows the language, and the guide ends with the whole specification.",
    tools: ["get_guide", "list_examples", "get_example"],
  },
  {
    title: "Language",
    intro:
      "These read the source you pass and save nothing, so they need no project. `validate_source` and `compile_for_agent` also know the current workspace's custom types.",
    tools: ["validate_source", "format_source", "compile_for_agent", "auto_layout_source"],
  },
  {
    title: "Component types",
    intro:
      "A type tag gives a component its icon and color. Tags are optional, and an unknown one is only a warning. Custom types belong to the workspace: one agent creates it, and it appears in every member's palette.",
    tools: ["list_types", "create_custom_type", "delete_custom_type"],
  },
  {
    title: "Projects",
    intro:
      "A project is one Archer document. Reads return the full source. Writes replace it whole, pass the same validation as the canvas, and are saved as revisions under the agent's name.",
    tools: ["list_projects", "get_project", "create_project", "update_project", "delete_project"],
  },
  {
    title: "Canvas",
    intro: "Change how the diagram is drawn without touching the architecture. Both save a revision.",
    tools: ["set_display", "auto_layout_project"],
  },
  {
    title: "History",
    intro:
      "Every save is a revision: who made it (the user, or an agent by its client's name), when, and the agent's one-line summary. The app shows the same history.",
    tools: ["get_history", "get_revision", "diff_project"],
  },
  {
    title: "Code and drift",
    intro:
      "Tie a project to the code it describes: link its repository, then record whether the code still matches the document. Findings appear on the canvas.",
    tools: ["link_repository", "report_drift", "get_drift"],
  },
  {
    title: "Workspaces",
    intro:
      "Project tools act on one workspace at a time, the current one. It starts as Personal. The choice is stored for the user, so the CLI and every agent they connect move together.",
    tools: ["get_workspace_info", "list_workspaces", "use_workspace"],
  },
];

export const TOOL_DOCS: Record<string, ToolDoc> = {
  // --- guide and examples ----------------------------------------------------
  get_guide: {
    access: "none",
    args: {},
    result: "# Archer MCP Server — Agent Guide\n\nArcher is an architecture-design tool: …",
    notes: [
      "Markdown: the mental model, the standard workflows, how validation gates writes, the error codes, advice on writing good documents, then the complete [language specification](https://archer.tombyrne.dev/language). The same text is the resource `archer://guide`.",
    ],
  },
  list_examples: {
    access: "none",
    args: {},
    result: [
      {
        slug: "components-and-connections",
        title: "Link Shortener",
        summary:
          "The smallest useful document: a header, a few typed components and the connections between them. …",
        features: ["components", "types", "connections", "labels"],
        docs_url: `${APP}/language/examples#components-and-connections`,
        sandbox_url: `${APP}/sandbox/components-and-connections`,
      },
      "…",
    ],
    notes: [
      "The documents on the [Examples](https://archer.tombyrne.dev/language/examples) page. `sandbox_url` opens one in the editor without an account; nothing there is saved.",
    ],
  },
  get_example: {
    access: "none",
    args: { slug: "components-and-connections" },
    result: {
      slug: "components-and-connections",
      title: "Link Shortener",
      summary: "The smallest useful document: …",
      features: ["components", "types", "connections", "labels"],
      docs_url: `${APP}/language/examples#components-and-connections`,
      sandbox_url: `${APP}/sandbox/components-and-connections`,
      source: 'arch "Link Shortener" v0.1\n\ncomponent browser "Browser" @browser {\n  shape browser\n}\n…',
    },
    notes: [
      "`source` is canonical and validates clean, so it can go straight to `create_project` to give the user an editable copy. Each example is also the resource `archer://examples/<slug>`.",
    ],
  },

  // --- language ----------------------------------------------------------------
  validate_source: {
    access: "read",
    args: {
      source: `arch "Shop" v0.1
component api "API" @vercel.functions
component api "Orders DB" @postgres
api -> payments @http
`,
    },
    result: {
      valid: false,
      errors: [
        "E002 [error] line 3: Duplicate component id 'api' in the top level.",
        "E101 [error] line 4: Connection target 'payments' does not resolve to a declared component.",
      ],
      warnings: [],
    },
    notes: [
      "The same checks as the write gate on `create_project` and `update_project`: a source that validates clean will save. Only errors make `valid` false.",
    ],
  },
  format_source: {
    access: "none",
    args: {
      source: `arch "Shop" v0.1
component   db "Orders DB"   @postgres
component api "API" @vercel.functions
api->db @sql
`,
    },
    result: `arch "Shop" v0.1

component db "Orders DB" @postgres

component api "API" @vercel.functions

api -> db @sql
`,
    notes: [
      "Components keep the order they were written in; connections are sorted. A `layout` block is kept but never added (that's `auto_layout_source`). `#` comments are dropped, since they aren't part of the document.",
      "It formats whatever parses: after a syntax error (E001) the output can be missing the broken part and what the parser skipped after it. Call `validate_source` first.",
    ],
  },
  compile_for_agent: {
    access: "read",
    args: { project_id: PROJECT },
    result: `# This is an Archer architecture document — a complete, machine-readable
# specification of a software system, exported from a canvas the author designed.
# Treat it as the source of truth for the system's intended architecture.
#
# How to read it:
…
# - If you write Archer back, follow the grammar above and leave the \`layout\`
#   block out: Archer keeps every surviving component where it was and places
#   new ones itself. Only write layout when asked to arrange the diagram.

arch "Shop" v0.1

component web "Storefront" @vercel.nextjs

component backend "Backend" {
  component api "API" @vercel.functions {
    src "apps/api"
  }
  component db "Orders DB" @postgres
}

component stripe "Stripe" @stripe

backend.api -> backend.db @sql
backend.api -> stripe @http : "charges"
web -> backend.api @http

layout {
  backend: { at: [7, 0], size: [13, 7] }
  backend.api: { at: [1, 2], size: [4, 3] }
  backend.db: { at: [8, 2], size: [4, 3] }
  stripe: { at: [0, 9], size: [4, 3] }
  web: { at: [0, 2], size: [4, 3] }
}
`,
    notes: [
      "Pass `source` or `project_id`. The output is what the editor's **Copy for agent** puts on the clipboard.",
      "The layout block is always complete: every component has the position and size the canvas draws it at, so the agent sees the diagram as the author laid it out.",
      "A document with errors is refused: the error result is `{ message, errors }`, with the diagnostics.",
    ],
  },
  auto_layout_source: {
    access: "none",
    args: {
      source: `arch "Shop" v0.1

component api "API" @vercel.functions

component db "Orders DB" @postgres

api -> db @sql
`,
    },
    result: `arch "Shop" v0.1

component api "API" @vercel.functions

component db "Orders DB" @postgres

api -> db @sql

layout {
…
}
`,
    notes: [
      "Each entry is `path: { at: [column, row], size: [width, height] }` on the canvas grid, plus `display: plane | icon` for containers. With `reset: true` every position is recomputed, but collapsed containers stay collapsed.",
      "`create_project` and `update_project` lay out for you, so this is for previewing or re-arranging a source before you save it.",
    ],
  },

  // --- types -------------------------------------------------------------------
  list_types: {
    access: "read",
    args: { search: "postgres" },
    result: {
      catalog: [
        { tag: "postgres", name: "Postgres", namespace: "databases" },
        { tag: "postgres.table", name: "Table", namespace: "databases" },
        { tag: "supabase.postgres", name: "Supabase", namespace: "databases" },
      ],
      custom_types: [],
      connection_types: ["http", "grpc", "ws", "sql", "queue", "event", "…"],
      shapes: [
        { shape: "box", name: "Box", use: "anything (the default)" },
        { shape: "pill", name: "Pill", use: "starts, ends and states" },
        { shape: "circle", name: "Circle", use: "events, triggers and endpoints" },
        "…",
      ],
      glyphs_for_custom_types: ["box", "circle", "database", "table", "…"],
    },
    notes: [
      "`search` filters the catalog and custom types only; connection types, shapes and glyphs are always listed in full. Custom types come from the current workspace; if they can't be read, `note` says so.",
      "A shape goes in a component's body, `shape cylinder`, and draws the component as that outline; the type still picks the icon and color inside it.",
    ],
  },
  create_custom_type: {
    access: "write",
    args: { name: "Fraud Scorer", glyph: "shield", color: "#dc2626" },
    result: { created: "custom.fraud_scorer", usage: 'component my_id "Fraud Scorer" @custom.fraud_scorer' },
    notes: [
      "The tag is `custom.` plus the name in snake case, unless you pass `tag`. Calling it again with the same tag updates the name, glyph and color.",
      "Refused with an unknown glyph (the error lists the valid ones) or a color that isn't `#rrggbb`.",
    ],
  },
  delete_custom_type: {
    access: "write",
    args: { tag: "custom.billing_engine" },
    result: { deleted: "custom.billing_engine" },
    notes: [
      "Components that use the tag stay valid, but draw as generic boxes with a `W301` warning. Deleting a tag that doesn't exist succeeds.",
    ],
  },

  // --- projects ----------------------------------------------------------------
  list_projects: {
    access: "read",
    args: {},
    result: [
      { id: PROJECT, title: "Shop", updated: "2026-09-01T10:00:00.000Z", editor_url: EDITOR_URL },
      "…",
    ],
    notes: ["Most recently updated first. Only the current workspace: see `list_workspaces`."],
  },
  get_project: {
    access: "read",
    args: { project_id: PROJECT },
    result: {
      id: PROJECT,
      title: "Shop",
      editor_url: EDITOR_URL,
      valid: true,
      errors: [],
      warnings: [],
      drift: { reported_at: "2026-09-01T10:10:00.000Z", findings_count: 2 },
      repository: {
        full_name: "acme/shop",
        branch: "main",
        url: "https://github.com/acme/shop/tree/main",
        hint: "Drift checks and `src` paths refer to this repository at this branch.",
      },
      source: 'arch "Shop" v0.1\n\ncomponent web "Storefront" @vercel.nextjs\n…\n\nlayout {\n…\n}\n',
    },
    notes: [
      "`source` is the stored document, `layout` block included. Agents leave that block out of their edits and the server keeps it.",
      "`drift` is null until a drift check is reported, and `repository` is null until one is linked.",
    ],
  },
  create_project: {
    access: "write",
    args: {
      source: `arch "Link Shortener" v0.1

component app "Web App" @vercel.nextjs
component api "API" @vercel.functions
component db "Links" @postgres

app -> api @http : "shorten"
api -> db @sql
`,
      summary: "Mapped the repo's three services",
    },
    result: {
      id: "k1792cxn5wm0fq8hq6dhz4v3sr7b2eay",
      title: "Link Shortener",
      editor_url: `${APP}/documents/k1792cxn5wm0fq8hq6dhz4v3sr7b2eay`,
      warnings: [],
    },
    notes: [
      "The title comes from the `arch` header. The document is saved canonical and laid out. Without a `summary` the revision reads \"Created the project\".",
      "A document with errors saves nothing. The error result lists them: `{ \"message\": \"REJECTED — fix these errors and retry.\", \"errors\": [\"E101 [error] line 3: …\"], \"warnings\": [] }`.",
    ],
  },
  update_project: {
    access: "write",
    args: { project_id: PROJECT, source: SHOP_WITH_QUEUE, summary: "Added an order-events queue" },
    result: {
      id: PROJECT,
      title: "Shop",
      saved: true,
      attributed_to: "Claude Code",
      editor_url: EDITOR_URL,
      warnings: [],
    },
    notes: [
      "The source replaces the whole document, so start from what `get_project` returned. Rejected writes return the same error result as `create_project` and save nothing.",
      "Components that still exist keep their canvas positions and new ones are placed. Entries in a `layout` block you send win over the stored ones.",
      "An update that changes nothing adds no revision.",
    ],
  },
  delete_project: {
    access: "write",
    args: { project_id: PROJECT, confirm: true },
    result: { deleted: PROJECT, title: "Shop" },
    notes: ["The project's history and drift report go with it. There is no undo."],
  },

  // --- canvas ------------------------------------------------------------------
  set_display: {
    access: "write",
    args: { project_id: PROJECT, path: "backend", display: "icon" },
    result: { id: PROJECT, path: "backend", display: "icon", saved: true },
    notes: [
      "`path` names a component that has children. The revision's summary reads \"Collapsed backend to icon\" or \"Expanded backend to plane\".",
    ],
  },
  auto_layout_project: {
    access: "write",
    args: { project_id: PROJECT, reset: true },
    result: { id: PROJECT, reset: true, saved: true },
    notes: [
      "Without `reset`, only components that have no position are placed, next to what they connect to (\"Placed unpositioned components\"). With `reset: true` every position is recomputed (\"Re-arranged the canvas\") and collapsed containers stay collapsed: the user's arrangement survives only in the previous revision.",
    ],
  },

  // --- history -----------------------------------------------------------------
  get_history: {
    access: "read",
    args: { project_id: PROJECT, limit: 10 },
    result: [
      {
        revision_id: REV_EDITED,
        created_at: "2026-09-01T10:00:00.000Z",
        author: { kind: "user" },
        title: "Shop",
        changes: REVISION_CHANGES,
        description: "+1 component, ~1 changed, +1 connection",
      },
      {
        revision_id: REV_CREATED,
        created_at: "2026-09-01T09:00:00.000Z",
        author: { kind: "agent", name: "Claude Code" },
        summary: "Created the project",
        title: "Shop",
        changes: { ...REVISION_CHANGES, added: 4, changed: 0, connectionsAdded: 2 },
        description: "+4 components, +2 connections",
      },
    ],
    notes: [
      "Newest first. `changes` counts the differences from the revision before; moving things on the canvas doesn't count.",
      "Every agent save is its own revision. The user's saves in the app have no `summary`, and one made within five minutes of their last joins that revision.",
    ],
  },
  get_revision: {
    access: "read",
    args: { revision_id: REV_CREATED },
    result: {
      revision_id: REV_CREATED,
      project_id: PROJECT,
      created_at: "2026-09-01T09:00:00.000Z",
      author: { kind: "agent", name: "Claude Code" },
      summary: "Created the project",
      source: 'arch "Shop" v0.1\n\ncomponent web "Storefront" @vercel.nextjs\n…',
    },
    notes: ["To roll back, send `source` to `update_project` with a summary that says so."],
  },
  diff_project: {
    access: "read",
    args: { project_id: PROJECT },
    result: {
      from: REV_CREATED,
      to: "current",
      description: "+1 component, ~1 changed, +1 connection",
      summary: REVISION_CHANGES,
      diff: {
        components: [
          { path: "backend.api", kind: "changed", fields: ["src"] },
          { path: "stripe", kind: "added" },
        ],
        connections: [
          {
            key: "backend.api|->|stripe|http|charges",
            kind: "added",
            connection: {
              kind: "connection",
              source: ["backend", "api"],
              target: ["stripe"],
              arrow: "->",
              payloads: [],
              span: "…",
              type: "http",
              label: "charges",
            },
          },
        ],
      },
    },
    notes: [
      "`from` and `to` are revision ids, `current` (the project as it is now) or `empty` (before the first revision). Only the newest 200 revisions can be named.",
      "A changed component lists its changed `fields`: `name`, `type`, `shape`, `desc`, `src` or `payloads`. A connection is `changed` when only its payloads differ, and `title` appears when the document was renamed.",
    ],
  },

  // --- code and drift ------------------------------------------------------------
  link_repository: {
    access: "write",
    args: { project_id: PROJECT, repository: { full_name: "acme/shop", branch: "main" } },
    result: {
      id: PROJECT,
      repository: { full_name: "acme/shop", branch: "main" },
      note: "Commits from this repository now appear in the human's History panel next to your revisions.",
    },
    notes: [
      "`branch` defaults to `main`, and `full_name` may end in `.git`. Pass `repository: null` to unlink; the result is then `{ id, repository: null, unlinked: true }`.",
    ],
  },
  report_drift: {
    access: "write",
    args: {
      project_id: PROJECT,
      findings: [
        { status: "missing", path: "stripe", src: "apps/api/src/payments", note: "No Stripe client anywhere in the repo." },
        { status: "extra", name: "Email Worker", src: "apps/worker/email" },
      ],
    },
    result: { project_id: PROJECT, reported_as: "Claude Code", in_sync: false, missing: 1, changed: 0, extra: 1 },
    notes: [
      "Replaces the previous report. An empty `findings` list records that the code is in sync.",
      "`missing` and `changed` need a `path` that exists in the document, and `extra` needs a `name`. Otherwise nothing is recorded, and the error names each bad finding.",
    ],
  },
  get_drift: {
    access: "read",
    args: { project_id: PROJECT },
    result: {
      report: {
        reported_at: "2026-09-01T10:10:00.000Z",
        author: { kind: "agent", name: "Claude Code" },
        in_sync: false,
        findings: [
          {
            status: "changed",
            path: "backend.db",
            src: "apps/api/src/db/schema.ts",
            note: "Orders now carry a currency column the document doesn't mention.",
          },
          { status: "extra", name: "Email Worker", src: "apps/worker/email" },
        ],
      },
    },
    notes: ["`report` is null until a drift check is reported."],
  },

  // --- workspaces ------------------------------------------------------------------
  get_workspace_info: {
    access: "account",
    args: {},
    result: {
      auth: "oauth",
      user_id: USER,
      workspace_id: USER,
      workspace_name: "Personal",
      workspace_role: "owner",
      agent_name: "Claude Code",
      convex_url: "https://<deployment>.convex.cloud",
      app_url: APP,
      backend_reachable: true,
      project_count: 1,
      custom_type_count: 1,
    },
    notes: [
      "`agent_name` is the name the user's history will show for this client's saves. `backend_reachable: false` (with null counts) means the server couldn't reach Archer's database.",
    ],
  },
  list_workspaces: {
    access: "account",
    args: {},
    result: {
      current_workspace_id: USER,
      workspaces: [
        { id: USER, name: "Personal", kind: "personal", role: "owner", current: true },
        { id: TEAM, name: "Acme", kind: "team", role: "editor", current: false },
      ],
    },
    notes: ["Personal comes first; its id is the user's id."],
  },
  use_workspace: {
    access: "account",
    args: { workspace_id: TEAM },
    result: { current_workspace_id: TEAM, name: "Acme", kind: "team", role: "editor", visible_projects: 0 },
    notes: [
      "Also switches the CLI (`archer workspace`) and the user's other agents. In a workspace where the user is a viewer, the result carries a `note` and writes are refused.",
    ],
  },
};
