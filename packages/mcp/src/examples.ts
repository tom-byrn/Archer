/**
 * Worked examples: the web app's docs page (`/language/examples`) and its
 * sandboxes, and the `list_examples` / `get_example` tools for agents. Each
 * source is exactly what the app saves for that document (canonical form,
 * validates clean; apps/web/test/examples.test.ts), so the rendered image,
 * the code block, the editor copy and what agents read all agree.
 */

export interface Example {
  /** URL fragment, `/sandbox/<slug>` and `/new?example=` key, get_example's argument. */
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
      "The smallest useful document: a header, a few typed components and the connections between them. A `@type` picks the icon and color, a `shape` the outline; a label says what travels on an arrow.",
    features: ["components", "types", "connections", "labels"],
    source: `arch "Link Shortener" v0.2

component browser "Browser" @browser {
  shape browser
}

component app "Web App" @vercel.nextjs

component api "API" @vercel.functions

component db "Links" @postgres {
  shape cylinder
}

component cache "Hot Links" @redis {
  shape cylinder
}

api -> cache @reads : "resolve"
api -> db @sql
app -> api @http : "shorten"
browser -> app @http
`,
  },
  {
    slug: "descriptions-and-payloads",
    title: "Billing Service",
    summary:
      "A component body holds a `desc`, a `src` pointer into the codebase, and named payloads. `json`, `yaml` and `table` payloads are validated; `markdown` is freeform. The editor shows them in the detail panel, and agents read them as the spec.",
    features: ["descriptions", "source links", "payloads"],
    source: `arch "Billing Service" v0.2

component dashboard "Dashboard" @vercel.nextjs {
  shape browser
}

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
  shape cylinder
  desc "Plans, subscriptions and invoice rows."
  schema json ${FENCE}
  {
    "plans": { "id": "text pk", "price_cents": "int" },
    "subscriptions": { "id": "uuid pk", "plan_id": "text fk plans.id" }
  }
  ${FENCE}
}

component stripe "Stripe" @stripe {
  shape cloud
}

api -> db @sql
api -> stripe @http : "charges"
dashboard -> api @http
`,
  },
  {
    slug: "shapes",
    title: "Support Desk",
    summary:
      "A `shape` in a component's body draws it as what it is: a person for the customer, people for the support team, a robot for the agent, a cloud for the model provider, a book for the help center, a cylinder for the database. The type still picks the icon and color inside the outline (an \`icon\` can change the first), and anything without a shape stays a box. Shapes are for readers; an agent implementing the document can ignore them.",
    features: ["shapes"],
    source: `arch "Support Desk" v0.2

component customer "Customer" @user {
  shape person
}

component widget "Chat Widget" @chat_ui {
  shape browser
}

component agent "Support Agent" @agent {
  shape robot
  desc "Answers from the help center and the customer's orders. Hands the chat to a person when it isn't sure."
}

component claude "Claude" @anthropic {
  shape cloud
}

component articles "Help Articles" @knowledge_base {
  shape book
}

component orders "Orders" @postgres {
  shape cylinder
}

component handoffs "Handoffs" @queue {
  shape queue
}

component team "Support Team" @user {
  shape people
}

agent -> articles @reads : "search"
agent -> claude @http : "messages"
agent -> handoffs @event : "escalate"
agent -> orders @sql : "look up"
customer -> widget
handoffs -> team
widget -> agent @ws : "chat"
`,
  },
  {
    slug: "icons",
    title: "Coffee Shop",
    summary:
      "An \`icon\` in a component's body picks the icon it shows: any Phosphor icon by its snake-case name (\`coffee\`, \`receipt\`, \`device_tablet\`) or one of the catalog's (\`database\`, \`queue\`). An untyped component shows no icon until it picks one, so an icon is the quickest way to say what something is without a type. On a typed component it replaces the type's icon and keeps its color, like the book on the Postgres menu. Icons are for readers; an agent implementing the document can ignore them. \`list_types\` lists every icon, and the editor's Icon picker searches them.",
    features: ["icons"],
    source: `arch "Coffee Shop" v0.2

component customer "Customer" @user {
  shape person
}

component kiosk "Order Kiosk" {
  icon device_tablet
}

component app "Mobile App" @mobile {
  shape phone
}

component orders "Orders" {
  icon receipt
  desc "Takes orders from the kiosk and the app, and tracks each drink from paid to picked up."
}

component payments "Payments" @stripe {
  shape cloud
}

component barista "Barista Screen" {
  icon coffee
  desc "The queue of drinks to make, oldest first."
}

component loyalty "Loyalty" {
  icon gift
  desc "A stamp per paid order; the tenth drink is free."
}

component menu "Menu" @postgres {
  shape cylinder
  icon book_open
}

app -> orders @http : "order"
customer -> app
customer -> kiosk
kiosk -> orders @http : "order"
orders -> barista @ws : "new drink"
orders -> loyalty @event : "paid"
orders -> menu @sql : "prices"
orders -> payments @http : "charge"
`,
  },
  {
    slug: "planes",
    title: "Photo Sharing",
    summary:
      "A `plane` is a titled region of the canvas, a background you put components on: the user's devices on one, the AWS account on another, and a VPC inside that. Planes are only for the reader. They don't change a component's path (`api`, not `cloud.api`), connections never attach to them, and like a component a plane can take a `@type` and a `desc`.",
    features: ["planes", "planes inside planes"],
    source: `arch "Photo Sharing" v0.2

component user "User" @user {
  shape person
}

plane frontend "Frontend" {
  desc "Everything that runs on the user's device."
  component web "Web App" @vercel.nextjs {
    shape browser
  }
  component mobile "Mobile App" @mobile {
    shape phone
  }
}

plane cloud "AWS" @aws {
  desc "One account, one region."
  component api "API" @aws.api_gateway
  component photos "Photos" @aws.s3 {
    shape bucket
    desc "Originals and resized copies, served through signed URLs."
  }
  plane vpc "VPC" @aws.vpc {
    component uploads "Uploads" @aws.lambda {
      desc "Hands out upload URLs, then resizes what lands in Photos."
    }
    component db "Metadata" @aws.rds {
      shape cylinder
    }
  }
}

api -> db @sql : "feeds"
api -> uploads @http : "presign"
mobile -> api @http
uploads -> db @writes
uploads -> photos @writes
user -> mobile
user -> web
web -> api @http
`,
  },
  {
    slug: "nesting",
    title: "Food Delivery",
    summary:
      "Any component can hold components. Orders owns its API, checkout, tracker and database: on the canvas it's one box with a count of what's inside, and opening it shows those parts, with whatever outside they connect to along the edges. A path reaches a nested component (`orders.checkout`), and a connection can join one or the whole component (`app -> orders`).",
    features: ["nesting", "paths", "opening a component"],
    source: `arch "Food Delivery" v0.2

component app "Customer App" @mobile {
  shape phone
}

component orders "Orders" @service {
  desc "Takes an order from basket to doorstep: the API, checkout, live tracking and its own database."
  src "services/orders"
  component api "Orders API" @service {
    endpoints table ${FENCE}
    | method | path        | purpose        |
    | ------ | ----------- | -------------- |
    | POST   | /orders     | place an order |
    | GET    | /orders/:id | status and ETA |
    ${FENCE}
  }
  component checkout "Checkout" @worker {
    desc "Charges the card, then tells Dispatch the order is paid."
  }
  component tracker "Tracker" @service {
    desc "Takes each courier's position and streams it to the customer's map."
  }
  component db "Orders DB" @postgres {
    shape cylinder
  }
}

component dispatch "Dispatch" @service {
  desc "Offers each paid order to the nearest free courier."
}

component courier "Courier App" @mobile {
  shape phone
}

component stripe "Stripe" @stripe {
  shape cloud
}

app -> orders @http : "place order"
courier -> dispatch @http : "accept job"
courier -> orders.tracker @ws : "position"
orders.api -> orders.checkout @queue
orders.api -> orders.db @sql
orders.checkout -> dispatch @event : "paid"
orders.checkout -> stripe @http : "charge"
orders.tracker -> orders.db @writes
`,
  },
  {
    slug: "music-streaming",
    title: "Music Streaming",
    summary:
      "A whole product in one file: listener apps, the edge, six services in one Kubernetes cluster, their storage, analytics, and the pipeline that turns a label's delivery into playable audio. Planes mark out the regions, while the cluster and the apps nest their parts, so the top level stays readable and opening Services shows all six. All three arrow kinds appear: `->`, `<->` for the remote-control socket, and `--` for the signed URLs Playback and the CDN agree on. It was laid out by hand, so it ends with the `layout` block the canvas writes when you drag and resize; agents ignore that block and never write it.",
    features: ["planes and nesting together", "arrow kinds", "connection payloads", "the layout block"],
    source: `arch "Music Streaming" v0.2

component apps "Listener Apps" {
  icon devices
  desc "Every client talks to one API and streams from one CDN."
  component web "Web Player" @vercel.nextjs {
    shape browser
  }
  component mobile "iOS & Android" @mobile {
    shape phone
    desc "Premium listeners can download for offline play. Downloads stay encrypted on the device."
  }
}

component auth "Accounts" @auth0 {
  shape cloud
  desc "Email, Apple and Google sign-in. Issues the JWT every API call carries."
}

plane edge "Edge" @aws {
  component gateway "API Gateway" @aws.api_gateway {
    desc "The only public API. Checks the JWT, rate-limits per account, routes to services."
  }
  component sync "Device Sync" {
    icon broadcast
    desc "WebSocket hub: move playback between devices, or use a phone as the remote for a speaker."
  }
  component cdn "Audio CDN" @aws.cloudfront {
    desc "Caches encrypted audio at the edge and serves only URLs that Playback signed."
  }
}

component services "Services" @aws.eks {
  desc "Stateless services on Kubernetes, reachable from outside only through the API Gateway."
  component catalog "Catalog" @service {
    desc "Artists, albums, tracks, credits, and the markets each track may play in."
    src "services/catalog"
  }
  component search "Search" @service {
    desc "Typeahead across artists, albums, tracks and playlists."
  }
  component library "Library" @service {
    desc "Saved tracks, followed artists, and playlists, including collaborative ones."
  }
  component playback "Playback" @service {
    desc "Decides what a listener may play right now and returns a signed URL for the right rendition."
    src "services/playback"
    endpoints table ${FENCE}
    | method | path        | purpose                                |
    | ------ | ----------- | -------------------------------------- |
    | POST   | /v1/play    | resolve a track to a signed stream URL |
    | POST   | /v1/license | DRM license for this device            |
    ${FENCE}
    tiers yaml ${FENCE}
    free:
      bitrate_kbps: 160
      skips_per_hour: 6
      offline: false
    premium:
      bitrate_kbps: 320
      skips_per_hour: unlimited
      offline: true
    ${FENCE}
  }
  component recs "Recommender" @service {
    desc "Home feed, radio and a weekly mix, built from the nearest neighbors of what you play."
  }
  component subscriptions "Subscriptions" @service {
    desc "Plans, trials and family seats. Answers what a listener is entitled to."
    src "services/subscriptions"
  }
}

plane storage "Storage" {
  component catalog_db "Catalog DB" @aws.rds {
    shape cylinder
    desc "Postgres. The source of truth for metadata."
    schema json ${FENCE}
    {
      "artists": { "id": "uuid pk", "name": "text" },
      "albums": { "id": "uuid pk", "artist_id": "uuid fk artists.id", "released_on": "date" },
      "tracks": { "id": "uuid pk", "album_id": "uuid fk albums.id", "isrc": "text unique", "markets": "text[]" }
    }
    ${FENCE}
  }
  component index "Search Index" @elasticsearch {
    shape cylinder
  }
  component playlists "Playlists" @aws.dynamodb {
    shape cylinder
    desc "Libraries and playlists, partitioned by listener."
  }
  component sessions "Play Sessions" @redis {
    shape cylinder
    desc "Active streams per account, for device limits. Keys expire 30 seconds after the last heartbeat."
  }
  component events "Play Events" @kafka {
    shape queue
  }
  component embeddings "Embeddings" @pinecone {
    shape cylinder
  }
  component accounts_db "Accounts DB" @aws.rds {
    shape cylinder
  }
}

plane content "Content Ingestion" {
  component inbox "Delivery Inbox" @aws.s3 {
    shape bucket
    desc "Labels drop DDEX packages here: XML metadata, lossless masters and artwork."
  }
  component pipeline "Pipeline" @temporal {
    desc "One durable workflow per release: validate, encode, then publish on release day."
  }
  component transcoder "Transcoder" @aws.fargate {
    shape stack
    desc "FFmpeg workers. Ogg Vorbis at 96, 160 and 320 kbps plus AAC, loudness-normalized to -14 LUFS."
  }
  component audio "Audio Files" @aws.s3 {
    shape bucket
    desc "Every encoded rendition, keyed by track and bitrate."
  }
}

plane analytics "Analytics" {
  component warehouse "Warehouse" @snowflake {
    shape cylinder
  }
  component royalties "Royalties" {
    icon hand_coins
    desc "Monthly job that splits each market's revenue across rights holders by share of streams."
    rules markdown ${FENCE}
    - A stream counts after 30 seconds of play.
    - Free-tier streams share ad revenue; Premium streams share subscription revenue.
    - Statements go out by the 15th of the following month.
    ${FENCE}
  }
  component training "Model Training" @worker {
    desc "Nightly job: learns track and listener embeddings from the last 90 days of plays."
  }
}

component labels "Record Labels" @external {
  shape cloud
}

component stripe "Stripe" @stripe {
  shape cloud
}

apps -> auth @auth : "sign in"
apps -> cdn @http : "audio"
apps -> gateway @http
apps <-> sync @ws : "remote control"
cdn -> audio @reads : "origin"
events -> warehouse @stream
gateway -> services @http : "routes"
inbox -> pipeline @event
labels -> inbox @writes : "DDEX"
pipeline -> services.catalog @grpc : "publish"
pipeline -> transcoder @queue : "encode"

royalties -> labels : "statements" {
  statement table ${FENCE}
  | column       | type | notes            |
  | ------------ | ---- | ---------------- |
  | isrc         | text | recording id     |
  | market       | text | ISO country code |
  | streams      | int  | counted plays    |
  | payout_cents | int  | for the month    |
  ${FENCE}
}

royalties -> warehouse @reads
services.catalog -> catalog_db @sql
services.catalog -> index @writes : "reindex"
services.library -> playlists
services.playback -- cdn : "signed URLs"

services.playback -> events @event : "track played" {
  message json ${FENCE}
  { "listener_id": "uuid", "track_id": "uuid", "ms_played": "int", "market": "text", "played_at": "timestamp" }
  ${FENCE}
}

services.playback -> services.catalog @grpc : "availability"
services.playback -> services.subscriptions @grpc : "entitlements"
services.playback -> sessions @writes : "active streams"
services.recs -> embeddings @reads
services.search -> index @reads
services.subscriptions -> accounts_db @sql
services.subscriptions <-> stripe @http : "billing"
training -> embeddings @writes : "nightly"
training -> warehouse @reads
transcoder -> audio @writes

layout {
  accounts_db: { at: [1, 17], size: [4, 3] }
  analytics: { at: [45, 7], size: [13, 11] }
  apps: { at: [0, 10], size: [4, 3] }
  apps.mobile: { at: [0, 5], size: [4, 3] }
  apps.web: { at: [0, 0], size: [4, 3] }
  audio: { at: [1, 2], size: [4, 3] }
  auth: { at: [0, 3], size: [4, 3] }
  catalog_db: { at: [1, 2], size: [4, 3] }
  cdn: { at: [1, 12], size: [4, 3] }
  content: { at: [9, 25], size: [27, 6] }
  edge: { at: [9, 3], size: [6, 16] }
  embeddings: { at: [7, 14], size: [4, 3] }
  events: { at: [7, 9], size: [4, 3] }
  gateway: { at: [1, 7], size: [4, 3] }
  inbox: { at: [22, 2], size: [4, 3] }
  index: { at: [1, 7], size: [4, 3] }
  labels: { at: [53, 27], size: [4, 3] }
  pipeline: { at: [15, 2], size: [4, 3] }
  playlists: { at: [1, 12], size: [4, 3] }
  royalties: { at: [8, 2], size: [4, 3] }
  services: { at: [20, 10], size: [4, 3] }
  services.catalog: { at: [0, 5], size: [4, 3] }
  services.library: { at: [0, 20], size: [4, 3] }
  services.playback: { at: [0, 10], size: [4, 3] }
  services.recs: { at: [0, 25], size: [4, 3] }
  services.search: { at: [0, 0], size: [4, 3] }
  services.subscriptions: { at: [0, 15], size: [4, 3] }
  sessions: { at: [7, 4], size: [4, 3] }
  storage: { at: [30, 0], size: [12, 21] }
  stripe: { at: [20, 3], size: [4, 3] }
  sync: { at: [1, 2], size: [4, 3] }
  training: { at: [1, 7], size: [4, 3] }
  transcoder: { at: [8, 2], size: [4, 3] }
  warehouse: { at: [1, 2], size: [4, 3] }
}
`,
  },
];

export const findExample = (slug: string | null | undefined): Example | undefined =>
  EXAMPLES.find((e) => e.slug === slug);
