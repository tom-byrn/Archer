# Archer MCP Server

`packages/mcp` exposes everything a human can do in the Archer app to AI
agents over the Model Context Protocol: browse/create/edit/delete projects,
design architectures in the Archer language (with the same validation gates
the app enforces), manage the custom component-type library, control canvas
presentation, and compile agent-ready implementation specs.

## Setup

Prerequisites: the Convex backend running (`npx convex dev` in `apps/web`) and
`pnpm install` done at the repo root.

1. **Create an API key** — open Archer (http://localhost:3000), sign in with
   GitHub, open **Connect an agent** from your avatar menu, and create a key.
   The key unlocks your workspace (your projects, custom types, history,
   questions, drift). It is shown once; only its hash is stored.
2. **Register the server** with your MCP client. For Claude Code:

   ```sh
   claude mcp add archer \
     --env ARCHER_API_KEY=<key> \
     -- pnpm --dir <absolute-path-to-repo>/packages/mcp start
   ```

   Alternatively skip the env var and, in your first session, give the agent
   the key and have it call `set_api_key` — it persists to `~/.archer/key`
   (mode 0600). Revoke keys any time from the same dialog.

   Upgrading from a pre-auth setup? `ARCHER_WORKSPACE_ID` and
   `~/.archer/workspace` are now ignored (the server says so in its error);
   sign in once so the app claims your old anonymous workspace, then create a
   key.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARCHER_API_KEY` | `~/.archer/key` file, else unset | API key created in the app; determines whose workspace the server operates on (replaces `ARCHER_WORKSPACE_ID`, now ignored) |
| `CONVEX_URL` | `http://127.0.0.1:3210` | The Convex backend |
| `ARCHER_APP_URL` | `http://localhost:3000` | Base for the editor URLs returned by tools |
| `ARCHER_AGENT_NAME` | the MCP client's declared name, else `agent` | How the agent's edits, questions and drift reports are attributed in the app |

## Tools (27)

**Documentation** — `get_guide` returns the full agent guide (mental model,
workflows, error reference, complete language spec); also exposed as the MCP
resource `archer://guide`. Agents should read it once before writing.

**Language (stateless, no workspace needed)** — `validate_source`,
`format_source`, `compile_for_agent` (also accepts a `project_id`),
`auto_layout_source`.

**Catalog & custom types** — `list_types` (catalog + workspace custom types +
connection types + glyph list), `create_custom_type`, `delete_custom_type` —
full parity with the palette's "+" flow; created types appear in the human's
palette instantly.

**Projects** — `list_projects`, `get_project`, `create_project`,
`update_project` (full-document replace with automatic layout preservation:
surviving components keep their canvas positions, new ones are auto-placed),
`delete_project` (requires `confirm: true`).

**Presentation** — `set_display` (collapse/expand a container to icon/plane),
`auto_layout_project` (`reset: true` re-arranges everything).

**History** — `get_history` (revisions with author, summary, and change
counts), `get_revision` (past source), `diff_project` (structured diff between
any two revisions; defaults to the latest change).

**Questions** — `ask_question`, `list_questions`, `answer_question`,
`resolve_question`.

**Drift** — `report_drift`, `get_drift`.

**Repository** — `link_repository` (record the GitHub repo + branch a
project describes; `get_project` then returns it as `repository`, the app
shows that repo's commits in the History panel next to revisions, and
`src` paths deep-link into it).

**Workspace** — `get_workspace_info` (key prefix + validity, workspace id,
reachability, counts, setup instructions when unconfigured), `set_api_key`
(validate and persist a key the user provides).

### Agent identity & history

Every write (`create_project`, `update_project`, `set_display`,
`auto_layout_project`) is recorded as a revision attributed to the agent —
`ARCHER_AGENT_NAME`, else the name the MCP client declares in the handshake
(e.g. `claude-code`). `create_project`/`update_project` accept a one-line
`summary`; the app's activity feed shows it next to the agent's name and
highlights the components the agent touched until the human reviews them.
`get_history` and `diff_project` expose the same history to agents (the diff
ignores layout moves — only architecture counts).

### Questions

`ask_question` attaches a thread to a component path. It appears as a badge
on that component in the canvas; the human answers inline (and can ask
agents questions the same way). `get_project` returns the open threads as
`open_questions` so agents see them at the start of every session.

### Drift

An agent compares each component (via its `src` path, or by searching the
repo) with the implementation and calls `report_drift` with one finding per
discrepancy: `missing`, `changed`, or `extra` (in the code but not in the
document; carries a suggested `name`/`src`). The report replaces the
previous one and an empty list means "in sync". Findings render as badges on
the canvas and in the editor's Drift panel; the human can add `extra`
findings to the document with one click.

## Guarantees

- **Writes are gated**: a document with errors (dangling connections, invalid
  payloads, duplicate ids…) is rejected with diagnostics; nothing is saved.
- **Human layouts survive agent edits**: agents write semantic source without
  a `layout` block; the server merges the stored positions back in.
- **Live canvas**: the app subscribes to Convex, so an agent's save re-renders
  any open browser tab immediately.

## Smoke test

```sh
ARCHER_API_KEY=<key> pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
```

Spawns the server over stdio and exercises all 27 tools against the live
backend, including the reject-invalid-write and layout-preservation
guarantees, agent attribution in history, the question round trip, drift
reporting, and API-key handling (`get_workspace_info` shows the key prefix; a
bogus `set_api_key` is rejected without touching the persisted key). Use a
throwaway key: the test creates and deletes its own project and custom type.
