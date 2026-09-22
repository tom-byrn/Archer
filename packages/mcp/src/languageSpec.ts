// Generated from docs/language-spec.md — keep in sync when the spec changes.
export const LANGUAGE_SPEC = `# Archer — Language Specification

Archer is a textual language for describing software architecture. An \`.arch\` file is
the **single source of truth** for an architecture document: the canvas renders it, edits
on the canvas compile back into it, and a stripped form of it is handed to coding agents
as an implementation spec.

## 1. Design principles

1. **Agent-first.** The primary readers and writers of raw Archer are AI coding agents.
   Humans interact through the canvas. Syntax choices favor unambiguous parsing and
   generation over hand-writing ergonomics, but the language stays Mermaid-adjacent and
   skimmable.
2. **The file is the truth.** The canvas is a view. Every canvas edit is a file edit.
3. **Semantics and presentation are quarantined from each other.** Everything an agent
   needs lives in the semantic sections. Everything about pixels lives in the \`layout\`
   block, which is machine-managed and stripped from agent exports. Agents MUST ignore
   \`layout\` when reading and MUST NOT write it.
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
arch "Title" v0.1          # 1. header (required)

component ...              # 2. component declarations (the tree)

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
arch "Acme Platform" v0.1
\`\`\`

\`v0.1\` is the **spec version** the file targets. Parsers refuse files with a major
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
  - \`desc "..."\` — human-readable description (shown in the detail view). One per
    component. Multiline via triple quotes: \`desc """ ... """\`.
  - \`src "..."\` — where the component lives in code: a repo-relative path
    (\`apps/api/src/billing\`) or a URL. Single-line string only, at most one per
    component (a second one is error \`E004\`). Agents start here when implementing
    or verifying the component; the app renders it as a link.
  - Child \`component\` declarations — components nest arbitrarily deep, with JSON-object
    nesting semantics.
  - Payload blocks (§4).

### 3.1 Nesting and paths

Components form a tree. A component is referenced by its **dot-path from the root**:

\`\`\`
component backend "Backend" @vercel {
  component api "API" @vercel.functions
  component db "Postgres" @supabase.postgres
}

backend.api -> backend.db @sql
\`\`\`

Nesting is purely semantic containment ("this lives inside that"). Whether a container
renders as a **plane** (an area with its icon in the corner and children laid out
inside it) or as a collapsed **icon** you click into is presentation, and lives in
\`layout\` (§7) — the same file renders either way.

### 3.2 Example

\`\`\`
component db "Primary Postgres" @postgres {
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

## 4. Payload blocks

Payloads attach structured or freeform data to a component — or to a connection (§6):

\`\`\`\`
<name> <format> \`\`\`
<content>
\`\`\`
\`\`\`\`

- \`<name>\` — snake_case identifier, unique per owner (\`schema\`, \`env\`, \`endpoints\`,
  \`notes\`, \`message\`, …). Names are free; they exist so agents and the detail view can
  refer to a payload by role.
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
  v0.1 deliberately does not.

## 5. Types

A type tag connects a component or connection to the **catalog** — the curated library
of real technologies plus the user's saved custom types.

- Syntax: \`@namespace.name\` or \`@name\` (e.g. \`@aws.s3\`, \`@aws.lambda\`, \`@postgres\`,
  \`@vercel\`, \`@vercel.functions\`, \`@redis\`, \`@stripe\`).
- A type resolves against the catalog to an icon, a display style, and (later) detail
  templates. An **unresolved type is a warning, not an error** — the component renders
  generic, and the file still compiles. This keeps files portable between workspaces
  with different custom libraries.
- Types carry no compatibility rules in v0.1: nothing constrains what may connect to
  what.
- Abstract and concrete components mix freely — \`component auth "Auth Service"\` (your
  own code, untyped or typed with something like \`@service\`) can sit beside
  \`component cognito @aws.cognito\`.
- Custom types are defined in the app (component library UI) and referenced from files
  by tag; v0.1 has no in-file type definitions.

### 5.1 Initial connection-type library

\`@http\` \`@grpc\` \`@ws\` \`@sql\` \`@queue\` \`@event\` \`@stream\` \`@auth\` \`@reads\` \`@writes\`
\`@deploys\` \`@contains\` \`@depends\` — plus user-defined. All optional.

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
web -> backend.api @http : "REST, cookie session"
backend.api -> backend.db @sql
backend.api <-> cache @redis_protocol
billing -- stripe

backend.api -> orders_queue @queue : "order placed" {
  message json \`\`\`
  { "order_id": "uuid", "total_cents": "int", "placed_at": "timestamp" }
  \`\`\`
}
\`\`\`\`

Rules:

- **Both endpoints MUST resolve to declared components.** An unresolved endpoint is a
  hard validation error (\`E101\`). Nothing is ever auto-created.
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
  nesting boundaries and between a parent and its own descendant.
- Canonical form sorts connections by source path, then target path — so compiled
  output is deterministic and diffs are clean. Connections carry no sequence/ordering
  semantics. A connection with payloads is written as a multi-line block separated from
  its neighbours by a blank line; the sort order is unaffected.

## 7. The \`layout\` block

Everything presentational, in one machine-managed section at the end of the file:

\`\`\`
layout {
  web: { at: [0, 4], size: [4, 3] }
  backend: { at: [6, 0], size: [10, 12], display: plane }
  backend.api: { at: [1, 1], size: [4, 3] }
  backend.db: { at: [6, 1], size: [4, 3], display: icon }
}
\`\`\`

- Keys are component dot-paths. Values: \`at\` (grid cell, \`[col, row]\`, relative to the
  parent plane's grid for nested components), \`size\` (grid cells), \`display\`
  (\`icon\` | \`plane\`) for components with children.
- Grid-based: all positions are integer grid cells, matching the app's snap-to-grid
  canvas (React Flow).
- **Machine-managed.** The canvas writes it; humans and agents never do. A component
  with no layout entry — e.g. in a file an agent wrote or that was pasted in — is
  positioned by the auto-layout engine on load, and its computed position is then
  written back.
- Layout is always optional, never load-bearing: deleting the entire block yields the
  same architecture, auto-laid-out.
- Agent guidance (stated in docs and in the export header): ignore \`layout\` when
  reading; never emit it when writing.

## 8. Validation

A document is **valid** when:

| code   | rule                                                            | severity |
| ------ | --------------------------------------------------------------- | -------- |
| \`E001\` | file parses (header, declarations, fences)                      | error    |
| \`E002\` | component ids unique within their scope                         | error    |
| \`E003\` | payload names unique per component / per connection             | error    |
| \`E004\` | at most one \`src\` per component                                 | error    |
| \`E101\` | every connection endpoint resolves to a declared component      | error    |
| \`E201\` | \`json\` / \`yaml\` / \`table\` payloads parse in their format        | error    |
| \`W301\` | type tag resolves in the catalog                                | warning  |
| \`W302\` | duplicate connection                                            | warning  |
| \`W303\` | layout entry references a declared component                    | warning (entry dropped) |

Errors block agent export ("copy as prompt") and mark the document invalid in the UI;
the canvas still renders as much as it can. Warnings never block anything.

The canvas enforces \`E101\` interactively: an arrow dropped on empty canvas snaps back —
a dangling connection is never created in the first place.

## 9. Compilation targets

1. **Canonical form** — the formatter output the app always saves: fixed section order,
   sorted connections, normalized whitespace. Ensures clean diffs.
2. **Agent export ("copy as prompt")** — canonical form with the \`layout\` block
   stripped, prefixed by a short fixed header telling the agent what Archer is, how to
   read it, and that this document is the implementation spec. One click, ends up on the
   clipboard.
3. **Image export** — PNG of the current canvas view, for pasting alongside the code.

## 10. Full example

\`\`\`\`
arch "Acme SaaS" v0.1

component web "Next.js App" @vercel.nextjs {
  desc "App shell + marketing. RSC, deployed on Vercel."
  src "apps/web"
}

component backend "Backend" @vercel {
  desc "Everything server-side lives on Vercel."

  component api "API" @vercel.functions {
    desc "Route handlers. Auth via session cookie."
    endpoints table \`\`\`
    | method | path            | purpose            |
    | ------ | --------------- | ------------------ |
    | POST   | /api/checkout   | create session     |
    | GET    | /api/projects   | list projects      |
    \`\`\`
  }

  component db "Postgres" @supabase.postgres {
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
  desc "Our own thin wrapper over Cognito — issues sessions."
}

component cognito "Cognito" @aws.cognito
component stripe "Stripe" @stripe

web -> auth @http : "login"
web -> backend.api @http
auth -> cognito @http
backend.api -> backend.db @sql

backend.api -> stripe @http : "checkout sessions" {
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
  backend: { at: [6, 0], size: [12, 10], display: plane }
  backend.api: { at: [1, 1], size: [4, 3] }
  backend.db: { at: [7, 1], size: [4, 3], display: icon }
  cognito: { at: [0, 13], size: [3, 3] }
  stripe: { at: [20, 3], size: [3, 3] }
}
\`\`\`\`

## 11. Grammar sketch (EBNF-ish)

\`\`\`
file        = header { component | connection } [ layout ] ;
header      = "arch" string version ;
component   = "component" id [ string ] [ type ] [ "{" { bodyitem } "}" ] ;
bodyitem    = desc | src | component | payload ;
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

## 12. Open questions (deferred, not blocking v0.1)

- Multi-file / import (\`use "./billing.arch"\`) — v1 is one file per document.
- In-file custom type definitions for portability.
- Per-technology payload validation (\`sql\`, \`openapi\`, \`terraform\` formats).
- Views: multiple named layouts over one model (C4-style level switching).
`;
