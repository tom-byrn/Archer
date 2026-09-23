/**
 * Worked examples for the docs (`/language/examples`). Each source is exactly
 * what the app saves for that document (canonical form, validates clean), so
 * the rendered image, the code block and the editor copy all agree.
 */

export interface Example {
  /** URL fragment, `/sandbox/<slug>` and `/new?example=` key. */
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
    slug: "music-streaming",
    title: "Music Streaming",
    summary:
      "A whole product in one file: listener apps, the edge, six services on Kubernetes with their storage, analytics, and the pipeline that turns a label's delivery into playable audio. Connections can attach to a whole plane (`gateway -> services`), and all three arrow kinds appear: `->`, `<->` for the remote-control socket, and `--` for the signed URLs Playback and the CDN agree on. It was laid out by hand, so it ends with the `layout` block the canvas writes when you drag and resize; agents ignore that block and never write it.",
    features: ["nesting", "arrow kinds", "connection payloads", "the layout block"],
    source: `arch "Music Streaming" v0.1

component apps "Listener Apps" {
  desc "Every client talks to one API and streams from one CDN."
  component web "Web Player" @vercel.nextjs
  component mobile "iOS & Android" @mobile {
    desc "Premium listeners can download for offline play. Downloads stay encrypted on the device."
  }
}

component auth "Accounts" @auth0 {
  desc "Email, Apple and Google sign-in. Issues the JWT every API call carries."
}

component gateway "API Gateway" @aws.api_gateway {
  desc "The only public API. Checks the JWT, rate-limits per account, routes to services."
}

component sync "Device Sync" {
  desc "WebSocket hub: move playback between devices, or use a phone as the remote for a speaker."
}

component cdn "Audio CDN" @aws.cloudfront {
  desc "Caches encrypted audio at the edge and serves only URLs that Playback signed."
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

component storage "Storage" {
  component catalog_db "Catalog DB" @aws.rds {
    desc "Postgres. The source of truth for metadata."
    schema json ${FENCE}
    {
      "artists": { "id": "uuid pk", "name": "text" },
      "albums": { "id": "uuid pk", "artist_id": "uuid fk artists.id", "released_on": "date" },
      "tracks": { "id": "uuid pk", "album_id": "uuid fk albums.id", "isrc": "text unique", "markets": "text[]" }
    }
    ${FENCE}
  }
  component index "Search Index" @elasticsearch
  component playlists "Playlists" @aws.dynamodb {
    desc "Libraries and playlists, partitioned by listener."
  }
  component sessions "Play Sessions" @redis {
    desc "Active streams per account, for device limits. Keys expire 30 seconds after the last heartbeat."
  }
  component events "Play Events" @kafka
  component embeddings "Embeddings" @pinecone
  component accounts_db "Accounts DB" @aws.rds
}

component content "Content Ingestion" {
  component inbox "Delivery Inbox" @aws.s3 {
    desc "Labels drop DDEX packages here: XML metadata, lossless masters and artwork."
  }
  component pipeline "Pipeline" @temporal {
    desc "One durable workflow per release: validate, encode, then publish on release day."
  }
  component transcoder "Transcoder" @aws.fargate {
    desc "FFmpeg workers. Ogg Vorbis at 96, 160 and 320 kbps plus AAC, loudness-normalized to -14 LUFS."
  }
  component audio "Audio Files" @aws.s3 {
    desc "Every encoded rendition, keyed by track and bitrate."
  }
}

component analytics "Analytics" {
  component warehouse "Warehouse" @snowflake
  component royalties "Royalties" {
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

component labels "Record Labels" @external

component stripe "Stripe" @stripe

analytics.royalties -> analytics.warehouse @reads

analytics.royalties -> labels : "statements" {
  statement table ${FENCE}
  | column       | type | notes            |
  | ------------ | ---- | ---------------- |
  | isrc         | text | recording id     |
  | market       | text | ISO country code |
  | streams      | int  | counted plays    |
  | payout_cents | int  | for the month    |
  ${FENCE}
}

analytics.training -> analytics.warehouse @reads
analytics.training -> storage.embeddings @writes : "nightly"
apps -> auth @auth : "sign in"
apps -> cdn @http : "audio"
apps -> gateway @http
apps <-> sync @ws : "remote control"
cdn -> content.audio @reads : "origin"
content.inbox -> content.pipeline @event
content.pipeline -> content.transcoder @queue : "encode"
content.pipeline -> services.catalog @grpc : "publish"
content.transcoder -> content.audio @writes
gateway -> services @http : "routes"
labels -> content.inbox @writes : "DDEX"
services.catalog -> storage.catalog_db @sql
services.catalog -> storage.index @writes : "reindex"
services.library -> storage.playlists
services.playback -- cdn : "signed URLs"
services.playback -> services.catalog @grpc : "availability"
services.playback -> services.subscriptions @grpc : "entitlements"

services.playback -> storage.events @event : "track played" {
  message json ${FENCE}
  { "listener_id": "uuid", "track_id": "uuid", "ms_played": "int", "market": "text", "played_at": "timestamp" }
  ${FENCE}
}

services.playback -> storage.sessions @writes : "active streams"
services.recs -> storage.embeddings @reads
services.search -> storage.index @reads
services.subscriptions -> storage.accounts_db @sql
services.subscriptions <-> stripe @http : "billing"
storage.events -> analytics.warehouse @stream

layout {
  analytics: { at: [45, 15], size: [6, 19], display: plane }
  analytics.royalties: { at: [1, 15], size: [4, 3] }
  analytics.training: { at: [1, 2], size: [4, 3] }
  analytics.warehouse: { at: [1, 8], size: [4, 3] }
  apps: { at: [0, 17], size: [6, 11], display: plane }
  apps.mobile: { at: [1, 7], size: [4, 3] }
  apps.web: { at: [1, 2], size: [4, 3] }
  auth: { at: [1, 12], size: [4, 3] }
  cdn: { at: [10, 24], size: [4, 3] }
  content: { at: [9, 40], size: [29, 6], display: plane }
  content.audio: { at: [1, 2], size: [4, 3] }
  content.inbox: { at: [24, 2], size: [4, 3] }
  content.pipeline: { at: [17, 2], size: [4, 3] }
  content.transcoder: { at: [9, 2], size: [4, 3] }
  gateway: { at: [10, 18], size: [4, 3] }
  labels: { at: [46, 42], size: [4, 3] }
  services: { at: [18, 0], size: [13, 39], display: plane }
  services.catalog: { at: [8, 26], size: [4, 3] }
  services.library: { at: [8, 2], size: [4, 3] }
  services.playback: { at: [8, 19], size: [4, 3] }
  services.recs: { at: [8, 7], size: [4, 3] }
  services.search: { at: [1, 35], size: [4, 3] }
  services.subscriptions: { at: [8, 12], size: [4, 3] }
  storage: { at: [35, 0], size: [6, 39], display: plane }
  storage.accounts_db: { at: [1, 12], size: [4, 3] }
  storage.catalog_db: { at: [1, 29], size: [4, 3] }
  storage.embeddings: { at: [1, 7], size: [4, 3] }
  storage.events: { at: [1, 23], size: [4, 3] }
  storage.index: { at: [1, 35], size: [4, 3] }
  storage.playlists: { at: [1, 2], size: [4, 3] }
  storage.sessions: { at: [1, 17], size: [4, 3] }
  stripe: { at: [10, 12], size: [4, 3] }
  sync: { at: [1, 30], size: [4, 3] }
}
`,
  },
];

export const findExample = (slug: string | null | undefined): Example | undefined =>
  EXAMPLES.find((e) => e.slug === slug);
