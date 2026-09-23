/**
 * Worked examples for the docs (`/language/examples`). Each source is exactly
 * what the app saves for that document (canonical form, validates clean), so
 * the rendered image, the code block and the editor copy all agree.
 */

export interface Example {
  /** URL fragment and `/new?example=` key. */
  slug: string;
  /** Matches the `arch "…"` header. */
  title: string;
  summary: string;
  /** What the example teaches, for the table of contents. */
  features: string[];
  source: string;
}

const FENCE = "```";

export const EXAMPLES: readonly Example[] = [
  {
    slug: "components-and-connections",
    title: "Link Shortener",
    summary:
      "The smallest useful document: a header, a few typed components and the connections between them. A `@type` picks the icon and color; a label says what travels on an arrow.",
    features: ["components", "types", "connections", "labels"],
    source: `arch "Link Shortener" v0.1

component browser "Browser" @browser

component app "Web App" @vercel.nextjs

component api "API" @vercel.functions

component db "Links" @postgres

component cache "Hot Links" @redis

api -> cache @reads : "resolve"
api -> db @sql
app -> api @http : "shorten"
browser -> app @http
`,
  },
  {
    slug: "arrows-and-untyped-components",
    title: "Team Chat",
    summary:
      "Three arrow kinds: `->` is directed, `<->` goes both ways, `--` is an undirected association. Components without a type render as generic boxes and are fully valid, so you can sketch your own services before picking technology.",
    features: ["arrow kinds", "untyped components"],
    source: `arch "Team Chat" v0.1

component client "Chat Client" @browser

component gateway "Realtime Gateway"

component chat "Chat Service"

component presence "Presence"

component messages "Messages" @mongodb

component online "Online Users" @redis

chat -> messages @writes
client <-> gateway @ws : "live updates"
gateway -> chat @grpc
gateway -> presence @grpc
presence -- online : "heartbeats"
`,
  },
  {
    slug: "nesting",
    title: "Storefront",
    summary:
      "Components nest inside components. A child is referenced by its dot-path from the root (`backend.orders`), and connections cross container boundaries freely. A component with children renders as a plane, with its children laid out inside.",
    features: ["nesting", "dot-paths", "planes"],
    source: `arch "Storefront" v0.1

component web "Web Shop" @vercel.nextjs

component backend "Backend" @aws {
  component gateway "API Gateway" @aws.api_gateway
  component orders "Orders" @aws.lambda
  component catalog "Catalog" @aws.lambda
}

component payments "Payments" @stripe

component search "Search" @elasticsearch

backend.catalog -> search @http : "query"
backend.gateway -> backend.catalog @http
backend.gateway -> backend.orders @http
backend.orders -> payments @http : "charge"
web -> backend.gateway @http
`,
  },
  {
    slug: "descriptions-and-payloads",
    title: "Billing Service",
    summary:
      "A component body holds a `desc`, a `src` pointer into the codebase, and named payloads. `json`, `yaml` and `table` payloads are validated; `markdown` is freeform. The editor shows them in the detail panel, and agents read them as the spec.",
    features: ["descriptions", "source links", "payloads"],
    source: `arch "Billing Service" v0.1

component dashboard "Dashboard" @vercel.nextjs

component api "Billing API" @service {
  desc "Owns plans, subscriptions and invoices. Stateless."
  src "services/billing"
  endpoints table ${FENCE}
  | method | path           | purpose              |
  | ------ | -------------- | -------------------- |
  | POST   | /subscriptions | start a subscription |
  | GET    | /invoices/:id  | fetch an invoice     |
  ${FENCE}
  env yaml ${FENCE}
  STRIPE_SECRET_KEY: secret
  DATABASE_URL: secret
  ${FENCE}
  notes markdown ${FENCE}
  Every write takes an \`Idempotency-Key\` header, so retries are safe.
  ${FENCE}
}

component db "Billing DB" @postgres {
  desc "Plans, subscriptions and invoice rows."
  schema json ${FENCE}
  {
    "plans": { "id": "text pk", "price_cents": "int" },
    "subscriptions": { "id": "uuid pk", "plan_id": "text fk plans.id" }
  }
  ${FENCE}
}

component stripe "Stripe" @stripe

api -> db @sql
api -> stripe @http : "charges"
dashboard -> api @http
`,
  },
  {
    slug: "connection-payloads",
    title: "Order Events",
    summary:
      "Connections carry payloads too: a message schema on an event, a request body on an HTTP call. The canonical form sorts connections by source path and writes one with a body as its own block.",
    features: ["connection payloads", "canonical order"],
    source: `arch "Order Events" v0.1

component checkout "Checkout" @service

component bus "Event Bus" @kafka

component receipts "Receipts" @worker

component fulfilment "Fulfilment" @worker

component resend "Resend" @resend

bus -> fulfilment @stream
bus -> receipts @stream

checkout -> bus @event : "placed" {
  message json ${FENCE}
  { "order_id": "uuid", "total_cents": "int", "placed_at": "timestamp" }
  ${FENCE}
}

receipts -> resend @http : "email"
`,
  },
  {
    slug: "layout",
    title: "Analytics Platform",
    summary:
      "Positions, sizes and display mode live in the `layout` block at the end of the file. The canvas writes it when you drag, resize or collapse; agents ignore it and never write it. Here the warehouse is collapsed to an icon (`display: icon`), so its arrows attach to the icon until you click into it.",
    features: ["the layout block", "planes and icons"],
    source: `arch "Analytics Platform" v0.1

component app "Product" @vercel.nextjs

component ingest "Ingest" @gcp {
  component collector "Collector" @gcp.cloud_run
  component topic "Events" @gcp.pubsub
}

component warehouse "Warehouse" @gcp {
  component loader "Loader" @gcp.cloud_run
  component bq "BigQuery" @gcp.bigquery
}

component dashboards "Dashboards" @grafana

app -> ingest.collector @http : "track"
dashboards -> warehouse.bq @reads
ingest.collector -> ingest.topic @event
ingest.topic -> warehouse.loader @stream
warehouse.loader -> warehouse.bq @writes

layout {
  app: { at: [0, 2], size: [4, 3] }
  dashboards: { at: [23, 7], size: [4, 3] }
  ingest: { at: [7, 0], size: [13, 6], display: plane }
  ingest.collector: { at: [1, 2], size: [4, 3] }
  ingest.topic: { at: [8, 2], size: [4, 3] }
  warehouse: { at: [23, 2], size: [4, 3], display: icon }
  warehouse.bq: { at: [8, 2], size: [4, 3] }
  warehouse.loader: { at: [1, 2], size: [4, 3] }
}
`,
  },
];

export const findExample = (slug: string | null | undefined): Example | undefined =>
  EXAMPLES.find((e) => e.slug === slug);
