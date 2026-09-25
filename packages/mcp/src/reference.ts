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
 * (`read`: any role; `write`: editor or owner, viewers are refused), the
 * user's own account (`account`: their workspaces and which one is current),
 * a team workspace named in the call (`member`: any role; `owner`: its
 * owners), GitHub with the user's own access (`github`, and `github_write`
 * when it also writes to the current workspace), or what anyone with a share
 * link can see (`public`).
 */
export type Access = "none" | "read" | "write" | "account" | "member" | "owner" | "github" | "github_write" | "public";

export const ACCESS_LABELS: Record<Access, string> = {
  none: "Stateless",
  read: "Reads the current workspace",
  write: "Writes to the current workspace (editor or owner)",
  account: "Your account",
  member: "Reads a team workspace you belong to",
  owner: "Manages a team workspace (owner)",
  github: "Reads GitHub with your access",
  github_write: "Uses your GitHub access and writes to the current workspace (editor or owner)",
  public: "Reads what a share link shows",
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
// whose Personal workspace is current, who is an editor in the team
// workspace "Acme" and the owner of the team "Platform". In Personal: a
// project "Shop" that Claude Code created, the user then edited on the
// canvas, linked to its repository, shared by link and checked for drift; and
// a project "Payments" stored in acme/payments/architecture.arch, where
// Claude Code added a fraud scorer the user hasn't reviewed or published yet.

const USER = "user_2wKx9TqLm4RbVc7NpZ3hJd8sFyA";
const TEAM = "jn7dt5pzq1b3wk8m2c9x4v6hre0fs7ya";
const PLATFORM = "jn72hq8wv5k3dm9xz1rb4t6yc0pa7fse";
const PROJECT = "k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5";
const PAYMENTS = "k57f3wq9zt2m8vc4xnb6hr1jd0pye5as";
const REV_CREATED = "kd73ac5x2dmbn4xq8v1ng6ytzh7p9wsf";
const REV_EDITED = "kd7e1q8vd2m3p5sz0b6tyhc9w4xnrj8a";
const REV_IMPORTED = "kd79xw3m5q1zr8vt2b4nc6hy0jp7aefs";
const REV_FRAUD = "kd7c8m2x4qv6zt1nr9b3wh5y0jp7kdfe";
const MEMBER_YOU = "mh7a2kq9xz4v8tb1wn6rc3hy5jd0pf7s";
const MEMBER_DANA = "mh7b5wq2xz8v1tk4nr9c6hy3jd0pf7ae";
const MEMBER_SAM = "mh7c9zq4xv2k8tb6wn1rc5hy3jd0pf7a";
const SLUG = "Xk3v9Qp2Lm7RtY4w";
const APP = "https://archer.tombyrne.dev";
const EDITOR_URL = `${APP}/documents/${PROJECT}`;
const SHARE_URL = `${APP}/share/${SLUG}`;
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

/** Payments as it is in acme/payments/architecture.arch on main. */
const PAYMENTS_FILE = `arch "Payments" v0.1

component api "Payments API" @service {
  src "services/payments"
}

component ledger "Ledger" @postgres

api -> ledger @sql
`;

/** …with the fraud scorer Claude Code added in Archer: the unpublished draft. */
const PAYMENTS_DRAFT = `arch "Payments" v0.1

component api "Payments API" @service {
  src "services/payments"
}

component fraud "Fraud Scorer" @service {
  desc "Scores every charge before it's captured."
}

component ledger "Ledger" @postgres

api -> fraud @http : "score"
api -> ledger @sql
`;

/** docs/checkout.arch in acme/shop: not in Archer yet (import_from_github). */
const CHECKOUT_FILE = `arch "Checkout" v0.1

component cart "Cart" @service

component payments "Stripe" @stripe

cart -> payments @http : "charge"
`;

const commit = (sha: string, message: string, login: string, name: string, date: string, repo: string) => ({
  sha,
  message,
  authorName: name,
  authorLogin: login,
  date,
  htmlUrl: `https://github.com/${repo}/commit/${sha}`,
});

/** Ids and documents the reference test seeds its backend with. */
export const EXAMPLE_STATE = {
  user: USER,
  email: "jordan@acme.dev",
  agentName: "Claude Code",
  team: { id: TEAM, name: "Acme", role: "editor" as const },
  /** A team the user owns, with a member and an invitation nobody has taken up yet. */
  ownedTeam: {
    id: PLATFORM,
    name: "Platform",
    members: [
      { id: MEMBER_YOU, userId: USER, email: "jordan@acme.dev", role: "owner" as const },
      { id: MEMBER_DANA, userId: "user_3nVb8RtYq2LxKm5WcPz7Hd4sJfG", email: "dana@acme.dev", role: "editor" as const },
      { id: MEMBER_SAM, email: "sam@acme.dev", role: "viewer" as const },
    ],
  },
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
    shareSlug: SLUG,
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
  /** Stored in a repository file: imported from it, then changed by Claude Code (unreviewed, unpublished). */
  storedProject: {
    id: PAYMENTS,
    title: "Payments",
    file: { owner: "acme", name: "payments", branch: "main", path: "architecture.arch" },
    revisions: [
      {
        id: REV_IMPORTED,
        source: PAYMENTS_FILE,
        author: { kind: "git" as const, name: "danakim" },
        summary: "Add the payments architecture",
        commit: { sha: "5d2e8f1a9c3b7d4e6f0a1b2c3d4e5f6a7b8c9d0e", url: "https://github.com/acme/payments/commit/5d2e8f1a9c3b7d4e6f0a1b2c3d4e5f6a7b8c9d0e" },
      },
      {
        id: REV_FRAUD,
        source: PAYMENTS_DRAFT,
        author: { kind: "agent" as const, name: "Claude Code" },
        summary: "Added a fraud scorer between the API and captures",
      },
    ],
  },
  customTypes: [{ tag: "custom.billing_engine", name: "Billing Engine", color: "#6366f1", glyph: "gear" }],
  /** What the user's GitHub account can see. */
  github: [
    {
      info: {
        fullName: "acme/shop",
        owner: "acme",
        name: "shop",
        private: true,
        defaultBranch: "main",
        description: "The storefront, its API and the order pipeline",
        pushedAt: "2026-09-01T11:30:00Z",
        htmlUrl: "https://github.com/acme/shop",
      },
      branches: { main: { "docs/checkout.arch": CHECKOUT_FILE }, "feature/returns": {} },
      commits: [
        commit("3f9c2a7e5b1d4c8a9e0f2b3c4d5e6f7a8b9c0d1e", "Add order events queue\n\nOrders publish to SQS after payment.", "danakim", "Dana Kim", "2026-09-01T11:30:00Z", "acme/shop"),
        commit("9b1d4e0c7a2f5b8e1d3c6a9f0e2b4d7c8a1f3e5b", "Split the API into route modules", "jordanlee", "Jordan Lee", "2026-08-31T16:05:00Z", "acme/shop"),
      ],
    },
    {
      info: {
        fullName: "acme/payments",
        owner: "acme",
        name: "payments",
        private: true,
        defaultBranch: "main",
        description: "Charges, refunds and the ledger",
        pushedAt: "2026-08-31T15:00:00Z",
        htmlUrl: "https://github.com/acme/payments",
      },
      branches: { main: { "architecture.arch": PAYMENTS_FILE } },
      commits: [
        commit("5d2e8f1a9c3b7d4e6f0a1b2c3d4e5f6a7b8c9d0e", "Add the payments architecture", "danakim", "Dana Kim", "2026-08-31T15:00:00Z", "acme/payments"),
      ],
    },
  ],
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
    title: "Guide, examples and samples",
    intro:
      "Reading for the agent. `get_guide` comes first: everything else on the server assumes the agent knows the language, and the guide ends with the whole specification. The worked examples teach the language; the samples are the dashboard's starting points.",
    tools: ["get_guide", "list_examples", "get_example", "list_samples", "get_sample"],
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
    tools: [
      "list_projects",
      "get_project",
      "create_project",
      "update_project",
      "rename_project",
      "duplicate_project",
      "delete_project",
    ],
  },
  {
    title: "Canvas",
    intro: "Change how the diagram is drawn without touching the architecture. Each saves a revision.",
    tools: ["set_display", "move_components", "auto_layout_project"],
  },
  {
    title: "History and review",
    intro:
      "Every save is a revision: who made it (the user, an agent by its client's name, or a commit to the file the project is stored in), when, and the one-line summary. The app shows the same history, and highlights the changes the user didn't make until they review them.",
    tools: ["get_history", "get_revision", "diff_project", "restore_revision", "mark_reviewed"],
  },
  {
    title: "Sharing and images",
    intro:
      "A shared project can be opened by anyone with its link, read-only, and embedded in a README as a live image. For an image now, without sharing, `render_diagram` gives a link that works for an hour.",
    tools: ["share_project", "get_shared_project", "render_diagram"],
  },
  {
    title: "Code and drift",
    intro:
      "Tie a project to the code it describes: link its repository, see the commits there, then record whether the code still matches the document. Findings appear on the canvas.",
    tools: ["link_repository", "list_github_commits", "report_drift", "get_drift", "dismiss_drift_finding", "clear_drift"],
  },
  {
    title: "Stored in GitHub",
    intro:
      "A project can be stored in a `.arch` file in a GitHub repository: the file on its branch is the source of truth, the canvas follows it, and edits in Archer are a draft that is published back, as a pull request by default. These tools act with the user's own GitHub access, which Archer holds server-side; agents never see a token.",
    tools: [
      "list_github_repos",
      "list_arch_files",
      "import_from_github",
      "move_to_github",
      "sync_with_github",
      "publish_to_github",
      "stop_syncing",
    ],
  },
  {
    title: "Workspaces",
    intro:
      "Project tools act on one workspace at a time, the current one. It starts as Personal. The choice is stored for the user, so the CLI and every agent they connect move together. Team workspaces are shared with other people.",
    tools: [
      "get_workspace_info",
      "list_workspaces",
      "use_workspace",
      "create_workspace",
      "rename_workspace",
      "delete_workspace",
      "leave_workspace",
    ],
  },
  {
    title: "Members",
    intro:
      "Who can use a team workspace, and how: owners manage members, editors change projects, viewers only read. Anyone invited by email gets access when they sign in to Archer with that address.",
    tools: ["list_members", "invite_member", "set_member_role", "remove_member"],
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
      source: 'arch "Link Shortener" v0.1\n\ncomponent browser "Browser" @browser\n…',
    },
    notes: [
      "`source` is canonical and validates clean, so it can go straight to `create_project` to give the user an editable copy. Each example is also the resource `archer://examples/<slug>`.",
    ],
  },
  list_samples: {
    access: "none",
    args: {},
    result: [
      {
        slug: "acme-saas",
        title: "Acme SaaS",
        description: "Next.js on Vercel, Supabase Postgres, Cognito sign-in and Stripe checkout.",
      },
      "…",
    ],
    notes: [
      "The dashboard's **From sample** gallery, in its order. Each sample is also the resource `archer://samples/<slug>`.",
    ],
  },
  get_sample: {
    access: "none",
    args: { slug: "ai-support-agent" },
    result: {
      slug: "ai-support-agent",
      title: "AI Support Agent",
      description: "A Claude support agent with RAG, MCP tools, guardrails and human approval.",
      source: 'arch "AI Support Agent" v0.1\n\ncomponent widget "Chat Widget" @chat_ui {\n…',
    },
    notes: [
      "`source` is canonical and validates clean: pass it to `create_project` to start a project from the sample, which is what choosing it in the gallery does.",
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
# - If you write Archer back, follow the grammar above and NEVER emit a
#   \`layout\` block — layout is machine-managed presentation, not architecture.

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
`,
    notes: [
      "Pass `source` or `project_id`. The output is what the editor's **Copy for agent** puts on the clipboard.",
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
      glyphs_for_custom_types: ["box", "circle", "database", "table", "…"],
    },
    notes: [
      "`search` filters the catalog and custom types only; connection types and glyphs are always listed in full. Custom types come from the current workspace; if they can't be read, `note` says so.",
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
      {
        id: PROJECT,
        title: "Shop",
        updated: "2026-09-01T10:00:00.000Z",
        editor_url: EDITOR_URL,
        repository: { full_name: "acme/shop", branch: "main" },
      },
      "…",
    ],
    notes: [
      "Most recently updated first. Only the current workspace: see `list_workspaces`.",
      "`repository` is the linked repository, or null. It has the file's `path` when the project is stored in one.",
    ],
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
      share_url: SHARE_URL,
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
      "`drift` is null until a drift check is reported, `share_url` while sharing is off (`share_project`), and `repository` until one is linked.",
      "For a project stored in a repository file, `repository` also has the file's `path` and its `sync` state: `base_commit` (the file version the project is based on), `unpublished_changes`, the open `pull_request`, and `conflict` with its `conflicts` or a `problem` when the last sync failed. Its `hint` tells agents working in that repository to edit the file.",
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
  rename_project: {
    access: "write",
    args: { project_id: PROJECT, title: "Storefront" },
    result: { id: PROJECT, title: "Storefront", previous_title: "Shop", saved: true, editor_url: EDITOR_URL },
    notes: [
      "Only the `arch \"…\"` header line changes, so the rest of the source is kept exactly. The revision's summary reads `Renamed the project to \"Storefront\"`; renaming to the current title saves nothing (`saved: false`).",
      "For a project stored in a repository file the title is part of the architecture, so the rename goes to the draft to publish, and a `note` says so.",
    ],
  },
  duplicate_project: {
    access: "write",
    args: { project_id: PROJECT },
    result: {
      id: "k57e4nx8qv2mt6zr9wb1hc5yj3pd0asf",
      title: "Shop copy",
      editor_url: `${APP}/documents/k57e4nx8qv2mt6zr9wb1hc5yj3pd0asf`,
      copied_from: PROJECT,
    },
    notes: [
      "The copy has the original's source and canvas arrangement, and a history of its own that starts with the copy. It isn't shared, linked to a repository or stored in one. Pass `title` to name it.",
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
  move_components: {
    access: "write",
    args: { project_id: PROJECT, moves: [{ path: "stripe", at: [22, 2] }] },
    result: { id: PROJECT, placed: [{ path: "stripe", at: [22, 2], size: [4, 3] }], saved: true },
    notes: [
      "`placed` is where each component ended up: one inside a container can't sit above or left of the container's inner origin, containers grow to fit what's moved into them, and sizes are at least 2 × 2.",
      "Moving never changes what a component is inside: that's the architecture, changed with `update_project`.",
    ],
  },
  auto_layout_project: {
    access: "write",
    args: { project_id: PROJECT, reset: true },
    result: { id: PROJECT, reset: true, saved: true },
    notes: [
      "Without `reset`, only components that have no position are placed, next to what they connect to (\"Placed unpositioned components\"). With `reset: true` every position is recomputed (\"Re-arranged the canvas\") and collapsed containers stay collapsed: the user's arrangement survives only in the previous revision.",
      "`paths` re-arranges just those components and everything inside them, like the editor's **Re-layout selection**: siblings keep their top-left corner, and a container whose children are all named is re-arranged from its origin and resized to fit. The result then carries `paths`.",
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
        reviewed: true,
      },
      {
        revision_id: REV_CREATED,
        created_at: "2026-09-01T09:00:00.000Z",
        author: { kind: "agent", name: "Claude Code" },
        summary: "Created the project",
        title: "Shop",
        changes: { ...REVISION_CHANGES, added: 4, changed: 0, connectionsAdded: 2 },
        description: "+4 components, +2 connections",
        reviewed: true,
      },
    ],
    notes: [
      "Newest first. `changes` counts the differences from the revision before; moving things on the canvas doesn't count.",
      "Every agent save is its own revision. The user's saves in the app have no `summary`, and one made within five minutes of their last joins that revision.",
      "`reviewed` is false for changes by agents or by commits that the user hasn't reviewed yet (`mark_reviewed`); their own saves are always reviewed. A revision imported from a commit to the repository file has `author.kind: \"git\"` and a `commit` with its `sha` and `url`.",
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
    notes: ["To roll the project back to it, use `restore_revision`."],
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
      "A changed component lists its changed `fields`: `name`, `type`, `desc`, `src` or `payloads`. A connection is `changed` when only its payloads differ, and `title` appears when the document was renamed.",
      "`compare` replaces the revision ids: `since_review` diffs the revision the user last reviewed (or `empty`) against `current`; `unpublished` diffs `repository`, the file as last synced (or `empty` before the file exists), against `current`; `incoming` diffs `current` against `incoming`, the repository's conflicting version of the file.",
    ],
  },
  restore_revision: {
    access: "write",
    args: { project_id: PROJECT, revision_id: REV_CREATED },
    result: { id: PROJECT, title: "Shop", restored_from: REV_CREATED, saved: true, editor_url: EDITOR_URL },
    notes: [
      "The project becomes the revision's source exactly, `layout` block included, so the canvas looks as it did then. The revision's summary reads `Restored the version from <time>` unless you pass `summary`.",
      "When the project already matches the revision nothing is saved: `saved` is false and a `note` says so.",
    ],
  },
  mark_reviewed: {
    access: "write",
    args: { project_id: PAYMENTS },
    result: { id: PAYMENTS, marked_reviewed: 1 },
    notes: [
      "`marked_reviewed` counts the revisions that were waiting for review. Afterwards `get_history` lists them as reviewed, and `diff_project` with `compare: \"since_review\"` starts from here.",
      "Review is kept per project, not per person: it clears the highlights for everyone in the workspace, as in the app.",
    ],
  },
  share_project: {
    access: "write",
    args: { project_id: PROJECT, enabled: true },
    result: {
      id: PROJECT,
      shared: true,
      url: SHARE_URL,
      image_url: `${SHARE_URL}/image.svg`,
      embed: {
        light: `![Architecture](${SHARE_URL}/image.svg)`,
        dark: `![Architecture](${SHARE_URL}/image.svg?theme=dark)`,
      },
    },
    notes: [
      "The page at `url` shows the canvas and the code, read-only, to anyone who has the link. The image re-renders on every save. Turning sharing on while it's on returns the same link.",
      "`enabled: false` answers `{ id, shared: false }`; the link and the image stop working at once.",
    ],
  },
  get_shared_project: {
    access: "public",
    args: { link: SHARE_URL },
    result: {
      project_id: PROJECT,
      title: "Shop",
      updated: "2026-09-01T10:00:00.000Z",
      url: SHARE_URL,
      repository: { full_name: "acme/shop", branch: "main" },
      source: 'arch "Shop" v0.1\n\ncomponent web "Storefront" @vercel.nextjs\n…',
    },
    notes: [
      "Works for a project in any workspace while its sharing is on. `project_id` works with the other project tools only for members of its workspace.",
      "`repository` also has the file's `path` when the project is stored in one.",
    ],
  },
  render_diagram: {
    access: "read",
    args: { project_id: PROJECT, theme: "dark" },
    result: {
      project_id: PROJECT,
      theme: "dark",
      url: `${APP}/api/render/eyJ1IjoidXNlcl8yd0t4OVRxTG00UmJWYzdOcFozaEpkOHNGeUEi…svg`,
      expires_at: "2026-09-01T11:00:00.000Z",
    },
    notes: [
      "The image is drawn like a share link's: the canvas arrangement, collapsed containers as single boxes, typed and labeled connections, custom types in their colors. It's drawn when the link is opened, as the user who asked for it, so it stops working if they lose access to the project.",
      "The link is signed and expires after an hour. It's a link rather than the SVG so a big diagram doesn't fill the agent's context. A project with syntax errors can't be drawn: the error result is `{ message, errors }`.",
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
      "Linking is a pointer: nothing is read from GitHub. To store the project in a file in the repository, use `move_to_github`.",
    ],
  },
  list_github_commits: {
    access: "github",
    args: { project_id: PROJECT },
    result: {
      repository: "acme/shop",
      branch: "main",
      page: 1,
      commits: [
        {
          sha: "3f9c2a7e5b1d4c8a9e0f2b3c4d5e6f7a8b9c0d1e",
          message: "Add order events queue",
          author: "danakim",
          date: "2026-09-01T11:30:00Z",
          url: "https://github.com/acme/shop/commit/3f9c2a7e5b1d4c8a9e0f2b3c4d5e6f7a8b9c0d1e",
        },
        "…",
      ],
      has_more: false,
    },
    notes: [
      "`message` is the commit's first line and `author` its GitHub login, else the git author's name. Pass `page` for older commits while `has_more` is true, or `since` for only the ones after a time, say the last drift report.",
      "Needs the user's GitHub account to be able to read the repository.",
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
  dismiss_drift_finding: {
    access: "write",
    args: { project_id: PROJECT, index: 1 },
    result: {
      project_id: PROJECT,
      dismissed: { status: "extra", name: "Email Worker", src: "apps/worker/email" },
      remaining: 1,
    },
    notes: [
      "`index` is the finding's position in `get_drift`'s `findings`. Dismissing the last one leaves an empty report, which reads as in sync.",
    ],
  },
  clear_drift: {
    access: "write",
    args: { project_id: PROJECT },
    result: { project_id: PROJECT, cleared: true },
    notes: [
      "Afterwards `get_drift` answers `report: null` and `get_project`'s `drift` is null. Clearing a project that has no report succeeds.",
    ],
  },

  // --- stored in GitHub --------------------------------------------------------------
  list_github_repos: {
    access: "github",
    args: { search: "acme" },
    result: {
      repositories: [
        {
          full_name: "acme/shop",
          private: true,
          default_branch: "main",
          description: "The storefront, its API and the order pipeline",
          pushed_at: "2026-09-01T11:30:00Z",
          url: "https://github.com/acme/shop",
        },
        "…",
      ],
      github_connected: true,
      private_access: true,
    },
    notes: [
      "Most recently pushed first, at most 50; `more` counts the rest. A `note` explains when the user's Archer account has no GitHub token, or when GitHub hides their private repositories (`private_access: false`). Granting access happens in the app, in the browser.",
    ],
  },
  list_arch_files: {
    access: "github",
    args: { repository: "acme/payments" },
    result: {
      repository: "acme/payments",
      branch: "main",
      default_branch: "main",
      branches: ["main"],
      files: [{ path: "architecture.arch", project_id: PAYMENTS }],
      truncated: false,
    },
    notes: [
      "`project_id` is set when a project in the current workspace is stored in that file, so it isn't imported twice.",
      "`truncated` means the repository is too big to list every file: a file that isn't listed can still be named.",
    ],
  },
  import_from_github: {
    access: "github_write",
    args: { repository: "acme/shop", path: "docs/checkout.arch" },
    result: {
      id: "k57d9vx2qm4tb8zr1wn6hc3yj0pf5ase",
      title: "Checkout",
      imported: true,
      editor_url: `${APP}/documents/k57d9vx2qm4tb8zr1wn6hc3yj0pf5ase`,
      repository: { full_name: "acme/shop", branch: "main", path: "docs/checkout.arch" },
      note: "Imported docs/checkout.arch from main. The file is the source of truth from now on.",
    },
    notes: [
      "The project's first revision is the file's last commit, credited to its author. A file with errors isn't imported: the error result is `{ message, errors }` with its diagnostics.",
      "A path that doesn't exist yet gives a blank project named after the repository (`imported: false`), and `publish_to_github` creates the file.",
    ],
  },
  move_to_github: {
    access: "github_write",
    args: { project_id: PROJECT, path: "architecture.arch" },
    result: {
      id: PROJECT,
      repository: { full_name: "acme/shop", branch: "main", path: "architecture.arch" },
      file_existed: false,
      note: "publish_to_github creates architecture.arch on main.",
    },
    notes: [
      "`repository` defaults to the one the project is linked to, and `branch` to its linked branch. Nothing is written to GitHub until `publish_to_github`.",
      "When the file exists already, the project becomes a draft that replaces it (`file_existed: true`), and publishing opens a pull request by default so the replacement is reviewed. A project that is already stored in a file is refused: `stop_syncing` first.",
    ],
  },
  sync_with_github: {
    access: "github_write",
    args: { project_id: PAYMENTS },
    result: {
      id: PAYMENTS,
      status: "unchanged",
      message: "Up to date: architecture.arch hasn't changed on main since the last sync.",
      sync: {
        base_commit: "5d2e8f1a9c3b7d4e6f0a1b2c3d4e5f6a7b8c9d0e",
        unpublished_changes: true,
        pull_request: null,
        conflict: false,
        conflicts: [],
        problem: null,
      },
    },
    notes: [
      "`status` is `unchanged`; `missing` (the file isn't on the branch yet); `adopted` (the branch already has the draft's architecture); `imported` or `merged`, with the `commit` and its `author`; `conflict`, with the `conflicts`; or `problem`, when the file has errors or was deleted (the last good version stays).",
      "With `resolve`, the recorded conflict is merged again, keeping the draft's (`draft`) or the repository's (`repo`) side of every conflicting item, then the sync runs. Without a conflict, `resolve` is refused.",
    ],
  },
  publish_to_github: {
    access: "github_write",
    args: { project_id: PAYMENTS, message: "Add the fraud scorer" },
    result: {
      id: PAYMENTS,
      mode: "pr",
      number: 42,
      url: "https://github.com/acme/payments/pull/42",
      updated: false,
      repository: { full_name: "acme/payments", branch: "main", path: "architecture.arch" },
    },
    notes: [
      "A pull request comes from a new `archer/…` branch and lists the changes in its description; publishing again while it's open adds a commit to it (`updated: true`). `mode: \"commit\"` answers `{ id, mode: \"commit\", commit, url, repository }`.",
      "Refused when there's nothing to publish, while the document has errors, or while a conflict waits. When the file changed on the branch since the last sync, the tool syncs first and says what happened in `synced_first`; if that sync finds a conflict, nothing is published and the error lists it.",
      "Commits use the user's own GitHub access. Where the Archer GitHub App is installed, a pull request can come from the App when the user can't write to the repository.",
    ],
  },
  stop_syncing: {
    access: "write",
    args: { project_id: PAYMENTS },
    result: {
      id: PAYMENTS,
      stopped_syncing: { full_name: "acme/payments", branch: "main", path: "architecture.arch" },
      repository: { full_name: "acme/payments", branch: "main" },
      note: "The project is stored in Archer again. architecture.arch is untouched, and acme/payments stays linked.",
    },
    notes: [
      "Unpublished changes stay in the project. To unlink the repository too, use `link_repository` with `repository: null`.",
    ],
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
      project_count: 2,
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
        { id: PLATFORM, name: "Platform", kind: "team", role: "owner", current: false },
      ],
    },
    notes: [
      "Personal comes first; its id is the user's id. Team workspaces follow by name.",
      "Invitations addressed to the user's email are accepted first, as signing in to the app does, so a team they were just invited to shows up here.",
    ],
  },
  use_workspace: {
    access: "account",
    args: { workspace_id: TEAM },
    result: { current_workspace_id: TEAM, name: "Acme", kind: "team", role: "editor", visible_projects: 0 },
    notes: [
      "Also switches the CLI (`archer workspace`) and the user's other agents. In a workspace where the user is a viewer, the result carries a `note` and writes are refused.",
    ],
  },
  create_workspace: {
    access: "account",
    args: { name: "Data Platform" },
    result: {
      workspace_id: "jn79dz3xq6vm1tk8wr4bc2hy5pf0nase",
      name: "Data Platform",
      kind: "team",
      role: "owner",
      current: false,
      note: "use_workspace switches to it; invite_member adds people.",
    },
    notes: [
      "The user is its only member until they invite people. It doesn't become current: agents and the CLI keep working where they were.",
    ],
  },
  rename_workspace: {
    access: "owner",
    args: { workspace_id: PLATFORM, name: "Platform Team" },
    result: { workspace_id: PLATFORM, name: "Platform Team", previous_name: "Platform" },
    notes: ["Personal can't be renamed."],
  },
  delete_workspace: {
    access: "owner",
    args: { workspace_id: PLATFORM, confirm: true },
    result: { deleted: PLATFORM, name: "Platform", projects_deleted: 0 },
    notes: [
      "Everything in it goes: its projects with their history and drift reports, and its custom types. When it was the current workspace, a `note` says project tools are back on Personal. Personal can't be deleted.",
    ],
  },
  leave_workspace: {
    access: "account",
    args: { workspace_id: TEAM, confirm: true },
    result: { left: TEAM, name: "Acme" },
    notes: [
      "The last signed-in owner can't leave: they make someone else an owner first (`set_member_role`), or delete the workspace.",
    ],
  },

  // --- members -------------------------------------------------------------------------
  list_members: {
    access: "member",
    args: { workspace_id: PLATFORM },
    result: {
      workspace_id: PLATFORM,
      name: "Platform",
      your_role: "owner",
      members: [
        { member_id: MEMBER_YOU, email: "jordan@acme.dev", role: "owner", pending: false, you: true, added: "2026-08-20T09:00:00.000Z" },
        { member_id: MEMBER_DANA, email: "dana@acme.dev", role: "editor", pending: false, you: false, added: "2026-08-21T09:00:00.000Z" },
        { member_id: MEMBER_SAM, email: "sam@acme.dev", role: "viewer", pending: true, you: false, added: "2026-08-22T09:00:00.000Z" },
      ],
    },
    notes: ["Oldest first. A `pending` member was invited and hasn't signed in yet."],
  },
  invite_member: {
    access: "owner",
    args: { workspace_id: PLATFORM, email: "lee@acme.dev", role: "editor" },
    result: {
      workspace_id: PLATFORM,
      member_id: "mh7d3xq8zv5k1tb9wn2rc6hy4jd0pf7e",
      email: "lee@acme.dev",
      role: "editor",
      pending: true,
      note: "Platform appears for lee@acme.dev when they sign in to Archer with GitHub using that address. Archer doesn't email them: let them know.",
    },
    notes: [
      "`role` defaults to `editor`. Inviting an address that's already there changes its role instead, and the `note` says so; that can't leave the workspace without a signed-in owner either.",
      "The invitation becomes a membership when that person signs in to the app, or when their own agent next lists workspaces.",
    ],
  },
  set_member_role: {
    access: "owner",
    args: { workspace_id: PLATFORM, member_id: MEMBER_DANA, role: "owner" },
    result: { workspace_id: PLATFORM, member_id: MEMBER_DANA, email: "dana@acme.dev", role: "owner", previous_role: "editor" },
    notes: ["Refused when it would leave the workspace without a signed-in owner."],
  },
  remove_member: {
    access: "owner",
    args: { workspace_id: PLATFORM, member_id: MEMBER_SAM, confirm: true },
    result: { workspace_id: PLATFORM, removed: MEMBER_SAM, email: "sam@acme.dev", role: "viewer", pending: true },
    notes: ["Removing a pending member withdraws the invitation. The last signed-in owner can't be removed."],
  },
};
