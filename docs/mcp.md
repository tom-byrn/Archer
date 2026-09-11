# Archer MCP Server

`packages/mcp` exposes everything a human can do in the Archer app to AI
agents over the Model Context Protocol: browse/create/edit/delete projects,
design architectures in the Archer language (with the same validation gates
the app enforces), manage the custom component-type library, control canvas
presentation, and compile agent-ready implementation specs.

## Setup

Prerequisites: the Convex backend running (`npx convex dev` in `apps/web`) and
`pnpm install` done at the repo root.

1. **Get your workspace id** — open Archer (http://localhost:3000) and copy it
   from the footer of the home page. This scopes the server to the same
   projects your browser sees.
2. **Register the server** with your MCP client. For Claude Code:

   ```sh
   claude mcp add archer \
     --env ARCHER_WORKSPACE_ID=<your-workspace-id> \
     -- pnpm --dir <absolute-path-to-repo>/packages/mcp start
   ```

   Alternatively skip the env var and, in your first session, ask the agent to
   call `set_workspace` with the id — it persists to `~/.archer/workspace`.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARCHER_WORKSPACE_ID` | `~/.archer/workspace` file, else unset | Which workspace's projects the server operates on |
| `CONVEX_URL` | `http://127.0.0.1:3210` | The Convex backend |
| `ARCHER_APP_URL` | `http://localhost:3000` | Base for the editor URLs returned by tools |

## Tools (17)

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

**Workspace** — `get_workspace_info` (config + reachability + counts),
`set_workspace` (persist an id the user provides).

## Guarantees

- **Writes are gated**: a document with errors (dangling connections, invalid
  payloads, duplicate ids…) is rejected with diagnostics; nothing is saved.
- **Human layouts survive agent edits**: agents write semantic source without
  a `layout` block; the server merges the stored positions back in.
- **Live canvas**: the app subscribes to Convex, so an agent's save re-renders
  any open browser tab immediately.

## Smoke test

```sh
ARCHER_WORKSPACE_ID=<id> pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
```

Spawns the server over stdio and exercises all 17 tools against the live
backend (24 checks), including the reject-invalid-write and layout-preservation
guarantees.
