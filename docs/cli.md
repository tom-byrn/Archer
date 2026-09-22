# Archer CLI

`packages/cli` (npm: `archer-cli`, binary: `archer`) is the file-based way to
work with Archer: validate and format `.arch` files locally, scaffold a
project, sync a file with a workspace project, and run the MCP server. It is a
thin shell over the same code the MCP server uses (`@archer/lang`,
`@archer/mcp/backend`), so diagnostics and write gates are identical.

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
| `archer init [file]` | Write a starter `architecture.arch` (never overwrites) and add an `archer` entry to `./.mcp.json` (merges; keeps an existing entry). `--title`, `--key <k>` (same as `login`), `--no-mcp`. |
| `archer guide` | Print the language specification. |
| `archer login [key]` | Validate an API key and save it to `~/.archer/key` (0600). Without an argument it prompts, or reads stdin when piped. |
| `archer list` | Projects in the workspace (`--json`). |
| `archer push <file>` | Validate, then create the file's project — or update it if the file is already linked (or `--project <id>`). `-m <summary>` shows in the app's activity feed. Same gates as the MCP `create_project`/`update_project`: errors reject the write; canvas positions of surviving components are preserved. |
| `archer pull <file>` | Overwrite the file with the project's saved (canonical) source. Refuses if the file differs unless `--force`. |
| `archer mcp` | Run the MCP server over stdio (see `docs/mcp.md`). |

`-` as a path reads stdin (`check`, `fmt`; `fmt -` writes to stdout).

**Output.** `check` prints one diagnostic per line on stdout —
`path:line:col: error E101: message` — and a summary on stderr. Unknown types
are only warnings (W301), so checking offline or without a key never fails a
file that uses workspace custom types.

**Exit codes.** `0` ok · `1` the documents have problems (errors, unformatted
under `--check`, rejected push) · `2` usage, IO or auth error.

**Comments.** `#` comments are not part of the document model, so canonical
form drops them (the app behaves the same way). `fmt` therefore refuses to
rewrite a file containing comments unless you pass `--drop-comments`; `push`
never modifies the local file.

**Links.** `push`/`pull` record `file → project id` in `./archer.json`. Commit
it so teammates and CI push to the same project. The API key is never written
into the repo (`.mcp.json` has no key; the server reads `~/.archer/key` or
`ARCHER_API_KEY`).

### CI example

```yaml
- run: npx -y archer-cli check
- run: npx -y archer-cli fmt --check
```

## Environment

Same variables as the MCP server: `ARCHER_API_KEY`, `CONVEX_URL`,
`ARCHER_APP_URL`, `ARCHER_AGENT_NAME`. The **published** bundle defaults to the
hosted backend; running from the repo (`pnpm --filter archer-cli dev -- check`)
defaults to local dev, like the MCP server.

## Building & publishing

```sh
pnpm --filter archer-cli build
cd packages/cli && pnpm publish        # prepublishOnly rebuilds
```

`tsup` inlines the private workspace packages (`@archer/lang`,
`@archer/catalog`, `@archer/mcp`) into `dist/`; real npm dependencies stay
external. The build bakes in the default backend
(`ARCHER_DEFAULT_CONVEX_URL`, default: the production Convex deployment) and
app URL (`ARCHER_DEFAULT_APP_URL`, default: `https://archer.tombyrne.dev`);
set either variable at build time to target another deployment. Bump `version` in
`packages/cli/package.json` per release. Tests: `pnpm --filter archer-cli test`
(spawns the real CLI in temp directories).
