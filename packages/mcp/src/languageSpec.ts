// Generated from docs/language-spec.md — keep in sync when the spec changes.
export const LANGUAGE_SPEC = `# Archer — Language Specification

Archer is a textual language for describing software architecture. An \`.arch\` file is
the **single source of truth** for an architecture document: the canvas renders it, edits
on the canvas compile back into it, and it is handed to coding agents, with a short
reading guide, as an implementation spec.

## 1. Design principles

1. **Agent-first.** The primary readers and writers of raw Archer are AI coding agents.
   Humans interact through the canvas. Syntax choices favor unambiguous parsing and
   generation over hand-writing ergonomics, but the language stays Mermaid-adjacent and
   skimmable.
2. **The file is the truth.** The canvas is a view. Every canvas edit is a file edit.
3. **Semantics and presentation are quarantined from each other.** Everything an agent
   needs to build lives in the semantic sections. Everything about pixels lives in the
   \`layout\` block, which is machine-managed. Agent exports include it so the agent sees
   the diagram the author drew, but it is never architecture: agents MAY read it for
   context, MUST NOT implement anything from it, and SHOULD NOT write it unless asked
   to arrange the diagram. Two things outside it are there for readers, but belong to
   the document in every view, so agents write them like any other field: a
   component's \`shape\`, \`icon\` and \`color\` (§3.3) say what a thing *is* at a glance (a
   cylinder is a store, a person is a user), and planes (§3.4) say which things belong together (a
   frontend and a backend, a cloud account, a network).
4. **Strict references, permissive semantics.** Every reference must resolve — a
   connection to an undeclared component is a validation error, never an auto-created
   node (deliberately the opposite of Eraser's parser). But the language imposes no
   compatibility rules: any component may connect to any component, types are optional,
   and untyped generic boxes are first-class.
5. **Structured where it pays, freeform where it doesn't.** JSON, YAML, and table
   payloads are syntactically validated. Markdown payloads are freeform. Per-technology
   validation (e.g. linting a Postgres node's schema as real DDL) is deferred to a later
   version.

## 2. File structure

An \`.arch\` file has up to four sections, in this order:

\`\`\`
arch "Title" v0.2          # 1. header (required)

component ...              # 2. declarations: components and planes (the tree)
plane ...

a -> b ...                 # 3. connection declarations

layout { ... }             # 4. presentation (machine-managed, optional)
\`\`\`

- Encoding is UTF-8. Comments run from \`#\` to end of line (outside strings and payload
  fences).
- Section order is enforced by the formatter, not the parser: connections may appear
  interleaved with components in input, but the canonical form (what the app saves)
  always groups them as above.

### 2.1 Header

\`\`\`
arch "Acme Platform" v0.2
\`\`\`

\`v0.2\` is the **spec version** the file targets. Parsers refuse files with a major
version they don't understand.

## 3. Components

\`\`\`
component <id> ["Display Name"] [@<type>] [{ <body> }]
\`\`\`

- \`<id>\` — required. \`snake_case\` (\`[a-z][a-z0-9_]*\`), unique **within its parent scope**
  (like keys in a JSON object). IDs are stable identity: renaming a display name never
  changes an id.
- \`"Display Name"\` — optional quoted string shown on the canvas. Defaults to the id.
- \`@<type>\` — optional type tag (see §5). Untyped components render as generic
  boxes/shapes and are fully valid.
- Body — optional \`{ ... }\` block containing, in any mix:
  - \`shape <name>\` — how the canvas draws the component: \`cylinder\`, \`cloud\`, \`person\`,
    \`robot\`, … (§3.3). At most one per component (a second one is error \`E004\`).
    Without one, a component is a box.
  - \`icon <name>\` — the icon the component shows: \`database\`, \`shopping_cart\`,
    \`credit_card\`, … (§3.3). At most one per component (a second one is error \`E004\`).
    Without one, a typed component shows its type's icon and an untyped one shows none.
  - \`color <name>\` or \`color "#rrggbb"\` — the color the component is drawn in: \`blue\`,
    \`green\`, \`rose\`, … or any hex color (§3.3). At most one per component (a second one
    is error \`E004\`). Without one, a component takes its type's color.
  - \`desc "..."\` — human-readable description (shown in the detail view). One per
    component. Multiline via triple quotes: \`desc """ ... """\`.
  - \`src "..."\` — where the component lives in code: a repo-relative path to a
    file or a folder (\`apps/api/src/billing\`, \`apps/api/src/billing/invoices.ts\`)
    or a URL. Single-line string only. A component that lives in several places
    has one \`src\` line for each, kept in the order written. Agents start here when
    implementing or verifying the component; the app renders each one as a link.
    Cite only where the component itself is implemented — its entry points, its
    own folder — not every file it touches: shared helpers, UI primitives (a table
    or button component), imported libraries and utilities it merely uses are not
    sources for it. Prefer one folder over listing the files inside it; a few \`src\`
    lines is normal, a dozen means the component is too broad or the list too
    detailed.
  - Child \`component\` declarations — any component can hold components, arbitrarily
    deep, with JSON-object nesting semantics (§3.1).
  - Child \`plane\` declarations — regions on the component's own canvas (§3.4).
  - Payload blocks (§4).

### 3.1 Nesting and paths

Components form a tree. A component is referenced by its **dot-path from the root**:

\`\`\`
component orders "Orders" @service {
  component api "Orders API" @service
  component db "Orders DB" @postgres
}

component web "Web App" @vercel.nextjs

web -> orders.api @http
orders.api -> orders.db @sql
\`\`\`

Nesting is containment: the nested components are parts of the one that holds them.
Any component can hold components, at any depth, and each one's inside is a canvas of
its own:

- On the canvas where it sits, a component with nested components is one box, with a
  count of what's inside. **Opening** it (drilling down) shows its parts on a canvas of
  their own, with the outside components they connect to drawn along the sides.
- A connection is drawn on every canvas that shows both ends. Where a nested end isn't
  visible, the arrow goes to the component that holds it: at the top level above,
  \`web -> orders.api\` is an arrow from Web App into Orders.
- A connection can join a nested component (\`orders.api\`) or the whole component
  (\`web -> orders\`) — say whichever is true.

Nesting is for parts that belong to a thing: a service's API and database, a cluster's
services. To group things only to show where they are (a frontend and a backend, a
cloud account, a network), use a plane (§3.4): it draws a region around them, keeps
them all on one canvas and doesn't change their paths.

### 3.2 Example

\`\`\`
component db "Primary Postgres" @postgres {
  shape cylinder
  desc "Single Postgres instance holding all app data. Row-level security on."

  component users_table "users" @postgres.table {
    schema table \`\`\`
    | column     | type        | notes           |
    | ---------- | ----------- | --------------- |
    | id         | uuid        | pk              |
    | email      | text        | unique          |
    | team_id    | uuid        | fk -> teams.id  |
    \`\`\`
  }
}
\`\`\`

Granularity is the author's choice: one \`@postgres\` node with a schema payload, or
individual \`@postgres.table\` children, or both.

### 3.3 Shapes

A component is drawn as a box unless its body names a shape:

\`\`\`
component db "Orders" @postgres {
  shape cylinder
  desc "Every order and its line items."
}

component support "Support Agent" @agent {
  shape robot
}

component nightly "Nightly Export" @worker {
  shape clock
}
\`\`\`

The shapes, in the groups the editor's pickers show them in:

| group                  | shape           | usually stands for                               |
| ---------------------- | --------------- | ------------------------------------------------ |
| Basic                  | \`box\`           | anything (the default)                           |
|                        | \`pill\`          | starts, ends and states                          |
|                        | \`circle\`        | events, triggers and endpoints                   |
|                        | \`diamond\`       | decisions and routing                            |
|                        | \`hexagon\`       | services and processing steps                    |
|                        | \`parallelogram\` | inputs, outputs and data                         |
|                        | \`chevron\`       | steps and pipeline stages                        |
|                        | \`subroutine\`    | functions and subprocesses                       |
|                        | \`note\`          | notes and annotations                            |
| People                 | \`person\`        | users, customers and roles                       |
|                        | \`people\`        | teams, groups and audiences                      |
|                        | \`robot\`         | AI agents, bots and automations                  |
|                        | \`building\`      | companies, partners and on-prem sites            |
| Apps & devices         | \`browser\`       | web apps and sites                               |
|                        | \`phone\`         | mobile apps, tablets and devices                 |
|                        | \`desktop\`       | desktop apps, consoles and workstations          |
|                        | \`laptop\`        | laptops and developer machines                   |
|                        | \`terminal\`      | CLIs, shells and scripts                         |
|                        | \`chip\`          | hardware, IoT and embedded devices               |
| Network & security     | \`cloud\`         | cloud providers, external services, the internet |
|                        | \`globe\`         | the web, DNS, CDNs and regions                   |
|                        | \`firewall\`      | firewalls, WAFs and network boundaries           |
|                        | \`shield\`        | security, guardrails and policies                |
|                        | \`lock\`          | auth, secrets and encryption                     |
| Compute                | \`server\`        | servers, hosts and VMs                           |
|                        | \`stack\`         | replicas, pools and fleets                       |
|                        | \`cube\`          | containers, pods and build artifacts             |
|                        | \`module\`        | modules, libraries and packages                  |
|                        | \`gear\`          | workers, jobs and background tasks               |
|                        | \`clock\`         | schedulers, cron jobs and timers                 |
|                        | \`puzzle\`        | plugins, extensions and integrations             |
|                        | \`brain\`         | AI models, LLMs and ML                           |
| Data & storage         | \`cylinder\`      | databases and other stores                       |
|                        | \`bucket\`        | object storage and blobs                         |
|                        | \`table\`         | tables, datasets and spreadsheets                |
|                        | \`memory\`        | caches and in-memory stores                      |
|                        | \`archive\`       | backups, archives and cold storage               |
|                        | \`document\`      | files, reports and specs                         |
|                        | \`folder\`        | file shares and directories                      |
|                        | \`book\`          | docs, wikis and knowledge bases                  |
|                        | \`search\`        | search engines and indexes                       |
|                        | \`funnel\`        | filters, pipelines and ETL                       |
| Messaging & monitoring | \`queue\`         | queues, streams and logs                         |
|                        | \`envelope\`      | email, inboxes and messages                      |
|                        | \`chat\`          | chat, SMS and conversations                      |
|                        | \`bell\`          | alerts, notifications and on-call                |
|                        | \`gauge\`         | metrics, monitoring and SLOs                     |

- A shape is independent of the type: the type still picks the icon and color drawn
  inside it, and any shape goes with any type (or none).
- The shape fills the component's box, whatever its size, and a component with nested
  components keeps its shape. Planes have no shape.
- A shape is a hint for readers, never a requirement: it doesn't change what a component
  is, and agents implementing a document may ignore it.
- A name the language doesn't know is a warning (\`W304\`), not an error, and the component
  is drawn as a box, so files stay readable by tools that predate a newer shape.

#### Icons

A component shows its type's icon (or the product's logo), and an untyped component shows
none, unless its body names an icon:

\`\`\`
component cart "Cart" {
  icon shopping_cart
}

component ledger "Ledger" @postgres {
  shape cylinder
  icon receipt
}
\`\`\`

- Icons are [Phosphor](https://phosphoricons.com) icons, by name in snake case
  (\`shopping_cart\`, \`user_circle\`, \`git_pull_request\`), plus the names of the catalog's own
  icons (\`database\`, \`server\`, \`queue\`, …). Where a catalog icon is a Phosphor icon under
  another name, both names work (\`server\` and \`hard_drives\`). The MCP tool \`list_types\`
  lists every icon, in the groups the editor's picker shows them in.
- An icon replaces the type's icon (or logo), in the type's color; any icon goes with any
  type and any shape. Planes have no icon.
- Like a shape, an icon is a hint for readers: agents implementing a document may ignore it.
- A name the tools don't know is a warning (\`W305\`), and the component is drawn as if it
  had no icon.

#### Colors

A component is drawn in its type's color (slate for an untyped one) unless its body names
a color: one of the palette's, by name, or any color as a \`"#rrggbb"\` string.

\`\`\`
component checkout "Checkout" {
  icon shopping_cart
  color green
}

component legacy "Legacy Billing" @service {
  color "#b45309"
}
\`\`\`

- The palette, in the order the editor's picker shows it: \`red\`, \`orange\`, \`amber\`,
  \`yellow\`, \`lime\`, \`green\`, \`emerald\`, \`teal\`, \`cyan\`, \`sky\`, \`blue\`, \`indigo\`,
  \`violet\`, \`purple\`, \`fuchsia\`, \`pink\`, \`rose\`, \`slate\`.
- A color replaces the type's: the icon is drawn in it, and the component's card or
  shape takes a tint of it. A product's logo keeps its own colors. Planes have no color.
- Like a shape, a color is a hint for readers: agents implementing a document may
  ignore it. Use it to group or highlight (new, deprecated, owned by one team), not
  to carry meaning a \`desc\` should state.
- A name the language doesn't know, or a string that isn't \`#rrggbb\`, is a warning
  (\`W306\`), and the component is drawn as if it had no color.

### 3.4 Planes

\`\`\`
plane <id> ["Display Name"] [@<type>] [{ <body> }]
\`\`\`

A plane is a titled region of a canvas: a background drawn behind the components
declared in its body. It's there for readers, to show at a glance what belongs
together:

\`\`\`
plane frontend "Frontend" {
  component web "Web App" @vercel.nextjs
  component mobile "Mobile App" @mobile
}

plane cloud "AWS" @aws {
  desc "One account, one region."
  component api "API" @aws.api_gateway
  plane vpc "VPC" @aws.vpc {
    component db "Postgres" @aws.rds
  }
}

api -> db @sql
mobile -> api @http
web -> api @http
\`\`\`

- The body holds, in any mix: a \`desc\`, \`component\` declarations (the components on the
  plane) and \`plane\` declarations (regions inside it, like the VPC above). No \`shape\`,
  \`icon\`, \`color\`, \`src\` or payloads. An empty plane is valid.
- A \`@type\` resolves against the catalog like a component's (§5) and is drawn in the
  plane's title bar: a cloud account, a region, a network, a cluster.
- **Transparent to paths.** A component on a plane keeps its path — \`api\` and \`db\`
  above, not \`cloud.api\` — so moving a component onto a plane, off it or to another one
  never changes a connection. A plane's own path is its scope's path plus its id
  (\`vpc\`), which layout entries and tools use; plane ids share their scope with
  component ids (\`E002\`).
- **Never an endpoint.** Connections join components; one that names a plane is \`E101\`.
  Connect the components on it or, if the group really is one thing other things talk
  to, make it a component and nest its parts (§3.1).
- **Every canvas can have planes.** A plane in a component's body is a region on that
  component's own canvas, and the components on it are still that component's children
  (\`orders.api\` when \`api\` sits on a plane inside \`orders\`).
- The canonical form keeps components in the order they were declared, and writes each
  plane where its first component comes, with the components on it in its body.

## 4. Payload blocks

Payloads attach structured or freeform data to a component — or to a connection (§6):

\`\`\`\`
<name> <format> \`\`\`
<content>
\`\`\`
\`\`\`\`

- \`<name>\` — snake_case identifier, unique per owner (\`schema\`, \`env\`, \`endpoints\`,
  \`notes\`, \`message\`, …). Names are free, except the body keywords (\`component\`,
  \`plane\`, \`desc\`, \`src\`, \`shape\`, \`icon\`, \`color\`); they exist so agents and the detail view can refer
  to a payload by role.
- \`<format>\` — one of:

  | format     | validation                                        |
  | ---------- | ------------------------------------------------- |
  | \`json\`     | must parse as JSON                                |
  | \`yaml\`     | must parse as YAML                                |
  | \`table\`    | must parse as a GitHub-flavored Markdown table    |
  | \`markdown\` | none — freeform text                              |

- Content is fenced with triple backticks. A fence inside content is escaped by using a
  longer fence on the payload (same rule as Markdown).
- Validation failures in \`json\` / \`yaml\` / \`table\` payloads are **errors**: the document
  still renders, but is marked invalid and won't compile to an agent export until fixed.
- Later versions add per-technology validation (e.g. \`sql\` format checked as real DDL);
  this one deliberately does not.

## 5. Types

A type tag connects a component, plane or connection to the **catalog** — the curated library
of vendor-neutral building blocks (\`@load_balancer\`, \`@rate_limiter\`, \`@cdn\`, \`@queue\`,
\`@database\`, …) and real technologies, plus the user's saved custom types.

- Syntax: \`@namespace.name\` or \`@name\` (e.g. \`@aws.s3\`, \`@aws.lambda\`, \`@postgres\`,
  \`@vercel\`, \`@vercel.functions\`, \`@redis\`, \`@stripe\`).
- A type resolves against the catalog to an icon, a display style, and (later) detail
  templates. An **unresolved type is a warning, not an error** — the component renders
  generic, and the file still compiles. This keeps files portable between workspaces
  with different custom libraries.
- Types carry no compatibility rules: nothing constrains what may connect to what.
- Abstract and concrete components mix freely — \`component auth "Auth Service"\` (your
  own code, untyped or typed with something like \`@service\`) can sit beside
  \`component cognito @aws.cognito\`.
- Custom types are defined in the app (component library UI) and referenced from files
  by tag; there are no in-file type definitions yet.

### 5.1 Initial connection-type library

\`@http\` \`@grpc\` \`@graphql\` \`@ws\` \`@sse\` \`@webrtc\` \`@tcp\` \`@udp\` \`@sql\` \`@queue\` \`@event\`
\`@stream\` \`@mqtt\` \`@webhook\` \`@cdc\` \`@auth\` \`@reads\` \`@writes\` \`@replicates\` \`@triggers\`
\`@deploys\` \`@contains\` \`@depends\` \`@mcp\` \`@a2a\` — plus user-defined. All optional.
\`@mcp\` is an agent calling an MCP server (Model Context Protocol); \`@a2a\` is one agent
calling another (Agent2Agent protocol).

## 6. Connections

\`\`\`
<source-path> <arrow> <target-path> [@<type>] [: "label"] [{ <payload>… }]
\`\`\`

Arrows:

| arrow  | meaning        |
| ------ | -------------- |
| \`->\`   | directed       |
| \`<->\`  | bidirectional  |
| \`--\`   | undirected     |

Examples:

\`\`\`\`
web -> orders.api @http : "REST, cookie session"
orders.api -> orders.db @sql
orders.api <-> cache @redis_protocol
billing -- stripe

orders.api -> order_events @queue : "order placed" {
  message json \`\`\`
  { "order_id": "uuid", "total_cents": "int", "placed_at": "timestamp" }
  \`\`\`
}
\`\`\`\`

Rules:

- **Both endpoints MUST resolve to declared components.** An unresolved endpoint is a
  hard validation error (\`E101\`), and so is a plane (§3.4). Nothing is ever
  auto-created.
- \`@type\` and label are optional and independent.
- **Connection payloads.** An optional \`{ … }\` body holds payload blocks (§4) describing
  what travels on the edge: a message schema on a \`@queue\`, a request/response shape on
  an \`@http\` call, the event names on an \`@event\` bus. The body may contain only
  payloads — no \`desc\` (use the label), no nested components. Payload names are unique
  per connection (\`E003\`) and \`json\` / \`yaml\` / \`table\` content is validated (\`E201\`),
  exactly as on components.
- Duplicate connections (same endpoints, arrow, type, and label) are a warning.
  Payloads are not part of a connection's identity: two connections that differ only in
  payloads are still duplicates.
- Connections between any two components in the tree are allowed, including across
  nesting boundaries and between a parent and its own descendant. Planes don't affect
  them.
- Canonical form sorts connections by source path, then target path — so compiled
  output is deterministic and diffs are clean. Connections carry no sequence/ordering
  semantics. A connection with payloads is written as a multi-line block separated from
  its neighbours by a blank line; the sort order is unaffected.

## 7. The \`layout\` block

Everything presentational, in one machine-managed section at the end of the file:

\`\`\`
layout {
  web: { at: [0, 4], size: [4, 3] }
  backend: { at: [6, 0], size: [12, 6] }
  api: { at: [1, 2], size: [4, 3] }
  api.checkout: { at: [0, 0], size: [4, 3] }
  db: { at: [7, 2], size: [4, 3] }
}
\`\`\`

- Keys are the paths of components and planes. Values: \`at\` (grid cell, \`[col, row]\`)
  and \`size\` (grid cells).
- Every canvas has its own grid: the top level, and the inside of each component
  (\`api.checkout\` above is placed inside API, not beside it). \`at\` is relative to its
  canvas, or to the plane the item sits on — moving a plane moves what's on it.
- Grid-based: all positions are integer grid cells, matching the app's snap-to-grid
  canvas (React Flow).
- **Machine-managed.** The canvas writes it; agents only when asked to arrange the
  diagram. A component or plane with no layout entry — e.g. in a file an agent wrote or
  that was pasted in — is positioned by the auto-layout engine on load, and its
  computed position is then written back. A plane grows to hold what's on it.
- Layout is always optional, never load-bearing: deleting the entire block yields the
  same architecture, auto-laid-out.
- Agent guidance (stated in docs and in the export header): read \`layout\` as the
  author's arrangement — context for how they see the system, never something to
  implement; leave it out when writing (surviving components keep their positions,
  new ones are auto-placed) unless asked to arrange the diagram.

## 8. Validation

A document is **valid** when:

| code   | rule                                                             | severity |
| ------ | ---------------------------------------------------------------- | -------- |
| \`E001\` | file parses (header, declarations, fences)                       | error    |
| \`E002\` | ids unique within their scope, components and planes together    | error    |
| \`E003\` | payload names unique per component / per connection              | error    |
| \`E004\` | at most one \`shape\`, one \`icon\` and one \`color\` per component    | error    |
| \`E101\` | every connection endpoint resolves to a declared component       | error    |
| \`E201\` | \`json\` / \`yaml\` / \`table\` payloads parse in their format         | error    |
| \`W301\` | type tag resolves in the catalog                                 | warning  |
| \`W302\` | duplicate connection                                             | warning  |
| \`W303\` | layout entry references a declared component or plane            | warning (entry dropped) |
| \`W304\` | shape is one the language knows (§3.3)                           | warning (drawn as a box) |
| \`W305\` | icon is one the tools know (§3.3)                                | warning (no icon drawn) |
| \`W306\` | color is a palette name or \`#rrggbb\` (§3.3)                      | warning (type's color drawn) |

Errors block agent export ("copy as prompt") and mark the document invalid in the UI;
the canvas still renders as much as it can. Warnings never block anything.

The canvas enforces \`E101\` interactively: an arrow dropped on empty canvas snaps back —
a dangling connection is never created in the first place.

## 9. Compilation targets

1. **Canonical form** — the formatter output the app always saves: fixed section order,
   sorted connections, normalized whitespace. Ensures clean diffs.
2. **Agent export ("copy as prompt")** — canonical form with a complete \`layout\` block
   (every component placed, as the canvas draws it), prefixed by a short fixed header
   telling the agent what Archer is, how to read it (layout included), and that this
   document is the implementation spec. One click, ends up on the clipboard.
3. **Image export** — PNG of the current canvas view, for pasting alongside the code.

## 10. Full example

\`\`\`\`
arch "Acme SaaS" v0.2

component web "Next.js App" @vercel.nextjs {
  shape browser
  desc "App shell + marketing. RSC, deployed on Vercel."
  src "apps/web"
  src "packages/ui"
}

plane backend "Backend" @vercel {
  desc "Everything server-side lives on Vercel."

  component api "API" @vercel.functions {
    desc "Route handlers. Auth via session cookie."
    endpoints table \`\`\`
    | method | path            | purpose            |
    | ------ | --------------- | ------------------ |
    | POST   | /api/checkout   | create session     |
    | GET    | /api/projects   | list projects      |
    \`\`\`

    component checkout "Checkout" {
      icon shopping_cart
      desc "Creates Stripe checkout sessions."
    }
    component projects "Projects" {
      icon folders
    }
  }

  component db "Postgres" @supabase.postgres {
    shape cylinder
    desc "Primary datastore."
    schema json \`\`\`
    {
      "users":    { "id": "uuid pk", "email": "text unique" },
      "projects": { "id": "uuid pk", "owner_id": "uuid fk users.id" }
    }
    \`\`\`
  }
}

component auth "Auth Service" {
  icon lock_key
  desc "Our own thin wrapper over Cognito — issues sessions."
}

component cognito "Cognito" @aws.cognito {
  shape cloud
}
component stripe "Stripe" @stripe {
  shape cloud
}

web -> auth @http : "login"
web -> api @http
auth -> cognito @http
api -> db @sql
api.projects -> db @sql

api.checkout -> stripe @http : "checkout sessions" {
  request json \`\`\`
  {
    "price_id": "string",
    "success_url": "url",
    "cancel_url": "url"
  }
  \`\`\`
}

layout {
  web: { at: [0, 3], size: [4, 3] }
  auth: { at: [0, 8], size: [4, 3] }
  backend: { at: [6, 0], size: [12, 6] }
  api: { at: [1, 2], size: [4, 3] }
  api.checkout: { at: [0, 0], size: [4, 3] }
  api.projects: { at: [0, 5], size: [4, 3] }
  db: { at: [7, 2], size: [4, 3] }
  cognito: { at: [0, 13], size: [4, 3] }
  stripe: { at: [20, 3], size: [4, 3] }
}
\`\`\`\`

## 11. Grammar sketch (EBNF-ish)

\`\`\`
file        = header { declaration | connection } [ layout ] ;
header      = "arch" string version ;
declaration = component | plane ;
component   = "component" id [ string ] [ type ] [ "{" { bodyitem } "}" ] ;
bodyitem    = shape | icon | color | desc | src | declaration | payload ;
plane       = "plane" id [ string ] [ type ] [ "{" { planeitem } "}" ] ;
planeitem   = desc | declaration ;
shape       = "shape" id ;
icon        = "icon" id ;
color       = "color" ( id | string ) ;
desc        = "desc" ( string | tripleString ) ;
src         = "src" string ;
payload     = id format fence ;
format      = "json" | "yaml" | "table" | "markdown" ;
connection  = path arrow path [ type ] [ ":" string ] [ "{" { payload } "}" ] ;
arrow       = "->" | "<->" | "--" ;
type        = "@" id { "." id } ;
path        = id { "." id } ;
layout      = "layout" "{" { path ":" layoutval } "}" ;
\`\`\`

## 12. Open questions (deferred)

- Multi-file / import (\`use "./billing.arch"\`) — v1 is one file per document.
- In-file custom type definitions for portability.
- Per-technology payload validation (\`sql\`, \`openapi\`, \`terraform\` formats).
- Views: multiple named layouts over one model (C4-style level switching).
`;
