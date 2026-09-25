import { LANGUAGE_SPEC } from "./languageSpec";

export const BRIEF = `Archer is an architecture-design tool: a drag-and-drop canvas for humans and a strict text language (".arch" documents) for agents, compiling losslessly into each other. Through this MCP server you can do everything a human can do in the app, from designing systems to keeping projects in sync with GitHub and running team workspaces.`;

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
1. Optionally \`list_types\` to use component types that render with real icons:
   vendor-neutral building blocks for system designs (\`@load_balancer\`,
   \`@api_gateway\`, \`@rate_limiter\`, \`@cdn\`, \`@cache\`, \`@queue\`,
   \`@database\`, \`@object_storage\`, …) and real technologies for concrete
   stacks (\`@postgres\`, \`@aws.sqs\`, \`@kafka\`, …).
2. \`create_project\` with your source. Same validation gates as update.
3. The result includes an editor URL — share it with the user.

### Use a worked example or a sample
1. \`list_examples\` — the worked examples from the docs, each with the
   language features it shows and links for the user (its docs section, and
   a sandbox that opens it in the editor without an account).
2. \`get_example\` — one example's full, canonical source: a model to follow
   when writing, or pass it to \`create_project\` to give the user an
   editable copy.
3. \`list_samples\` / \`get_sample\` — the dashboard's "From sample"
   starting points (whole, realistic systems). Pass a sample's source to
   \`create_project\` to start a project from it.

### Manage projects
- \`rename_project\` changes the title (only the \`arch "…"\` header line).
- \`duplicate_project\` copies a project, canvas arrangement included.
- \`delete_project\` is permanent (\`confirm: true\`, and only when asked).

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
   two points, or \`compare: "since_review"\` for everything the user hasn't
   reviewed yet. \`get_revision\` fetches a past source; \`restore_revision\`
   rolls the project back to it (as a new revision, so nothing is lost).
3. Humans see the same feed in the app, and every write you make is
   attributed to your client name — so **always pass a \`summary\`** to
   \`create_project\`/\`update_project\` saying what you changed and why.
4. The app highlights changes by agents (and by commits to a repository
   file) until the user reviews them; \`get_history\` marks each revision
   \`reviewed\`. When the user says they've seen them, \`mark_reviewed\`
   clears the highlights.

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
- \`update_project\` on such a project saves to its **unpublished draft**. Use
  it only when you have no checkout of the repository. \`diff_project\` with
  \`compare: "unpublished"\` shows the draft's changes; \`publish_to_github\`
  writes them to the file when the user asks — as a pull request by default
  (\`mode: "commit"\` pushes straight to the branch, only on request).
- \`sync_with_github\` brings in what changed on the branch (the push
  webhook usually has already). When the file and the draft changed the same
  things it records a **conflict** instead (\`get_project\` →
  \`repository.sync.conflicts\`): show the user \`diff_project\` with
  \`compare: "incoming"\`, then call \`sync_with_github\` with \`resolve:
  "draft"\` (keep the draft's side) or \`"repo"\` (keep the repository's) as
  they choose.
- To store a project in a file: \`move_to_github\` (an existing project;
  the first publish writes the file) or \`import_from_github\` (a new
  project from a file; \`list_arch_files\` shows what's there, and
  \`list_github_repos\` what the user can reach). \`stop_syncing\` keeps it
  in Archer again. These act with the user's own GitHub access; if private
  repositories are hidden (\`private_access: false\`), the user grants access
  in the app — it needs their browser.

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
   action for extras). \`list_github_commits\` shows what changed in the code
   since the last check (\`since\`). \`dismiss_drift_finding\` drops a finding
   the user dealt with; \`clear_drift\` removes the report.

### Share and export
- \`share_project\` turns on "anyone with the link can view" and returns the
  link, a live SVG image of the diagram and README embed Markdown — only when
  the user asks, since anyone with the link can read the whole architecture.
  \`get_shared_project\` reads a project from a share link someone gave you.
- \`render_diagram\` returns a link to an SVG image of a project (valid for
  an hour): download it to a file or give it to the user. \`compile_for_agent\`
  is the text export for coding agents.

### Teams
- \`create_workspace\` makes a team workspace the user owns (it doesn't
  become current: \`use_workspace\`). \`list_members\`, \`invite_member\`
  (by email; they get access when they sign in to Archer with it — Archer
  sends no email), \`set_member_role\` and \`remove_member\` manage who's in
  it: owners manage, editors change projects, viewers read.
  \`rename_workspace\`, \`delete_workspace\` and \`leave_workspace\` do what
  the app's workspace menu does. A team always keeps a signed-in owner.

### Act only when asked
Some tools reach other people or can't be undone: \`delete_project\`,
\`delete_workspace\`, \`leave_workspace\` and \`remove_member\` (all need
\`confirm: true\`), \`publish_to_github\`, \`share_project\`,
\`invite_member\`, \`set_member_role\`, \`mark_reviewed\`, \`use_workspace\`
and \`stop_syncing\`. Call them only when the user asked for that action.

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
  \`set_display\` tool. To move or resize particular components,
  \`move_components\`. To tidy some components (and what's inside them),
  \`auto_layout_project\` with \`paths\`; to re-arrange everything from
  scratch, \`auto_layout_project\` with \`reset: true\`.

## Error reference (what blocks a write)

| Code | Meaning | Fix |
| ---- | ------- | --- |
| E001 | Syntax error | Follow the message; check fences and quotes |
| E002 | Duplicate component id in one scope | Rename one of them |
| E003 | Duplicate payload name on one component or connection | Rename one payload |
| E004 | More than one \`src\` on a component | Keep one |
| E101 | Connection endpoint doesn't resolve | Declare the component or fix the path |
| E201 | json/yaml/table payload doesn't parse | Fix the payload content |
| W301 | Unknown type tag (warning) | Optional: use a catalog tag or create a custom type |
| W302 | Duplicate connection (warning) | Optional: remove one |
| W303 | Layout entry for unknown path (warning) | Ignored; entry is dropped |

## Capability map (vs. the human app)

Everything a human can do in the app maps to a tool:

| In the app | Tool |
| ---------- | ---- |
| Dashboard: open, New document, From sample, Rename, Duplicate, Delete | \`list_projects\`, \`get_project\`, \`create_project\`, \`list_samples\`/\`get_sample\`, \`rename_project\`, \`duplicate_project\`, \`delete_project\` |
| Editing components, connections, descriptions, payloads, nesting (canvas, code pane, detail panel, paste) | \`update_project\` with the full source |
| Palette: custom types | \`list_types\`, \`create_custom_type\`, \`delete_custom_type\` |
| Dragging and resizing; Collapse/Expand; Re-layout selection / level / everything | \`move_components\`, \`set_display\`, \`auto_layout_project\` (\`paths\` or \`reset\`) |
| History: revisions, diffs, Restore; the agent-changes banner: Review, Mark reviewed | \`get_history\`, \`get_revision\`, \`diff_project\`, \`restore_revision\`, \`mark_reviewed\` |
| Share dialog; opening a share link | \`share_project\`, \`get_shared_project\` |
| Export: Copy for agent, Copy .arch source, image | \`compile_for_agent\`, \`get_project\`, \`render_diagram\` (a link to an SVG) |
| Link repository; the History panel's commits | \`link_repository\`, \`list_github_commits\` |
| Drift panel: report, Dismiss, Clear | \`report_drift\`, \`get_drift\`, \`dismiss_drift_finding\`, \`clear_drift\` |
| From GitHub, Move to GitHub, Sync now, Keep mine/theirs, Publish, Stop syncing, the repository picker | \`import_from_github\`, \`move_to_github\`, \`sync_with_github\`, \`publish_to_github\`, \`stop_syncing\`, \`list_github_repos\`, \`list_arch_files\` |
| Workspace menu: switch, New team workspace, Rename, Delete, Leave | \`list_workspaces\`, \`use_workspace\`, \`create_workspace\`, \`rename_workspace\`, \`delete_workspace\`, \`leave_workspace\` |
| Members dialog: members, Invite, roles, Remove | \`list_members\`, \`invite_member\`, \`set_member_role\`, \`remove_member\` |
| The docs' worked examples | \`list_examples\`, \`get_example\` |

What stays with the person: signing in and connecting agents, granting
Archer access to private GitHub repositories (a consent screen in their
browser), the theme, and the canvas's own view state (zoom, selection,
undo). Images come as SVG; for a PNG, point users at the editor's Export
menu.

---

# Archer language specification (v0.1)

${LANGUAGE_SPEC}`;
