/**
 * Every .arch document the film shows, with the layout it is drawn with.
 * test/sources.test.ts parses and validates each one, so what the film
 * shows is real, valid Archer. Pure data: no DOM.
 */

export const OPEN_SOURCE = `arch "Acme" v0.1

component web "Web app" @vercel.nextjs
component api "API" @aws.lambda
component db "Postgres" @neon

web -> api @http
api -> db @sql
`;

export const OPEN_LAYOUT = `
layout {
  web: { at: [0, 0], size: [4, 2] }
  api: { at: [7, 0], size: [4, 2] }
  db: { at: [14, 0], size: [4, 2] }
}
`;

/** The editor scene's file once every edit in it has landed. */
export const LOOP_LINES = [
  `arch "Acme" v0.1`,
  ``,
  `component web "Web app" @vercel.nextjs`,
  `component api "API" @aws.lambda`,
  `component db "Postgres" @neon`,
  `component cache "Cache" @redis`,
  `component jobs "Jobs" @aws.sqs`,
  ``,
  `web -> api @http`,
  `api -> db @sql`,
  `api -> cache @reads`,
  `api -> jobs @queue : "enqueue"`,
];
export const LOOP_SOURCE = LOOP_LINES.join("\n") + "\n";

export const LOOP_LAYOUT = `
layout {
  web: { at: [0, 2], size: [4, 2] }
  api: { at: [6, 2], size: [4, 2] }
  db: { at: [12, 0], size: [4, 2] }
  cache: { at: [12, 4], size: [4, 2] }
  jobs: { at: [6, 6], size: [4, 2] }
}
`;

export const NEST_SOURCE = `arch "Acme" v0.1

component web "Web app" @vercel.nextjs
component api "API" @aws.api_gateway
component vpc "Private network" @aws.vpc {
  component queue "Jobs" @aws.sqs
  component worker "Workers" @aws.lambda
  component orders "Orders DB" @aws.rds {
    desc "Every order, with its line items and refunds."
    schema table \`\`\`
    | column      | type        |
    | ----------- | ----------- |
    | id          | uuid        |
    | customer_id | uuid        |
    | total_cents | int         |
    | status      | text        |
    | created_at  | timestamptz |
    \`\`\`
  }
}

web -> api @http
api -> vpc.queue @queue
vpc.queue -> vpc.worker @triggers
vpc.worker -> vpc.orders @sql
`;

export const NEST_LAYOUT = `
layout {
  web: { at: [0, 3], size: [4, 2] }
  api: { at: [6, 3], size: [4, 2] }
  vpc: { at: [12, 0], size: [19, 7], display: plane }
  vpc.queue: { at: [1, 3], size: [4, 2] }
  vpc.worker: { at: [7, 3], size: [4, 2] }
  vpc.orders: { at: [13, 3], size: [4, 2] }
}
`;

/** Every tool the hosted server registers (packages/mcp TOOL_GROUPS; test/sources.test.ts keeps it honest). */
export const MCP_TOOLS = [
  "get_guide",
  "list_examples",
  "get_example",
  "validate_source",
  "format_source",
  "compile_for_agent",
  "auto_layout_source",
  "list_types",
  "create_custom_type",
  "delete_custom_type",
  "list_projects",
  "get_project",
  "create_project",
  "update_project",
  "delete_project",
  "set_display",
  "auto_layout_project",
  "get_history",
  "get_revision",
  "diff_project",
  "link_repository",
  "report_drift",
  "get_drift",
  "get_workspace_info",
  "list_workspaces",
  "use_workspace",
];

export const MCP_COMMAND = "claude mcp add --transport http archer https://archer.tombyrne.dev/mcp";

export const AGENT_SOURCE = `arch "Storefront" v0.1

component web "Storefront" @vercel.nextjs
component search "Search" @algolia
component api "Orders API" @aws.lambda
component pay "Payments" @stripe
component db "Orders DB" @aws.rds
component mail "Receipts" @resend

web -> api @http
web -> search @http
api -> pay @http : "charge"
api -> db @sql
api -> mail @event
`;

export const AGENT_LAYOUT = `
layout {
  web: { at: [0, 2], size: [4, 2] }
  search: { at: [0, 7], size: [4, 2] }
  api: { at: [7, 2], size: [4, 2] }
  pay: { at: [14, 0], size: [4, 2] }
  db: { at: [14, 4], size: [4, 2] }
  mail: { at: [14, 8], size: [4, 2] }
}
`;

export const SHARE_URL = "https://archer.tombyrne.dev/share/k3v9x2/image.svg";

export const SHARE_SOURCE = `arch "Acme" v0.1

component web "Web app" @vercel.nextjs
component api "API" @aws.lambda
component db "Postgres" @neon
component cache "Cache" @redis

web -> api @http
api -> db @sql
api -> cache @reads
`;

export const SHARE_LAYOUT = `
layout {
  web: { at: [0, 2], size: [4, 2] }
  api: { at: [6, 2], size: [4, 2] }
  db: { at: [12, 0], size: [4, 2] }
  cache: { at: [12, 4], size: [4, 2] }
}
`;

