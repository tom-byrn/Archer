// The document the editor shots use: a trimmed cut of the docs' Music
// Streaming example, laid out so its labels read at 1080p.
//
// Two slots are left empty on purpose, because Archer's placer packs a
// component without a layout entry into the first free cell of its scope:
//   - Storage's top slot, filled by the code edit (Embeddings, beside the
//     Recommender that reads it);
//   - the top-left corner, filled by the ⌘K add.
const F = '```';

const APPS = `component apps "Listener Apps" {
  desc "Every client talks to one API and streams from one CDN."
  component web "Web Player" @vercel.nextjs
  component mobile "iOS & Android" @mobile
}`;

const AUTH = `component auth "Accounts" @auth0 {
  desc "Email, Apple and Google sign-in. Issues the JWT every API call carries."
}`;

const GATEWAY = `component gateway "API Gateway" @aws.api_gateway {
  desc "The only public API. Checks the JWT, rate-limits per account, routes to services."
}`;

const CDN = `component cdn "Audio CDN" @aws.cloudfront {
  desc "Caches encrypted audio at the edge and serves only URLs that Playback signed."
}`;

const SERVICES_OPEN = `component services "Services" @aws.eks {
  desc "Stateless services on Kubernetes, reachable only through the API Gateway."`;

const PLAYBACK = `  component playback "Playback" @service {
    desc "Decides what a listener may play right now and returns a signed URL for the right rendition."
    src "services/playback"
    endpoints table ${F}
    | method | path        | purpose                                |
    | ------ | ----------- | -------------------------------------- |
    | POST   | /v1/play    | resolve a track to a signed stream URL |
    | POST   | /v1/license | DRM license for this device            |
    ${F}
    tiers yaml ${F}
    free:
      bitrate_kbps: 160
      offline: false
    premium:
      bitrate_kbps: 320
      offline: true
    ${F}
  }`;

const CATALOG = `  component catalog "Catalog" @service {
    desc "Artists, albums, tracks, credits, and the markets each track may play in."
    src "services/catalog"
  }`;

const RECS = `  component recs "Recommender" @service {
    desc "Home feed, radio and a weekly mix, built from the nearest neighbors of what you play."
  }`;

const SUBSCRIPTIONS = `  component subscriptions "Subscriptions" @service {
    desc "Plans, trials and family seats. Answers what a listener is entitled to."
    src "services/subscriptions"
  }`;

const STORAGE = `component storage "Storage" {
  component catalog_db "Catalog DB" @aws.rds {
    desc "Postgres. The source of truth for metadata."
  }
}`;

const EVENTS = `component events "Play Events" @kafka {
  desc "Every play, skip and save, as an event stream."
}`;

const WAREHOUSE = `component warehouse "Warehouse" @snowflake`;

const STRIPE = `component stripe "Stripe" @stripe`;

const COMPONENTS = [
  APPS,
  AUTH,
  GATEWAY,
  CDN,
  [SERVICES_OPEN, PLAYBACK, CATALOG, RECS, SUBSCRIPTIONS, '}'].join('\n'),
  STORAGE,
  EVENTS,
  WAREHOUSE,
  STRIPE,
].join('\n\n');

// Canonical order: sorted by source path, then target path.
const CONNECTION_LINES = [
  'apps -> auth @auth : "sign in"',
  'apps -> cdn @http : "audio"',
  'apps -> gateway @http',
  'events -> warehouse @stream',
  'gateway -> services @http : "routes"',
  'services.catalog -> storage.catalog_db @sql',
  'services.playback -- cdn : "signed URLs"',
  'services.playback -> events @event : "track played"',
  'services.playback -> services.catalog @grpc : "availability"',
  'services.playback -> services.subscriptions @grpc : "entitlements"',
  'services.subscriptions <-> stripe @http : "billing"',
];
const CONNECTIONS = CONNECTION_LINES.join('\n');

const LAYOUT = `layout {
  apps: { at: [0, 5], size: [6, 11], display: plane }
  apps.mobile: { at: [1, 7], size: [4, 3] }
  apps.web: { at: [1, 2], size: [4, 3] }
  auth: { at: [1, 18], size: [4, 3] }
  cdn: { at: [9, 12], size: [4, 3] }
  events: { at: [17, 14], size: [4, 3] }
  gateway: { at: [9, 7], size: [4, 3] }
  services: { at: [16, 0], size: [13, 11], display: plane }
  services.catalog: { at: [8, 7], size: [4, 3] }
  services.playback: { at: [1, 7], size: [4, 3] }
  services.recs: { at: [8, 2], size: [4, 3] }
  services.subscriptions: { at: [1, 2], size: [4, 3] }
  storage: { at: [32, 0], size: [6, 11], display: plane }
  storage.catalog_db: { at: [1, 7], size: [4, 3] }
  stripe: { at: [9, 2], size: [4, 3] }
  warehouse: { at: [25, 14], size: [4, 3] }
}`;

const HEADER = 'arch "Music Streaming" v0.1';

const full = () => `${HEADER}\n\n${COMPONENTS}\n\n${CONNECTIONS}\n\n${LAYOUT}\n`;

module.exports = {
  F,
  HEADER,
  COMPONENTS,
  CONNECTIONS,
  CONNECTION_LINES,
  LAYOUT,
  full,
  parts: { APPS, AUTH, GATEWAY, CDN, SERVICES_OPEN, PLAYBACK, CATALOG, RECS, SUBSCRIPTIONS, STORAGE, EVENTS, WAREHOUSE, STRIPE },
};
