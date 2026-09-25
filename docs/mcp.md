# Archer MCP Server

`packages/mcp` exposes everything a human can do in the Archer app to AI
agents over the Model Context Protocol: browse/create/edit/delete projects,
design architectures in the Archer language (with the same validation gates
the app enforces), manage the custom component-type library, control canvas
presentation, and compile agent-ready implementation specs.

## Setup

The Archer app serves this MCP server over HTTP at `/mcp`, authenticated with
MCP-standard OAuth — no API key, nothing to install:

```sh
claude mcp add --transport http archer https://archer.tombyrne.dev/mcp
```

Then authorize when prompted (in Claude Code: run `/mcp`, pick `archer`,
and approve in the browser). You sign in to Archer with GitHub and the agent
acts as you. Other MCP clients: add a remote / streamable-HTTP server with that
URL; they discover the OAuth endpoints on their own. `archer init` (see
`docs/cli.md`) writes the same server into a project's `.mcp.json` as
`{ "type": "http", "url": "…/mcp" }`.

**Clients that only launch local (stdio) servers**: sign in once with the CLI
(`npx archerctl login`), then register `npx -y archerctl mcp` as the
server. It relays stdio to the hosted server using that sign-in, so the tools
are identical — and there is still no key.

Because you may belong to several workspaces, project tools operate on the
current workspace (Personal by default, remembered per user): see
`list_workspaces` and `use_workspace`.

There are no API keys: every caller is a signed-in user. The route verifies
the OAuth token (Clerk is the authorization server) and the tools reach
Convex with a server-only service credential for that user — see
`apps/web/app/mcp/route.ts` and `apps/web/convex/access.ts`. Local
development works the same way against `http://localhost:3000/mcp`.

## Tools (24)

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

**Drift** — `report_drift`, `get_drift`.

**Repository** — `link_repository` (record the GitHub repo + branch a
project describes; `get_project` then returns it as `repository`, the app
shows that repo's commits in the History panel next to revisions, and
`src` paths deep-link into it). A project can also be *stored in* a `.arch`
file in its repository (created From GitHub, or moved there in the app —
see `docs/repo-sync.md`): `get_project` then returns `repository.path` and
its `sync` state, and tells agents working in that repository to edit the
file instead. `update_project` still works on such a project but only
changes its unpublished draft (the result's `note` says so); a human
publishes drafts to the repository as pull requests.

**Workspace** — `get_workspace_info` (the signed-in user, current workspace
and role, reachability, counts), `list_workspaces` (Personal + team workspaces
with roles, current one marked) and `use_workspace` (switch; remembered per
user, for every agent and the CLI).

### Agent identity & history

Every write (`create_project`, `update_project`, `set_display`,
`auto_layout_project`) is recorded as a revision attributed to the agent —
the name of the OAuth client that connected (e.g. "Claude Code", or "Archer
CLI" for the CLI and `archer mcp`). `create_project`/`update_project` accept
a one-line `summary`; the app's activity feed shows it next to the agent's name and
highlights the components the agent touched until the human reviews them.
`get_history` and `diff_project` expose the same history to agents (the diff
ignores layout moves — only architecture counts).

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

## Smoke tests

Both run the tools in-process exactly as `/mcp` does — as a signed-in user,
reaching Convex with the service credential — so they need that deployment's
`ARCHER_SERVICE_SECRET` and a real user id (use a dev deployment):

```sh
ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> SMOKE_USER_ID=user_… \
  pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> REMOTE_CHECK_USER_ID=user_… \
  pnpm --filter @archer/mcp exec tsx scripts/remote-check.ts
```

`smoke.ts` exercises every tool group against the live backend, including the
reject-invalid-write and layout-preservation guarantees, agent attribution in
history, and drift reporting; it creates and deletes its own project and
custom type. `remote-check.ts` is read-only: tool list, identity, workspaces,
and that calls without a verified user are refused.

The CLI's end-to-end tests (`pnpm --filter archerctl test`) also run the real
tools, behind a stand-in OAuth server and a fake Convex — no setup needed.
