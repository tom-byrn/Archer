import { LANGUAGE_SPEC } from "./languageSpec";

export const BRIEF = `Archer is an architecture-design tool: a drag-and-drop canvas for humans and a strict text language (".arch" documents) for agents, compiling losslessly into each other. Through this MCP server you can do everything a human can do in the app: create/read/update/delete projects, design systems (components, connections, nested containers, validated schema payloads), define custom component types, and control presentation.`;

export const GUIDE = `# Archer MCP Server — Agent Guide

${BRIEF}

## The mental model (read this first)

1. **A project IS one Archer text document.** There is no separate diagram
   state: the canvas humans see is rendered from the exact source you read and
   write. Editing the source edits their canvas, live.
2. **Everything semantic is in the source; everything visual is in the
   \`layout\` block** at the end of the document. You normally never write
   \`layout\` — the server auto-completes it and preserves the human's manual
   arrangement when you update (see "Layout rules" below).
3. **The language is strict.** Writes are rejected while the document has
   errors (unresolved connection endpoints, invalid payloads, duplicate ids).
   The workflow is: write → get diagnostics → fix → retry. Diagnostics carry
   codes and line numbers; fix exactly what they name.

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
   spec: \`compile_for_agent\` (strips layout, prepends a reading guide).

### Modify an existing architecture
1. **Always \`get_project\` first** and base your edit on the returned source —
   \`update_project\` replaces the whole document, so editing blind discards
   the human's other changes.
2. Send the full modified source to \`update_project\`.
3. If the result reports errors, the write was REJECTED — nothing was saved.
   Fix the diagnostics and resend. Warnings do not block.

### Create a new architecture
1. Optionally \`list_types\` to use component types that render with real icons.
2. \`create_project\` with your source. Same validation gates as update.
3. The result includes an editor URL — share it with the user.

### Use a worked example
1. \`list_examples\` — the worked examples from the docs, each with the
   language features it shows and links for the user (its docs section, and
   a sandbox that opens it in the editor without an account).
2. \`get_example\` — one example's full, canonical source: a model to follow
   when writing, or pass it to \`create_project\` to give the user an
   editable copy.

### Add a technology/service that has no type in the catalog
1. \`list_types\` with a search term to confirm it's missing.
2. Either use an untyped component (fine, renders generic), or
   \`create_custom_type\` (name, glyph, color) → it returns a \`@custom.*\` tag
   usable immediately in any project of this workspace and visible in the
   human's palette.

### Review what changed
1. \`get_history\` lists revisions newest-first with who saved (the human, or an
   agent by its client name), when, their one-line summary, and counts of
   components/connections added, removed and changed (a connection counts as
   changed when only its payloads differ).
2. \`diff_project\` returns the structured diff — by default the latest change
   (current document vs. the revision before it); pass revision ids for any
   two points. \`get_revision\` fetches a past source; to roll back, send it to
   \`update_project\`.
3. Humans see the same feed in the app, and every write you make is
   attributed to your client name — so **always pass a \`summary\`** to
   \`create_project\`/\`update_project\` saying what you changed and why.

### Link components to code
- The \`src "…"\` field inside a component body records where it lives:
  a repo-relative path (\`src "apps/api/src/billing"\`) or a URL. Set it
  whenever you know the location — humans jump to it from the canvas, and
  drift checks start there. Keep it up to date when you move code.

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
- **Reference by dot-path** from the root: \`backend.api -> backend.db @sql\`.
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

      backend.api -> orders_queue @queue : "order placed" {
        message json \`\`\`
        { "order_id": "uuid", "total_cents": "int" }
        \`\`\`
      }

- **Use \`desc\` on every non-obvious component** — it is what humans read in
  the detail panel and what agents rely on when implementing.
- **Add \`src\` when you know where a component lives in code** — it is how
  the next agent (or you, later) finds the implementation.
- **Nest for containment** ("runs inside / belongs to"), connect for
  communication. Both are allowed across any depth.
- **Type tags are optional.** An unknown tag is only a warning (renders as a
  generic box); prefer catalog/custom tags when a good one exists.
- **AI systems have their own building blocks:** \`@llm\`, \`@agent\`, \`@mcp\`
  (an MCP server), \`@tool\`, \`@rag\`, \`@embeddings\`, \`@vector_db\`,
  \`@memory\`, \`@guardrails\`, \`@evals\` and more (\`list_types\` with search
  \`ai\`), beside the vendors (\`@anthropic\`, \`@openai\`, \`@pinecone\`, …).
  Draw an agent's calls to MCP servers as \`@mcp\` connections, and one agent
  calling another as \`@a2a\`.
- Match the user's requested granularity: one \`@postgres\` node with a schema
  payload, or individual \`@postgres.table\` children — both are idiomatic.

## Layout rules (presentation)

- The machine-managed \`layout\` block holds grid positions/sizes and whether a
  container renders expanded (\`plane\`) or collapsed (\`icon\`).
- **Omit layout entirely when writing.** On save, the server keeps the
  existing positions of every component that still exists and auto-places
  only new ones. Humans' hand-arranged canvases survive your edits.
- You MAY include a layout block if you have an explicit reason (e.g. the user
  asks you to arrange the diagram); entries are \`path: { at: [col, row],
  size: [w, h], display: icon|plane }\` on an integer grid.
- To collapse or expand a container without touching the source, use the
  \`set_display\` tool. To re-arrange everything from scratch,
  \`auto_layout_project\` with \`reset: true\`.

## Error reference (what blocks a write)

| Code | Meaning | Fix |
| ---- | ------- | --- |
| E001 | Syntax error | Follow the message; check fences and quotes |
| E002 | Duplicate component id in one scope | Rename one of them |
| E003 | Duplicate payload name on one component or connection | Rename one payload |
| E101 | Connection endpoint doesn't resolve | Declare the component or fix the path |
| E201 | json/yaml/table payload doesn't parse | Fix the payload content |
| W301 | Unknown type tag (warning) | Optional: use a catalog tag or create a custom type |
| W302 | Duplicate connection (warning) | Optional: remove one |
| W303 | Layout entry for unknown path (warning) | Ignored; entry is dropped |

## Capability map (vs. the human app)

Everything a human can do in the app maps to a tool: browse projects
(\`list_projects\`/\`get_project\`), create/delete projects, edit anything —
components, connections, descriptions, payloads, nesting — (\`update_project\`
with full source), manage the custom component library
(\`create_custom_type\`/\`delete_custom_type\`), arrange the canvas
(\`auto_layout_project\`, \`set_display\`, or explicit layout entries), review history
(\`get_history\`/\`get_revision\`/\`diff_project\`), report drift (\`report_drift\`/\`get_drift\`), switch workspaces
(\`get_workspace_info\`, \`list_workspaces\`/\`use_workspace\`), read the docs' worked
examples (\`list_examples\`/\`get_example\`), and export the agent spec
(\`compile_for_agent\`). The only human-app-exclusive feature is PNG export —
point users at the Export menu in the editor.

---

# Archer language specification (v0.1)

${LANGUAGE_SPEC}`;
