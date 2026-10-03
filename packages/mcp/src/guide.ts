import { LANGUAGE_SPEC } from "./languageSpec";

export const BRIEF = `Archer is an architecture-design tool: a drag-and-drop canvas for humans and a strict text language (".arch" documents) for agents, compiling losslessly into each other. Through this MCP server you can do everything a human can do in the app: create/read/update/delete projects, design systems (components nested to any depth, planes that group them, connections, validated schema payloads), define custom component types, and control presentation.`;

export const GUIDE = `# Archer MCP Server — Agent Guide

${BRIEF}

## The mental model (read this first)

1. **A project IS one Archer text document.** There is no separate diagram
   state: the canvas humans see is rendered from the exact source you read and
   write. Editing the source edits their canvas, live.
2. **Everything semantic is in the source; everything visual is in the
   \`layout\` block** at the end of the document. You normally never write
   \`layout\` — the server auto-completes it and preserves the human's manual
   arrangement when you update (see "Layout rules" below). What you do write
   for readers is a component's \`shape\` and the planes that group
   components (see "Shapes" and "Group with planes" below).
3. **The language is strict.** Writes are rejected while the document has
   errors (unresolved connection endpoints, invalid payloads, duplicate ids).
   The workflow is: write → get diagnostics → fix → retry. Diagnostics carry
   codes and line numbers; fix exactly what they name.

## Keep every canvas readable (the most important habit)

A canvas showing 30 boxes and 50 crossing lines tells nobody anything, however
accurate it is. Archer's answer is nesting: any component can hold
components, to any depth, and the human opens a box to see inside it. Design
a big system as a stack of small canvases, not one big one.

- **Budget: about 5–9 components per canvas, 12 at most, and about as many
  lines as components.** The budget applies to the top level and again to
  the inside of every component. Depth is free; width is what makes a
  diagram unreadable.
- **Design top-down, like zooming in.**
  1. The top level is the whole system in one picture: who uses it, the
     product's few main parts, where data lives, and the outside world.
     Someone new should get the story in ten seconds.
  2. Inside each main part: its services, apps or modules.
  3. Inside those: their parts (handlers, workers, tables, …), as far down as
     is useful. A large codebase usually needs three or four levels.
- **Don't mirror the repository's folder list.** Twenty packages are not
  twenty top-level boxes: group them by what they do for the system, and
  put each package (with its \`src\`) inside the group it belongs to.
- **Over budget? Nest.** Find the components that work together for one
  purpose (the packages behind the API, a job system's workers, the stores
  of one service) and move them inside one component named for that
  purpose. Their connections to the rest now show as a line to that box.
- **Planes don't reduce clutter.** Everything on a plane is still drawn on
  the same canvas. A plane with more than three or four components is
  usually a component waiting to be nested: write
  \`component core "Core" { … }\` instead of \`plane core "Core" { … }\`,
  and connect to \`core\`.
- **Group the outside world.** Email, OAuth, KMS, captcha and webhook
  providers become one \`component external "External Services"\` (shape
  \`cloud\`) with each provider nested in it. Keep a provider at the top
  level only when it is central to the story (the payment provider of a
  shop).
- **Every connection costs a line on each canvas above it.** A connection to
  a nested part is drawn, one level up, as a line to the box that holds it
  (several between the same two boxes share one line). Draw the flows that
  matter; connect to the whole component (\`web -> core\`) when which part
  receives it isn't the point; and connect clients to the entry point, not
  to every service behind it.

A codebase with apps, a dozen packages, three stores and eight providers
still reads at a glance as five boxes and four lines:

    arch "Signing Platform" v0.2

    component signer "Signer" {
      shape person
      color sky
    }

    component web "Web App" @vercel.nextjs {
      shape browser
      color sky
      src "apps/web"
    }

    component core "Core" {
      color blue
      desc "Business logic every app shares: documents, signing, auth."
      src "packages/lib"
      component documents "Documents" {
        color blue
        desc "Envelopes, recipients and fields."
      }
      component signing "PDF Signing" {
        color blue
        src "packages/signing"
      }
      component auth "Auth" {
        shape lock
        color rose
        src "packages/auth"
      }
    }

    component data "Data" {
      icon database
      color teal
      component db "Postgres" @postgres {
        shape cylinder
      }
      component files "Object Storage" @aws.s3
    }

    component external "External Services" {
      shape cloud
      component kms "Google Cloud KMS" @gcp
      component email "Email Provider"
      component oauth "OAuth Providers"
    }

    core -> data.db @sql
    core.auth -> external.oauth @http
    core.documents -> data.files @http : "PDFs"
    core.documents -> external.email @http : "invites"
    core.signing -> external.kms @http : "sign digest"
    signer -> web @http
    web -> core @http

Each of those boxes then gets the same treatment inside (\`core.documents\`
can hold its own parts, and so on). The \`nesting\` and \`music-streaming\`
worked examples (\`get_example\`) show more: the second is a whole product
whose top level is nine boxes.

\`create_project\`, \`update_project\` and \`validate_source\` return
\`hints\` when a canvas is over budget, naming it. When you are designing the
document, act on them before you finish. When you are making a small edit to
a document the user arranged, mention them instead of restructuring it unasked.

## Authentication

The user connected this server and approved it in their browser (MCP OAuth,
signing in to Archer with GitHub), so you already act as them — there is
nothing to configure and no key or token to ask for. A user can belong to
several workspaces (Personal plus team workspaces, each with a role).
Project tools operate on the CURRENT workspace, Personal by default:
\`list_workspaces\` shows them, \`use_workspace\` switches (remembered across
sessions). Viewers can read but writes are refused. If a project tool
fails, call \`get_workspace_info\` and relay what it reports.

## Standard workflows

### Read an existing architecture
1. \`list_projects\` → pick the project id.
2. \`get_project\` → the full source plus current diagnostics.
3. To hand the architecture to another model or use it as an implementation
   spec: \`compile_for_agent\` (keeps the layout for context, prepends a reading guide).

### Modify an existing architecture
1. **Always \`get_project\` first** and base your edit on the returned source —
   \`update_project\` replaces the whole document, so editing blind discards
   the human's other changes.
2. Send the full modified source to \`update_project\`.
3. If the result reports errors, the write was REJECTED — nothing was saved.
   Fix the diagnostics and resend. Warnings do not block.

### Create a new architecture
1. Optionally \`list_types\` to use component types that render with real icons:
   vendor-neutral building blocks for system designs (\`@load_balancer\`,
   \`@api_gateway\`, \`@rate_limiter\`, \`@cdn\`, \`@cache\`, \`@queue\`,
   \`@database\`, \`@object_storage\`, …) and real technologies for concrete
   stacks (\`@postgres\`, \`@aws.sqs\`, \`@kafka\`, …).
2. Plan the top level first: the five to nine boxes that tell the story,
   then what goes inside each (see "Keep every canvas readable"). Give
   components colors by role as you write them (see "Colors").
3. \`create_project\` with your source. Same validation gates as update.
   If the result has \`hints\` (a crowded canvas, or a mostly grey
   diagram), fix them with \`update_project\`.
4. The result includes an editor URL — share it with the user.

### Use a worked example
1. \`list_examples\` — the worked examples from the docs, each with the
   language features it shows and links for the user (its docs section, and
   a sandbox that opens it in the editor without an account).
2. \`get_example\` — one example's full, canonical source: a model to follow
   when writing, or pass it to \`create_project\` to give the user an
   editable copy.

### Add a technology/service that has no type in the catalog
1. \`list_types\` with a search term to confirm it's missing.
2. Either use an untyped component (fine; give it an \`icon\` that says what
   it is), or \`create_custom_type\` (name, glyph — any icon name — and
   color) → it returns a \`@custom.*\` tag
   usable immediately in any project of this workspace and visible in the
   human's palette.

### Review what changed
1. \`get_history\` lists revisions newest-first with who saved (the human, or an
   agent by its client name), when, their one-line summary, and counts of
   components, planes and connections added, removed and changed (a
   connection counts as changed when only its payloads differ).
2. \`diff_project\` returns the structured diff — by default the latest change
   (current document vs. the revision before it); pass revision ids for any
   two points. \`get_revision\` fetches a past source; to roll back, send it to
   \`update_project\`.
3. Humans see the same feed in the app, and every write you make is
   attributed to your client name — so **always pass a \`summary\`** to
   \`create_project\`/\`update_project\` saying what you changed and why.

### Projects stored in a repository file
A project can be stored in a \`.arch\` file in a GitHub repository instead of
in Archer (\`get_project\` then returns \`repository.path\`). That file, on
that branch, is the source of truth:
- **Working in that repository? Edit the file, not the project.** Change it
  in the same commit or pull request as the code it describes and validate
  it with \`archer check\` (no sign-in needed). When your change reaches the
  branch, the canvas follows on its own.
- Write only architecture to the file: canonical form, **no layout block**
  (canvas positions stay in Archer). \`format_source\` gives canonical form.
- \`update_project\` on such a project saves to its **unpublished draft**; a
  human publishes drafts back to the repository as a pull request. Use it
  only when you have no checkout of the repository.

### Link components to code
- The \`src "…"\` field inside a component body records where it lives:
  a repo-relative path to a file or a folder (\`src "apps/api/src/billing"\`)
  or a URL. A component that spans several places gets one \`src\` line for
  each. Set it whenever you know the location — humans jump to it from the
  canvas, and drift checks start there. Keep it up to date when you move code.
- Keep \`src\` to where the component is **implemented**, not everything it
  uses. A page that renders a shared table component, imports a UI kit or
  calls a utility module does not cite those files: they are dependencies,
  not the component (if one matters architecturally, it is its own component
  with its own \`src\`, connected or nested). Prefer the component's folder
  over a list of the files in it. One to a few \`src\` lines is normal; a
  long list means you are cataloguing imports.

### Drift check (does the code still match the architecture?)
0. If \`get_project\` returns a \`repository\`, that repo at that branch is
   the codebase to check. If it returns null and the user names the repo,
   call \`link_repository\` first so the human sees commits next to
   architecture changes and \`src\` links resolve.
1. \`get_project\` — read every component, its \`desc\`, payloads and \`src\`.
2. For each component, find the implementation: follow \`src\`, else search
   the repo. Compare what you find with the component's \`desc\`/payloads
   (schemas, endpoints, env vars).
3. \`report_drift\` with ONE finding per discrepancy: \`missing\` (declared,
   no implementation found), \`changed\` (implementation differs — say how in
   \`note\`), \`extra\` (in the code, not in the document — suggest a \`name\`
   and the \`src\` where you found it). Send an EMPTY list when everything
   matches so the human sees a green state.
4. Never modify the document during a drift check unless the user asked;
   they act on the findings from the canvas (badges + an "add to document"
   action for extras).

## Writing good Archer documents (agent-specific advice)

The full language specification is at the end of this guide. Key habits:

- **Ids** are snake_case and unique per scope; display names go in quotes:
  \`component api_gw "API Gateway" @aws.api_gateway\`.
- **Reference by dot-path** from the root: \`orders.api -> orders.db @sql\`.
  Planes are not part of paths.
- **Never point a connection at an undeclared component** — that is error
  E101 and blocks the write. Declare every endpoint.
- **Put real detail in payloads.** A Postgres component should carry its
  schema; an API should list its endpoints. \`json\`/\`yaml\`/\`table\` payloads
  are syntax-validated (E201 blocks the write); \`markdown\` is free-form:

      component db "Postgres" @postgres {
        desc "Primary datastore."
        schema table \`\`\`
        | column | type | notes |
        | ------ | ---- | ----- |
        | id     | uuid | pk    |
        \`\`\`
      }

- **Put contracts on connections.** A connection takes the same payload
  blocks in a \`{ … }\` body: the message schema on a \`@queue\` edge, the
  request/response shape on an \`@http\` call, the event names on an
  \`@event\` bus. That is where the next agent looks for the interface:

      orders.api -> order_events @queue : "order placed" {
        message json \`\`\`
        { "order_id": "uuid", "total_cents": "int" }
        \`\`\`
      }

- **Use \`desc\` on every non-obvious component** — it is what humans read in
  the detail panel and what agents rely on when implementing.
- **Add \`src\` when you know where a component lives in code** — it is how
  the next agent (or you, later) finds the implementation. Cite the
  component's own folder or entry points, never the shared components,
  libraries and helpers it imports.
- **Nest the parts inside the thing they belong to**: a service's API and
  database, a cluster's services, an agent's tools. Any component can hold
  components, at any depth. The human sees it as one box and opens it to
  see its parts, so nesting is how a big system stays readable (see "Keep
  every canvas readable" for the budget). Connect
  across any depth, to a part (\`web -> orders.api\`) or to the whole
  component (\`web -> orders\`), whichever is true.
- **Group with planes, not wrapper components.** A \`plane\` is a titled
  region of the canvas (a frontend and a backend, a cloud account, a VPC)
  and nothing more: the components declared in its body sit on it and keep
  their paths (\`api\`, not \`backend.api\`), and a connection can never
  name a plane (E101). Planes nest, take a \`@type\` and a \`desc\`, and can
  go inside a component too:

      plane frontend "Frontend" {
        component web "Web App" @vercel.nextjs
      }

      plane backend "Backend" @aws {
        component api "API" @aws.api_gateway
        component db "Postgres" @aws.rds
      }

      api -> db @sql
      web -> api @http

  Use a plane when the group is only where things are; nest when the parts
  make up one thing that others talk to.
- **Type tags are optional.** An unknown tag is only a warning (renders as a
  generic box); prefer catalog/custom tags when a good one exists.
- **Shapes.** A component is drawn as a box unless its body says otherwise
  with \`shape <name>\`: \`cylinder\` for a database, \`memory\` for a
  cache, \`queue\` for a queue or stream, \`cloud\` for an outside service,
  \`globe\` for the internet, \`person\` and \`people\` for users and teams,
  \`robot\` for an AI agent, \`brain\` for a model, \`gear\` for a worker,
  \`clock\` for a scheduler, \`lock\` for auth, \`browser\`, \`phone\` and
  \`terminal\` for clients, flowchart shapes (\`pill\`, \`diamond\`,
  \`parallelogram\`) and many more (spec §3.3, or \`list_types\`). The type
  still picks the icon and color inside the shape. Shapes make a diagram
  readable at a glance: use them where they say something, and leave the rest
  as boxes:

      component orders "Orders" @postgres {
        shape cylinder
        desc "Every order and its line items."
      }
- **Icons.** A component shows its type's icon, and an untyped one shows
  none, unless its body names one with \`icon <name>\`: a Phosphor icon in
  snake case (\`icon shopping_cart\`, \`icon credit_card\`,
  \`icon user_circle\`) or a catalog icon (\`database\`, \`server\`,
  \`queue\`; Phosphor's own name works for those too, \`hard_drives\` for
  \`server\`). \`list_types\` lists every icon by group. Give an untyped
  component an icon when one says what it is; a typed one rarely needs one.
- **Colors — color every document you write.** A component is drawn in its
  type's color unless its body names one with \`color <name>\` (\`red\`,
  \`orange\`, \`amber\`, \`yellow\`, \`lime\`, \`green\`, \`emerald\`,
  \`teal\`, \`cyan\`, \`sky\`, \`blue\`, \`indigo\`, \`violet\`,
  \`purple\`, \`fuchsia\`, \`pink\`, \`rose\`, \`slate\`) or
  \`color "#rrggbb"\`. Untyped components and the vendor-neutral types
  (\`@service\`, \`@queue\`, \`@worker\`, \`@database\`, …) are slate grey,
  so a document without colors is a wall of grey that hides its structure.
  A color draws the component's icon in it and tints its card or shape; a
  product's logo keeps its own colors, so on a vendor type it only tints the
  card. Rough guidelines:
  - **Color by meaning, with 3–6 colors per document**, and keep the same
    scheme on every canvas. By role (below) suits most systems; by domain
    or team suits a story about ownership (each domain one color, its parts
    too).
  - **Role colors**, when nothing better suggests itself:

    | Role | Color |
    | ---- | ----- |
    | People, clients and apps | \`sky\` |
    | Edge: gateways, CDNs, load balancers | \`indigo\` |
    | Services and business logic | \`blue\` |
    | Data: databases, caches, storage | \`teal\` |
    | Messaging: queues, streams, events | \`amber\` |
    | Jobs, workers and schedulers | \`orange\` |
    | AI: models, agents, RAG | \`violet\` |
    | Auth and security | \`rose\` |
    | Outside services | none, or \`slate\`: let them stay quiet |

  - **Same role, same color.** Don't give every component its own color; a
    rainbow says nothing. A component with parts takes its group's color,
    and its parts follow the scheme on their own canvas.
  - **One accent to make a point** is fine: the new parts of a proposal, or
    where the money flows (the \`music-streaming\` example makes it
    \`emerald\`). Say what it means in a \`desc\` or your summary.
  - **Keep red for trouble**: something deprecated, failing or about to go.
  - **In the user's document, keep their colors.** Color what you add to
    match their scheme, and don't recolor what they chose unless asked.
- **AI systems have their own building blocks:** \`@llm\`, \`@agent\`, \`@mcp\`
  (an MCP server), \`@tool\`, \`@rag\`, \`@embeddings\`, \`@vector_db\`,
  \`@memory\`, \`@guardrails\`, \`@evals\` and more (\`list_types\` with search
  \`ai\`), beside the vendors (\`@anthropic\`, \`@openai\`, \`@pinecone\`, …).
  Draw an agent's calls to MCP servers as \`@mcp\` connections, and one agent
  calling another as \`@a2a\`.
- Match the user's requested granularity: one \`@postgres\` node with a schema
  payload, or individual \`@postgres.table\` children — both are idiomatic.

## Layout rules (presentation)

- The machine-managed \`layout\` block holds grid positions and sizes of
  components and planes. The top level and every component's inside each
  have their own grid.
- **Omit layout entirely when writing.** On save, the server keeps the
  existing positions of every component that still exists and auto-places
  only new ones. Humans' hand-arranged canvases survive your edits.
- You MAY include a layout block if you have an explicit reason (e.g. the user
  asks you to arrange the diagram); entries are \`path: { at: [col, row],
  size: [w, h] }\` on an integer grid, with \`at\` relative to the item's
  canvas, or to the plane it sits on.
- To re-arrange everything from scratch, \`auto_layout_project\` with
  \`reset: true\`.

## Error reference (what blocks a write)

| Code | Meaning | Fix |
| ---- | ------- | --- |
| E001 | Syntax error | Follow the message; check fences and quotes |
| E002 | Duplicate id in one scope (components and planes share ids) | Rename one of them |
| E003 | Duplicate payload name on one component or connection | Rename one payload |
| E004 | More than one \`shape\`, \`icon\` or \`color\` on a component | Keep one |
| E101 | Connection endpoint doesn't resolve, or is a plane | Declare the component, fix the path, or connect a component on the plane |
| E201 | json/yaml/table payload doesn't parse | Fix the payload content |
| W301 | Unknown type tag (warning) | Optional: use a catalog tag or create a custom type |
| W302 | Duplicate connection (warning) | Optional: remove one |
| W303 | Layout entry for unknown path (warning) | Ignored; entry is dropped |
| W304 | Unknown shape (warning) | Optional: use one of the shapes the message lists |
| W305 | Unknown icon (warning) | Optional: use an icon \`list_types\` lists |
| W306 | Unknown color (warning) | Optional: use a color \`list_types\` lists, or \`"#rrggbb"\` |

## Capability map (vs. the human app)

Everything a human can do in the app maps to a tool: browse projects
(\`list_projects\`/\`get_project\`), create/delete projects, edit anything —
components, connections, descriptions, shapes, icons, colors, payloads, nesting, planes —
(\`update_project\` with full source), manage the custom component library
(\`create_custom_type\`/\`delete_custom_type\`), arrange the canvas
(\`auto_layout_project\`, or explicit layout entries), review history
(\`get_history\`/\`get_revision\`/\`diff_project\`), report drift (\`report_drift\`/\`get_drift\`), switch workspaces
(\`get_workspace_info\`, \`list_workspaces\`/\`use_workspace\`), read the docs' worked
examples (\`list_examples\`/\`get_example\`), export the agent spec
(\`compile_for_agent\`), and draw a project as an SVG image
(\`render_project\`: save it as a .svg file, put it in a README, or look at
it). Sharing links, members and PNG export are human-app-exclusive — point
users at the editor's Share and Export menus. When the user wants to tell the
Archer team something (a bug, a gap, an idea), \`send_feedback\` sends it as
them, like "Send feedback" in the app — only when they ask.

---

# Archer language specification (v0.2)

${LANGUAGE_SPEC}`;
