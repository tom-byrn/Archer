# Archer CLI

`packages/cli` (npm: `archer-cli`, binary: `archer`) is the file-based way to
work with Archer: validate and format `.arch` files locally, scaffold a
project, sync a file with a workspace project, and bridge stdio-only MCP
clients. It validates with the same code the MCP server uses
(`@archer/lang`, `@archer/mcp/analysis`), and everything that touches a
workspace goes through the hosted MCP server's tools — so diagnostics and
write gates are identical.

When to use which: **MCP** for agents working conversationally against a
workspace (history, drift, custom types). **CLI** for anything
file-shaped — CI gates, pre-commit hooks, scripts, and agents that have a shell
but no MCP client. `archer check file.arch` also avoids round-tripping a large
document through a tool-call argument.

```sh
npx archer-cli init          # or: npm i -g archer-cli  →  archer init
```

## Commands

| Command | What it does |
| --- | --- |
| `archer check [paths…]` | Validate files; with no paths, every `.arch` under `.` (skips `node_modules`, `.git`, `dist`, `.next`). `--json` for a machine-readable report, `--offline` to skip fetching workspace custom types. |
| `archer fmt [paths…]` | Rewrite files in canonical form. `--check` reports without writing, `--layout` also completes the `layout` block, `--drop-comments` see below. |
| `archer init [file]` | Write a starter `architecture.arch` (never overwrites) and add the hosted MCP server to `./.mcp.json` as `{ "type": "http", "url": "<app>/mcp" }` (merges; keeps an existing entry). `--title`, `--no-mcp`. |
| `archer guide` | Print the language specification. |
| `archer login` | Sign in with GitHub in the browser — the same MCP OAuth flow an agent runs against `/mcp` (dynamic client registration, PKCE, a `localhost` redirect). Prints the URL too; `--no-browser` only prints it (SSH, containers). Stores the session in `~/.archer/auth.json` (0600) and refreshes it as needed. |
| `archer logout` | Revoke and forget the stored session. |
| `archer workspace [id]` | List your workspaces (`*` marks the current one; `--json`), or switch to one. The current workspace is shared with your agents (it's the MCP `use_workspace` choice). |
| `archer list` | Projects in the current workspace (`--json`). |
| `archer push <file>` | Validate, then create the file's project — or update it if the file is already linked (or `--project <id>`). `-m <summary>` shows in the app's activity feed. Same gates as the MCP `create_project`/`update_project` (it calls them): errors reject the write; canvas positions of surviving components are preserved. Saves are attributed to "Archer CLI". |
| `archer pull <file>` | Overwrite the file with the project's saved (canonical) source. Refuses if the file differs unless `--force`. |
| `archer mcp` | The hosted MCP server over stdio, for clients that can only launch local servers: relays every message to `/mcp` with your `archer login` session (see `docs/mcp.md`). |

`-` as a path reads stdin (`check`, `fmt`; `fmt -` writes to stdout).

**Output.** `check` prints one diagnostic per line on stdout —
`path:line:col: error E101: message` — and a summary on stderr. Signed in, it
also knows the current workspace's custom types. Unknown types are only
warnings (W301), so checking offline or signed out never fails a file that
uses workspace custom types.

**Exit codes.** `0` ok · `1` the documents have problems (errors, unformatted
under `--check`, rejected push) · `2` usage, IO or auth error.

**Comments.** `#` comments are not part of the document model, so canonical
form drops them (the app behaves the same way). `fmt` therefore refuses to
rewrite a file containing comments unless you pass `--drop-comments`; `push`
never modifies the local file.

**Links.** `push`/`pull` record `file → project id` in `./archer.json`. Commit
it so teammates push to the same project (team members switch to the team
workspace first: `archer workspace <id>`). No credential is ever written into
the repo: `.mcp.json` names only the server URL, and each person or agent
signs in for themselves.

**Auth.** There are no API keys. Every command that touches a workspace acts
as the signed-in user through the hosted MCP server; nothing else talks to
the backend. Signed out, those commands exit 2 with `Not signed in … Run:
archer login`, without contacting the server. `login` also deletes a
`~/.archer/key` left by older versions.

### CI example

`check` and `fmt` need no sign-in:

```yaml
- run: npx -y archer-cli check
- run: npx -y archer-cli fmt --check
```

`push` needs a person's sign-in, so it isn't a CI step: there is no
non-interactive credential any more.

## Environment

`ARCHER_APP_URL` — the Archer app to talk to; the MCP server is
`$ARCHER_APP_URL/mcp`. The **published** bundle defaults to the hosted app;
running from the repo (`pnpm --filter archer-cli dev -- check`) defaults to
local dev (`http://localhost:3000`). Sign-ins are kept per server URL.

## Building & publishing

```sh
pnpm --filter archer-cli build
cd packages/cli && pnpm publish        # prepublishOnly rebuilds
```

`tsup` inlines the private workspace packages (`@archer/lang`,
`@archer/catalog`, and the Convex-free parts of `@archer/mcp`) into `dist/`;
real npm dependencies stay external. The build bakes in the default app URL
(`ARCHER_DEFAULT_APP_URL`, default: `https://archer.tombyrne.dev`); set it at
build time to target another deployment. Bump `version` in
`packages/cli/package.json` per release. Tests: `pnpm --filter archer-cli test`
spawns the real CLI in temp directories; `test/account.test.ts` signs it in
end to end against a stand-in OAuth server whose `/mcp` runs the real hosted
tools over a fake Convex (`test/host.ts`).
