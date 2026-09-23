# archerctl

The command-line tool for [Archer](https://archer.tombyrne.dev), an
architecture canvas that compiles to and from an agent-readable language
(`.arch` files). The package installs one binary, `archer`, which validates
and formats `.arch` files locally, scaffolds a project, syncs a file with a
workspace project, and relays the hosted Archer MCP server to stdio-only
clients.

```sh
npx archerctl login          # sign in with GitHub in your browser
npx archerctl init           # starter architecture.arch + .mcp.json entry
```

Or install it globally: `npm i -g archerctl`, then use `archer …`.

## Commands

| Command | What it does |
| --- | --- |
| `archer check [paths…]` | Validate files; with no paths, every `.arch` under `.` (skips `node_modules`, `.git`, `dist`, `.next`). `--json` for a machine-readable report, `--offline` to skip fetching workspace custom types. |
| `archer fmt [paths…]` | Rewrite files in canonical form. `--check` reports without writing, `--layout` also completes the `layout` block, `--drop-comments` formats files that have `#` comments (canonical form drops them). |
| `archer init [file]` | Write a starter `architecture.arch` (never overwrites) and add the hosted MCP server to `./.mcp.json` as `{ "type": "http", "url": "<app>/mcp" }` (merges; keeps an existing entry). `--title`, `--no-mcp`. |
| `archer guide` | Print the language specification. |
| `archer login` | Sign in with GitHub in the browser (MCP OAuth: dynamic client registration, PKCE, a `localhost` redirect). `--no-browser` only prints the URL (SSH, containers). Stores the session in `~/.archer/auth.json` (0600) and refreshes it as needed. |
| `archer logout` | Revoke and forget the stored session. |
| `archer workspace [id]` | List your workspaces (`*` marks the current one; `--json`), or switch to one. The current workspace is shared with your agents. |
| `archer list` | Projects in the current workspace (`--json`). |
| `archer push <file>` | Validate, then create the file's project, or update it if the file is already linked (or `--project <id>`). `-m <summary>` shows in the app's activity feed. Errors reject the write; canvas positions of surviving components are preserved. |
| `archer pull <file>` | Overwrite the file with the project's saved (canonical) source. Refuses if the file differs unless `--force`. |
| `archer mcp` | The hosted MCP server over stdio, for clients that can only launch local servers: relays every message to `/mcp` with your `archer login` session. |

`-` as a path reads stdin (`check`, `fmt`; `fmt -` writes to stdout).

**Exit codes.** `0` ok · `1` the documents have problems (errors, unformatted
under `--check`, rejected push) · `2` usage, IO or auth error.

**Auth.** There are no API keys. Every command that touches a workspace acts
as the signed-in user through the hosted MCP server. `check` and `fmt` need
no sign-in, so they work in CI:

```yaml
- run: npx -y archerctl check
- run: npx -y archerctl fmt --check
```

**Environment.** `ARCHER_APP_URL` — the Archer app to talk to (default:
`https://archer.tombyrne.dev`); the MCP server is `$ARCHER_APP_URL/mcp`.

The `.arch` language: [reference](https://archer.tombyrne.dev/language) and
[examples](https://archer.tombyrne.dev/language/examples).
