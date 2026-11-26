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
      "The smallest useful document: a header, a few typed components and the connections between them. A `@type` picks the icon and color, a `shape` the outline; a label says what travels on an arrow. A `color` overrides the type's: here orange marks the hot path, the cache most requests stop at.",
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
  color orange
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
      "A component body holds a `desc`, `src` pointers into the codebase (a line for each place it lives, a folder, a file or a URL), and named payloads. `json`, `yaml` and `table` payloads are validated; `markdown` is freeform. The editor shows them in the detail panel, and agents read them as the spec.",
    features: ["descriptions", "source links", "payloads"],
    source: `arch "Billing Service" v0.2

component dashboard "Dashboard" @vercel.nextjs {
  shape browser
}

component api "Billing API" @service {
  color emerald
  desc "Owns plans, subscriptions and invoices. Stateless."
  src "services/billing"
  src "packages/billing-client/src/index.ts"
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
      "A `shape` in a component's body draws it as what it is: a person for the customer, people for the support team, a robot for the agent, a cloud for the model provider, a book for the help center, a cylinder for the database. The type still picks the icon and color inside the outline (an \`icon\` and a \`color\` can change them: amber marks the way to a person), and anything without a shape stays a box. Shapes are for readers; an agent implementing the document can ignore them.",
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
  color amber
}

component team "Support Team" @user {
  shape people
  color amber
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
      "An \`icon\` in a component's body picks the icon it shows: any Phosphor icon by its snake-case name (\`coffee\`, \`receipt\`, \`device_tablet\`) or one of the catalog's (\`database\`, \`queue\`). An untyped component shows no icon until it picks one, so an icon is the quickest way to say what something is without a type. On a typed component it replaces the type's icon and keeps its color, like the book on the Postgres menu. A \`color\` does the same for the color: a palette name (\`amber\`) or any \`\"#rrggbb\"\`, like the coffee brown of the barista's screen. The rest go by role, as the agent guide suggests: the customer and their devices are sky, the Orders service blue. Icons and colors are for readers; an agent implementing the document can ignore them. \`list_types\` lists every icon, and the editor's Icon picker searches them.",
    features: ["icons", "colors"],
    source: `arch "Coffee Shop" v0.2

component customer "Customer" @user {
  shape person
  color sky
}

component kiosk "Order Kiosk" {
  icon device_tablet
  color sky
}

component app "Mobile App" @mobile {
  shape phone
  color sky
}

component orders "Orders" {
  icon receipt
  color blue
  desc "Takes orders from the kiosk and the app, and tracks each drink from paid to picked up."
}

component payments "Payments" @stripe {
  shape cloud
}

component barista "Barista Screen" {
  icon coffee
  color "#92400e"
  desc "The queue of drinks to make, oldest first."
}

component loyalty "Loyalty" {
  icon gift
  color amber
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
      "A `plane` is a titled region of the canvas, a background you put components on: the user's devices on one, the AWS account on another, and a VPC inside that. Planes are only for the reader. They don't change a component's path (`api`, not `cloud.api`), connections never attach to them, and like a component a plane can take a `@type` and a `desc`. Colors cut across planes: the upload path is pink wherever it runs.",
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
    color pink
    desc "Originals and resized copies, served through signed URLs."
  }
  plane vpc "VPC" @aws.vpc {
    component uploads "Uploads" @aws.lambda {
      color pink
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
      "Any component can hold components. Orders owns its API, checkout, tracker and database: on the canvas it's one box with a count of what's inside, and opening it shows those parts, with whatever outside they connect to along the edges. A path reaches a nested component (`orders.checkout`), and a connection can join one or the whole component (`app -> orders`). Colors go by side: the customer's app is sky, Orders and its parts blue, and the courier's side orange.",
    features: ["nesting", "paths", "opening a component"],
    source: `arch "Food Delivery" v0.2

component app "Customer App" @mobile {
  shape phone
  color sky
}

component orders "Orders" @service {
  color blue
  desc "Takes an order from basket to doorstep: the API, checkout, live tracking and its own database."
  src "services/orders"
  component api "Orders API" @service {
    color blue
    endpoints table ${FENCE}
    | method | path        | purpose        |
    | ------ | ----------- | -------------- |
    | POST   | /orders     | place an order |
    | GET    | /orders/:id | status and ETA |
    ${FENCE}
  }
  component checkout "Checkout" @worker {
    color blue
    desc "Charges the card, then tells Dispatch the order is paid."
  }
  component tracker "Tracker" @service {
    color blue
    desc "Takes each courier's position and streams it to the customer's map."
  }
  component db "Orders DB" @postgres {
    shape cylinder
  }
}

component dispatch "Dispatch" @service {
  color orange
  desc "Offers each paid order to the nearest free courier."
}

component courier "Courier App" @mobile {
  shape phone
  color orange
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
    slug: "sequences",
    title: "Link Shortener",
    summary:
      "Connections say who talks to whom; a sequence says in what order, for one scenario. Its participants are the document's own components, so it can't drift from the architecture, and every call travels on a connection (W307 warns when one doesn't). `->` is a call, `-->` its reply and `~>` a message nobody waits on; `alt`/`else`, `opt`, `loop` and `par` group steps, and a note sits over the lifelines it names. The editor opens each sequence as a diagram and plays it back on the canvas.",
    features: ["sequences", "messages", "fragments", "notes"],
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
  color orange
}

component clicks "Click Events" @queue

api -> cache @reads : "resolve"
api -> clicks @queue : "clicked"
api -> db @sql
app -> api @http : "shorten"
browser -> app @http

sequence shorten "Shorten a link" {
  browser -> app : "Paste long URL"
  app -> api @http : "POST /links"
  api -> cache : "GET slug"
  cache --> api : "miss"
  alt "slug is free" {
    api -> db @sql : "INSERT link"
    db --> api : "id"
  } else "taken" {
    api -> api : "pick another slug"
  }
  api --> app : "201 Created"
  app --> browser : "Short link"
}

sequence resolve "Resolve a link" {
  browser -> app : "GET /:slug"
  app -> api @http : "resolve slug"
  api -> cache : "GET slug"
  opt "cache miss" {
    api -> db @sql : "SELECT url"
    api -> cache : "SET slug"
  }
  api ~> clicks @queue : "clicked"
  api --> app : "url"
  app --> browser : "302 redirect"
}
`,
  },
  {
    slug: "flows-states-and-data",
    title: "Link Shortener",
    summary:
      "Three more views over the same components. A `flow` is an activity diagram: `start`, `step`, `decision` and `end` nodes, each `in` the lane of the component that does it. A `states` block is one component's state machine, with an `initial` state, `final` ones and the events between them. An `entities` block is a store's data model: entities, one field per line, with `pk`, `unique`, `optional` and `-> entity.field` references. Like sequences, they name components by path and follow them when they're renamed.",
    features: ["flows", "state machines", "data models"],
    source: `arch "Link Shortener" v0.2

component browser "Browser" @browser {
  shape browser
}

component app "Web App" @vercel.nextjs

component api "API" @vercel.functions

component db "Links" @postgres {
  shape cylinder
}

api -> db @sql
app -> api @http : "shorten"
browser -> app @http

flow publish "Publish a link" {
  start begin in browser
  step paste "Paste a long URL" in browser
  step submit "Submit" in app
  decision valid "Valid URL?" in api
  step store "Store the link" in api
  step error "Show an error" in app
  step show "Show the short link" in app
  end done in browser
  begin -> paste
  paste -> submit
  submit -> valid
  valid -> store : "yes"
  valid -> error : "no"
  error -> paste
  store -> show
  show -> done
}

states lifecycle "Link lifecycle" of db {
  state pending "Pending" initial
  state live "Live"
  state disabled "Disabled"
  state expired "Expired" final
  pending -> live : "slug reserved"
  live -> live : "clicked"
  live -> disabled : "reported"
  disabled -> live : "reviewed"
  live -> expired : "TTL passed"
}

entities schema "Links schema" on db {
  entity owner "Owner" {
    id uuid pk
    email text unique
  }
  entity link "Link" {
    id uuid pk
    owner_id uuid -> owner.id
    slug text unique
    url "varchar(2048)"
    expires_at timestamp optional
  }
  entity click "Click" {
    id uuid pk
    link_id uuid -> link.id
    at timestamp
    referrer text optional
  }
}
`,
  },
  {
    slug: "ride-hailing",
    title: "Ride Hailing",
    summary:
      "Sequences for a real scenario, with every kind of step. Requesting a ride is a `loop` of offers until a driver accepts, with an `opt` for the acceptance inside it, a `note over` the two lifelines that share the timeout, and a `par` that tells the rider while the trip is saved. Finishing a ride is an `alt` on whether the card goes through. Push notifications are `~>`: nobody waits on them. The trip itself is a state machine `of trips`: one `initial` state, two `final` ones, and a self-transition for an offer that times out. Every call travels on a connection, so the sequences stay true to the diagram.",
    features: ["loop, opt, alt and par", "notes", "async messages", "state machines"],
    source: `arch "Ride Hailing" v0.2

component rider "Rider App" @mobile {
  color sky
}

component driver "Driver App" @mobile {
  color sky
}

component gateway "API Gateway" @api_gateway {
  color blue
}

component trips "Trips" @service {
  color blue
  desc "Owns a trip from request to receipt."
}

component matching "Matching" @service {
  color blue
}

component geo "Driver Locations" @geo_index {
  color teal
}

component push "Push" @push {
  color violet
}

component payments "Payments" @stripe

component db "Trips DB" @postgres {
  shape cylinder
  color teal
}

driver -> gateway @ws
gateway -> geo @writes : "positions"
gateway -> trips @grpc
matching -> geo @reads : "nearby drivers"
push -> driver
push -> rider
rider -> gateway @http
trips -> db @sql
trips -> matching @grpc : "find a driver"
trips -> payments @http : "charge"
trips -> push @event

sequence request "Request a ride" {
  rider -> gateway @http : "POST /trips"
  gateway -> trips @grpc : "create trip"
  trips -> db @sql : "INSERT trip"
  loop "until a driver accepts" {
    trips -> matching @grpc : "find a driver"
    matching -> geo : "drivers within 2 km"
    geo --> matching : "candidates"
    matching --> trips : "best match"
    trips ~> push : "offer"
    push ~> driver : "New ride request"
    opt "driver accepts" {
      driver -> gateway @ws : "accept"
      gateway -> trips : "assign driver"
    }
  }
  note over trips, matching "Each offer times out after 15 s"
  par {
    trips ~> push : "driver assigned"
    push ~> rider : "Your driver is on the way"
  } else {
    trips -> db @sql : "UPDATE trip SET driver"
  }
  trips --> gateway : "trip"
  gateway --> rider : "201 Created"
}

sequence finish "Finish a ride" {
  driver -> gateway @ws : "end trip"
  gateway -> trips @grpc : "complete"
  trips -> payments @http : "charge fare"
  alt "card ok" {
    payments --> trips : "paid"
    trips ~> push : "receipt"
    push ~> rider : "Thanks for riding"
  } else "declined" {
    payments --> trips : "declined"
    trips ~> push : "update payment method"
    push ~> rider : "Payment failed"
  }
  trips -> db @sql : "UPDATE trip"
  trips --> gateway : "fare"
  gateway --> driver : "Trip complete"
}

states trip "Trip lifecycle" of trips {
  state requested "Requested" initial
  state searching "Finding a driver"
  state assigned "Driver assigned"
  state riding "On the way"
  state completed "Completed" final
  state cancelled "Cancelled" final
  requested -> searching : "trip created"
  searching -> searching : "offer timed out"
  searching -> assigned : "driver accepts"
  searching -> cancelled : "no drivers nearby"
  assigned -> riding : "rider picked up"
  assigned -> cancelled : "rider cancels"
  riding -> completed : "trip ended"
}
`,
  },
  {
    slug: "online-store",
    title: "Online Store",
    summary:
      "A checkout as a `flow`, one lane per component: the storefront, Checkout, Inventory, Stripe and Email. Two `decision` nodes branch on stock and payment, their edge labels are the outcomes, and the flow has two `end`s, one for each way it can finish. A dead end loops back to review the cart. The orders database's tables are an `entities` block `on db`: five entities whose `-> order.id` references draw as crow's-foot lines, with `pk`, `unique` and `optional` fields.",
    features: ["flows with lanes", "decisions", "data models", "references"],
    source: `arch "Online Store" v0.2

component web "Storefront" @vercel.nextjs

component checkout "Checkout" @service

component inventory "Inventory" @service

component stripe "Stripe" @stripe

component db "Orders DB" @postgres {
  shape cylinder
}

component email "Email" @resend

checkout -> db @sql
checkout -> email @http : "confirmation"
checkout -> inventory @grpc : "reserve"
checkout -> stripe @http : "charge"
inventory -> db @sql
web -> checkout @http : "place order"

flow place_order "Place an order" {
  start begin in web
  step review "Review cart" in web
  step submit "Place order" in checkout
  decision in_stock "All in stock?" in inventory
  step reserve "Reserve items" in inventory
  step charge "Charge the card" in stripe
  decision paid "Payment ok?" in stripe
  step release "Release items" in inventory
  step record "Record the order" in checkout
  step confirm "Send confirmation" in email
  step sorry "Suggest alternatives" in web
  end placed "Order placed" in web
  end failed "Checkout failed" in web
  begin -> review
  review -> submit
  submit -> in_stock
  in_stock -> reserve : "yes"
  in_stock -> sorry : "no"
  sorry -> review
  reserve -> charge
  charge -> paid
  paid -> record : "yes"
  paid -> release : "no"
  release -> failed
  record -> confirm
  confirm -> placed
}

entities schema "Store schema" on db {
  entity customer "Customer" {
    id uuid pk
    email text unique
    name text
  }
  entity product "Product" {
    id uuid pk
    sku text unique
    name text
    price_cents int
  }
  entity order "Order" {
    id uuid pk
    customer_id uuid -> customer.id
    status text
    total_cents int
    placed_at timestamp
  }
  entity line "Order line" {
    id uuid pk
    order_id uuid -> order.id
    product_id uuid -> product.id
    quantity int
  }
  entity payment "Payment" {
    id uuid pk
    order_id uuid unique -> order.id
    stripe_ref text unique
    refunded_at timestamp optional
  }
}
`,
  },
  {
    slug: "music-streaming",
    title: "Music Streaming",
    summary:
      "A whole product in one file that still reads at a glance: listener apps, the platform we run, and the outside world around it. The platform's five parts (edge, services, storage, ingestion and analytics) sit on one plane, and each is a component holding its own pieces, so the top level is nine boxes and ten lines, and opening one shows the rest. Opening Services shows all six services, on a plane per Kubernetes namespace: a plane inside a component is a region of its own canvas, and the services on it are still `services.playback` and friends. All three arrow kinds appear: `->`, `<->` for the remote-control socket, and `--` for the signed URLs Playback and the CDN agree on. It was laid out by hand, so it ends with the `layout` block the canvas writes when you drag and resize. Agents may read that block to see the diagram as drawn, but never implement anything from it, and write it only when asked to arrange the diagram. Where the money flows, in and out, is emerald.",
    features: ["nesting a big system", "planes and nesting together", "planes inside a component", "arrow kinds", "connection payloads", "the layout block"],
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

plane platform "Platform" {
  desc "Everything we run."
  component edge "Edge" @aws {
    icon globe
    desc "The way in from the internet: one API, one socket hub, one CDN."
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
    plane browse "Browse" {
      desc "Namespace browse: what listeners find."
      component catalog "Catalog" @service {
        desc "Artists, albums, tracks, credits, and the markets each track may play in."
        src "services/catalog"
      }
      component search "Search" @service {
        desc "Typeahead across artists, albums, tracks and playlists."
      }
      component recs "Recommender" @service {
        desc "Home feed, radio and a weekly mix, built from the nearest neighbors of what you play."
      }
    }
    plane listen "Listen" {
      desc "Namespace listen: what happens when someone presses play."
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
      component library "Library" @service {
        desc "Saved tracks, followed artists, and playlists, including collaborative ones."
      }
    }
    plane accounts "Accounts" {
      desc "Namespace accounts: who may listen, and to what."
      component subscriptions "Subscriptions" @service {
        color emerald
        desc "Plans, trials and family seats. Answers what a listener is entitled to."
        src "services/subscriptions"
      }
    }
  }
  component storage "Storage" {
    icon database
    desc "Each service's own store, plus the event stream every play lands on."
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
  component content "Ingestion" {
    icon music_notes
    desc "Turns a label's delivery into playable audio and catalog entries."
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
  component analytics "Analytics" {
    icon chart_bar
    desc "Where plays become recommendations and royalty statements."
    component warehouse "Warehouse" @snowflake {
      shape cylinder
    }
    component royalties "Royalties" {
      icon hand_coins
      color emerald
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
}

component labels "Record Labels" @external {
  shape cloud
}

component stripe "Stripe" @stripe {
  shape cloud
}

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
apps -> edge.cdn @http : "audio"
apps -> edge.gateway @http
apps <-> edge.sync @ws : "remote control"
content.inbox -> content.pipeline @event
content.pipeline -> content.transcoder @queue : "encode"
content.pipeline -> services.catalog @grpc : "publish"
content.transcoder -> content.audio @writes
edge.cdn -> content.audio @reads : "origin"
edge.gateway -> services @http : "routes"
labels -> content.inbox @writes : "DDEX"
services.catalog -> storage.catalog_db @sql
services.catalog -> storage.index @writes : "reindex"
services.library -> storage.playlists
services.playback -- edge.cdn : "signed URLs"
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
  analytics: { at: [25, 2], size: [4, 3] }
  analytics.royalties: { at: [0, 0], size: [4, 3] }
  analytics.training: { at: [0, 5], size: [4, 3] }
  analytics.warehouse: { at: [7, 0], size: [4, 3] }
  apps: { at: [0, 10], size: [4, 3] }
  apps.mobile: { at: [0, 5], size: [4, 3] }
  apps.web: { at: [0, 0], size: [4, 3] }
  auth: { at: [0, 3], size: [4, 3] }
  content: { at: [13, 9], size: [4, 3] }
  content.audio: { at: [22, 0], size: [4, 3] }
  content.inbox: { at: [0, 0], size: [4, 3] }
  content.pipeline: { at: [7, 0], size: [4, 3] }
  content.transcoder: { at: [15, 0], size: [4, 3] }
  edge: { at: [1, 2], size: [4, 3] }
  edge.cdn: { at: [0, 10], size: [4, 3] }
  edge.gateway: { at: [0, 0], size: [4, 3] }
  edge.sync: { at: [0, 5], size: [4, 3] }
  labels: { at: [40, 17], size: [4, 3] }
  platform: { at: [7, 8], size: [30, 13] }
  services: { at: [9, 2], size: [4, 3] }
  services.accounts: { at: [0, 16], size: [6, 6] }
  services.browse: { at: [0, 0], size: [18, 6] }
  services.catalog: { at: [1, 2], size: [4, 3] }
  services.library: { at: [7, 2], size: [4, 3] }
  services.listen: { at: [0, 8], size: [12, 6] }
  services.playback: { at: [1, 2], size: [4, 3] }
  services.recs: { at: [13, 2], size: [4, 3] }
  services.search: { at: [7, 2], size: [4, 3] }
  services.subscriptions: { at: [1, 2], size: [4, 3] }
  storage: { at: [17, 2], size: [4, 3] }
  storage.accounts_db: { at: [0, 15], size: [4, 3] }
  storage.catalog_db: { at: [0, 0], size: [4, 3] }
  storage.embeddings: { at: [6, 12], size: [4, 3] }
  storage.events: { at: [6, 7], size: [4, 3] }
  storage.index: { at: [0, 5], size: [4, 3] }
  storage.playlists: { at: [0, 10], size: [4, 3] }
  storage.sessions: { at: [6, 2], size: [4, 3] }
  stripe: { at: [16, 1], size: [4, 3] }
}
`,
  },
];

export const findExample = (slug: string | null | undefined): Example | undefined =>
  EXAMPLES.find((e) => e.slug === slug);
