# Archer CLI

`archer` works with Archer documents from the command line. It checks and
formats `.arch` files, keeps a file in sync with a project in your workspace,
and runs the [MCP server](mcp.md) for agents that can only start local
servers. The npm package is called `archerctl`.

`check` and `fmt` need no account, so they fit CI and pre-commit hooks.
Commands that touch a workspace (`push`, `pull`, `list`, `render`, `workspace`, `mcp`)
sign in the same way agents do and act as you.

The CLI and the MCP server share their code. `archer check` finds the same
problems as the MCP tool `validate_source`, and `archer push` saves through
`create_project` and `update_project`, with the same validation.

## Install

Archer needs Node.js 20 or later. Run it without installing:

```sh
npx archerctl check
```

Or install it once and use the `archer` command:

```sh
npm install -g archerctl
archer --version
```

The examples on this page use `archer`. With `npx`, write `npx archerctl`
in its place.

## Quick start

```sh
archer init                     # architecture.arch, plus the MCP server in .mcp.json
archer check                    # validate every .arch file under this directory
archer login                    # sign in with GitHub in your browser
archer push architecture.arch   # create the project in your workspace
```

`push` prints the editor link. Once a file has been pushed, `push` updates the
same project and `pull` brings the canvas's changes back:

```sh
archer push architecture.arch -m "Split the API into two services"
archer pull architecture.arch --force
```

## Commands

`archer --help` prints a summary of all of them. Options can go before or
after the command.

### `archer check`

```
archer check [paths…] [--json] [--offline]
```

Validates documents and prints every problem. With no paths it checks every
`.arch` file under the current directory, skipping `node_modules`, `.git`,
`dist` and `.next`. A directory is searched the same way, and a file is
checked whatever its extension. `-` reads a document from stdin.

```console
$ archer check
bad.arch:2:1: warning W301: Unknown type '@my.thing' on 'a' — rendering as a generic component.
bad.arch:3:1: error E002: Duplicate component id 'a' in the top level.
bad.arch:4:1: error E101: Connection target 'ghost' does not resolve to a declared component.
FAILED — 2 files, 2 errors, 1 warning
```

Each problem is one line on stdout,
`<file>:<line>:<column>: <severity> <code>: <message>`, followed by a summary
on stderr. Only errors fail the check: it exits `1` when any file has one, and
`0` when there are only warnings. The codes are listed in the
[language reference](language-spec.md#8-validation).

| Option | Description |
| --- | --- |
| `--json` | Print a machine-readable report instead (see [Output formats](#output-formats)). |
| `--offline` | Don't fetch the current workspace's custom types. |

Signed in, `check` first fetches the custom types of your current workspace,
so `@custom.*` tags validate cleanly. Signed out, with `--offline`, or when
the request fails, it checks against the built-in catalog only. An unknown
type is just a warning (`W301`), so this never turns a passing file into a
failing one.

### `archer fmt`

```
archer fmt [paths…] [--check] [--layout] [--drop-comments]
```

Rewrites documents in canonical form: the form the app saves, with sections
in a fixed order, connections sorted and indentation normalized. Paths work as
for `check`. It prints `<file>: formatted` for each file it changes and
nothing for files that are already canonical.

| Option | Description |
| --- | --- |
| `--check` | Change nothing. Print `<file>: not formatted` for each file that would change, and exit `1` if there are any. |
| `--layout` | Also complete the `layout` block, giving every component without a position one from the auto-layout. |
| `--drop-comments` | Format files that contain `#` comments. |

A `#` comment isn't part of the document, so canonical form has no comments.
Rather than delete them silently, `fmt` refuses to rewrite a file that has
comments unless you pass `--drop-comments`. A `#` inside a string or a payload
isn't a comment.

`fmt` also refuses a file the parser rejects, with a syntax error (`E001`) or
a second `shape`, `icon` or `color` in one component (`E004`), because formatting it
would lose part of the file. Other errors, like an unresolved connection, don't stop it.
Either refusal is printed on stderr and makes `fmt` exit `1`.

With `-` as the path, `fmt` reads stdin and writes the formatted document to
stdout:

```sh
archer fmt - < draft.arch > architecture.arch
```

### `archer init`

```
archer init [file] [--title <title>] [--no-mcp]
```

Starts a project in the current directory:

- Writes a starter document to `architecture.arch`, or to `file`, which must
  end in `.arch`. The starter is valid, canonical, and uses each construct
  once. An existing file is never overwritten.
- Adds the hosted MCP server to `.mcp.json` as `archer` (see
  [Files](#mcpjson)), so agents that read that file find it. Other servers in
  the file are kept, and so is an existing `archer` entry. `--no-mcp` skips
  this step.

The document's title is `--title`, or the directory's name in title case
(`my-shop` becomes `My Shop`).

```console
$ archer init --title "My Shop"
architecture.arch: created
.mcp.json: created (MCP server "archer" → https://tryarcher.dev/mcp)

Next:
  archer check             validate every .arch file here (exit 1 on errors; --json for machines)
  archer guide             the language specification
  archer login             sign in with GitHub (in the browser), then: archer push architecture.arch
```

### `archer guide`

```
archer guide
```

Prints the Archer [language specification](https://tryarcher.dev/language)
as markdown. Hand it to an agent that has a shell but no MCP client:
`archer guide > ARCHER.md`.

### `archer login`

```
archer login [--no-browser]
```

Signs you in with GitHub, in the browser. This is the standard MCP sign-in,
the same one an agent goes through when it connects to the server: the CLI
registers itself as "Archer CLI", opens the consent page, and receives the
result on a `localhost` address it listens on for the next five minutes.

```console
$ archer login
Sign in to https://tryarcher.dev in your browser:
  https://…/oauth/authorize?response_type=code&client_id=…
Signed in to tryarcher.dev — workspace Personal (owner)
```

The sign-in page opens in your default browser, and its address is printed
too in case it doesn't. `--no-browser` only prints it. The browser has to be
able to reach `localhost` on the machine running `archer`: see
[Signing in on a remote machine](#signing-in-on-a-remote-machine).

The session is saved in `~/.archer/auth.json` and renewed automatically. A
new `login` replaces it. What the CLI saves appears in the project's history
as "Archer CLI".

### `archer logout`

```
archer logout
```

Revokes the session and deletes it from `~/.archer/auth.json`. Prints
`Signed out of <app>`, or `Not signed in.` if there was no session.

### `archer workspace`

```
archer workspace [id] [--json]
```

With no `id`, lists your workspaces: Personal first, then the teams you
belong to, with your role in each. `*` marks the current one, which `push`,
`pull` and `list` act on.

```console
$ archer workspace
* user_2wKx9TqLm4RbVc7NpZ3hJd8sFyA  Personal  owner
  jn7dt5pzq1b3wk8m2c9x4v6hre0fs7ya  Acme  editor
$ archer workspace jn7dt5pzq1b3wk8m2c9x4v6hre0fs7ya
Now using Acme (editor) — 4 projects.
```

With an `id`, it switches. The current workspace is stored with your account,
not on this machine: switching here also switches every agent you've
connected, and switching in an agent (the MCP tool `use_workspace`) switches
the CLI. As a viewer you can `pull` and `list`, but `push` is refused.

### `archer list`

```
archer list [--json]
```

Lists the projects in the current workspace, most recently updated first:
one `<id>  <title>` line each.

```console
$ archer list
k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5  Shop
k1792cxn5wm0fq8hq6dhz4v3sr7b2eay  Link Shortener
```

### `archer push`

```
archer push <file> [--project <id>] [-m <summary>]
```

Saves a file to your workspace. The first push of a file creates a project
and records the link in `archer.json`. After that, `push` updates the linked
project. `--project` updates a particular project instead, and links the file
to it.

```console
$ archer push shop.arch -m "First cut"
Created "Shop" — https://tryarcher.dev/documents/k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5
$ archer push shop.arch -m "Add a cache"
Updated "Shop" — https://tryarcher.dev/documents/k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5
```

The file is checked first. If it has errors, nothing is saved:

```console
$ archer push bad.arch
bad.arch:3:1: error E101: Connection target 'ghost' does not resolve to a declared component.
REJECTED — nothing was saved. Fix the errors and push again.
```

Warnings are printed but don't stop the push.

| Option | Description |
| --- | --- |
| `--project <id>` | The project to update (ids come from `archer list`). |
| `-m`, `--message <summary>` | One line for the project's history, next to "Archer CLI". A first push without one reads "Created the project". |

The project is saved in canonical form and laid out, and the file on disk is
left as you wrote it. Components that already exist keep their places on the
canvas, and new ones are placed automatically. If the file has a `layout`
block, its positions win over the canvas's: see
[Round trips with the canvas](#round-trips-with-the-canvas).

A project stored in a repository file is different: the file in the
repository is the source of truth, and `push` only updates the project's
unpublished draft (it says so). See
[Projects stored in a repository](#projects-stored-in-a-repository).

### `archer pull`

```
archer pull <file> [--project <id>] [--force]
```

Writes the project's saved document to the file, and links the file to the
project. Without `--project`, it pulls the project the file is linked to.
Pulling into a new file needs `--project`:

```sh
archer pull shop.arch --project k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5
```

If the file already exists and differs from the project, `pull` stops without
changing it. `--force` overwrites it. The pulled document is canonical and
ends with the `layout` block from the canvas, except for a project stored in a
repository file: that one is pulled without its `layout` block, exactly as the
app publishes it, so the result is ready to commit.

```console
$ archer pull shop.arch
archer: shop.arch differs from the project — pass --force to overwrite it.
$ archer pull shop.arch --force
shop.arch: pulled "Shop"
```

### `archer render`

```
archer render [file] [--project <id>] [--component <path>] [--theme <light|dark>] [-o, --out <file.svg>]
```

Draws one of a project's canvases as an SVG: the same picture as its share
link's image, drawn by the MCP tool `render_project`, so the project doesn't
need a share link and a viewer can render it too. Without `--project`, it
draws the project the file is linked to. The SVG goes to stdout unless
`--out` names a `.svg` file.

```console
$ archer render shop.arch -o docs/architecture.svg
docs/architecture.svg: rendered the top level
$ archer render shop.arch --component backend --theme dark -o docs/backend.svg
docs/backend.svg: rendered the inside of backend
```

| Option | Description |
| --- | --- |
| `--project <id>` | The project to draw, instead of the one the file is linked to. |
| `--component <path>` | Draw the inside of this component instead of the top level: its path, dot-separated ids (`backend.api`). The canvas is titled with the components it's in, and the outside components its parts connect to are drawn dashed at the sides. A share link takes the same path as `?component=`. |
| `--theme <light\|dark>` | The palette (default `light`). |
| `-o`, `--out <file.svg>` | Write the image to this file instead of stdout. |

A path that names no component is an error (exit 2), as is a missing project.

### `archer mcp`

```
archer mcp
```

Runs the Archer MCP server over stdio, for MCP clients that can only start
local servers. It passes every message on to the hosted server using your
`archer login` session, so the tools are exactly the hosted ones and nothing
runs locally. Register it with your client as the command `archer mcp` (or
`npx -y archerctl mcp`); the [MCP docs](mcp.md#clients-that-only-run-local-servers)
have examples.

stdout carries the protocol, and log messages go to stderr. When you're not
signed in, every request is answered with an error that says to run
`archer login`. The relay reads your session for each request, so once you
sign in, from any terminal, the next request works; reconnect the server in
your client if it gave up. The relay runs until the client closes its input.

### Global options

| Option | Description |
| --- | --- |
| `-h`, `--help` | Print usage, including the app the CLI talks to. `archer help` does the same. |
| `-v`, `--version` | Print the version. |

## Files

### `archer.json`

Links between local files and projects, written by `push` and `pull` in the
directory you run them from:

```json
{
  "projects": {
    "architecture.arch": "k57bmtyf4pmj3fmrbrz9hq7qwn6ypcp5"
  }
}
```

Paths are relative to that directory, so run `archer` from the same place
(usually the repository root). Commit the file so your teammates push to the
same projects. It holds only ids, never credentials. A link only works in the
workspace its project belongs to, so a team project needs everyone on the
team's workspace (`archer workspace <id>`).

### `.mcp.json`

`archer init` registers the hosted MCP server in the project's `.mcp.json`,
the file Claude Code and other MCP clients read:

```json
{
  "mcpServers": {
    "archer": {
      "type": "http",
      "url": "https://tryarcher.dev/mcp"
    }
  }
}
```

It holds no credentials either. Each person, and each agent, signs in for
themselves the first time they connect.

### `~/.archer/auth.json`

Your sign-in, one entry per server: the CLI's client registration, the
tokens, and the server's sign-in settings. Only you can read it (mode `0600`,
in a `0700` directory). It is only ever sent to the server it came from.
`logout` deletes the tokens and keeps the registration for the next `login`.

## Output formats

**Diagnostics.** `check` and `push` print one line per problem:

```
architecture.arch:4:1: error E101: Connection target 'ghost' does not resolve to a declared component.
```

The line and column are left out when a problem has no position. Documents
read from stdin are named `<stdin>`.

**`check --json`** prints one report for all the files:

```json
{
  "valid": false,
  "files": [
    {
      "file": "bad.arch",
      "valid": false,
      "errors": [
        {
          "code": "E101",
          "severity": "error",
          "message": "Connection target 'ghost' does not resolve to a declared component.",
          "line": 4,
          "col": 1
        }
      ],
      "warnings": []
    }
  ]
}
```

`valid` is false when any file has an error. `line` and `col` are only
present when the problem has a position. The exit code is the same as
without `--json`.

**`list --json`** prints the projects as `[{ "id", "title", "updated" }]`,
with `updated` as an ISO timestamp. **`workspace --json`** prints
`[{ "id", "name", "kind", "role", "current" }]`, where `kind` is `personal`
or `team` and `role` is `owner`, `editor` or `viewer`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | The documents have problems: `check` found errors, `fmt --check` found unformatted files, `fmt` refused a file, or `push` was rejected. |
| `2` | The command couldn't run: a usage mistake, a missing file, no `.arch` files found, an invalid `archer.json` or `.mcp.json`, not signed in, a network failure, or an error from the server (no such project, not a member of the workspace, a viewer pushing). The reason is printed on stderr, after `archer:`. |

## Environment

| Variable | Description |
| --- | --- |
| `ARCHER_APP_URL` | The Archer app to use. Defaults to `https://tryarcher.dev`. The MCP server is `$ARCHER_APP_URL/mcp`, and sign-ins are kept per server, so a different app needs its own `archer login`. `archer --help` shows the current value. |

Point it at another deployment, or at a local development server:

```sh
ARCHER_APP_URL=http://localhost:3000 archer login
```

## Recipes

### Check documents in CI

`check` and `fmt` need no sign-in. In GitHub Actions:

```yaml
name: Architecture
on: [push, pull_request]
jobs:
  archer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y archerctl check
      - run: npx -y archerctl fmt --check
```

Drop the `fmt --check` step if you don't keep files in canonical form.
Documents pulled from the app always are. `push` needs a person's sign-in, so
it doesn't belong in CI.

### Check before each commit

A Git `pre-commit` hook that checks the staged `.arch` files:

```sh
#!/bin/sh
files=$(git diff --cached --name-only --diff-filter=ACM -- '*.arch')
[ -z "$files" ] || npx -y archerctl check $files
```

### Round trips with the canvas

A file and its project can both change: you edit the file, and people and
agents edit the project on the canvas. `push` sends your file, and
`pull --force` takes the project's version. Neither merges, so pull before
you edit when the canvas may have changed.

Positions work differently. `push` keeps the canvas's positions for every
component that already exists, unless your file has a `layout` block: the
block's positions replace the canvas's. A pulled file ends with a `layout`
block, so pushing it later puts the components back where they were when you
pulled. To send only the architecture, delete the `layout` block before
pushing.

### Projects stored in a repository

A project can instead be stored in a `.arch` file in its GitHub repository
(created *From GitHub* in the app, or moved there with *Move to GitHub*).
That file, on its branch, is the source of truth: edit it and commit it with
the code it describes, and gate it with the CI steps above. The canvas
follows the branch, and edits made on the canvas come back to the repository
as pull requests. There's nothing to push: `push` to such a project only
updates its unpublished draft, and `pull` writes the architecture without
the `layout` block, ready to commit.

### Agents with a shell but no MCP

An agent can use Archer through the CLI alone. It learns the language from
`archer guide`, writes the document, and checks it with `archer check --json`
until the report is clean. You then `archer push` it, or the agent does, with
your sign-in.

### Team projects

Switch to the team's workspace, then push:

```sh
archer workspace                 # find the team's id
archer workspace jn7dt5pzq1b3wk8m2c9x4v6hre0fs7ya
archer push architecture.arch -m "Initial architecture"
```

Commit `archer.json`. Teammates switch to the same workspace, then pull and
push the same project.

## Troubleshooting

**`Not signed in to … Run: archer login`.** You haven't signed in to this
app, or the session expired or was revoked. Run `archer login`. The message
names the app: sessions are per `ARCHER_APP_URL`.

**The browser didn't open.** Open the address `login` printed.

**`Timed out waiting for the browser sign-in.`** `login` waits five minutes
for the browser. Run it again.

**`No project with id … in the current workspace`.** The project is in
another workspace, or was deleted. Check `archer workspace` and
`archer list`. If the project is gone, remove its line from `archer.json` and
push to create a new one.

**`… differs from the project — pass --force to overwrite it.`** The file and
the project differ. That includes a hand-written file that is merely not in
canonical form. `--force` replaces the file with the project's version.

**`… has # comments, which formatting removes`.** Pass `--drop-comments`, or
put the notes in `desc` or a `markdown` payload, which are part of the
document.

**`This needs editor access; you are a viewer.`** You're a viewer in the
current workspace. Ask an owner to make you an editor, or push to a workspace
of your own.

**`check` is slow without a network.** Signed in, `check` asks the server
for your custom types, and waits up to 30 seconds before giving up. Pass
`--offline`.

### Signing in on a remote machine

`archer login` listens for the browser on `localhost`, on the machine where
it runs. Over SSH or in a container, your browser can't reach that address:
after you approve, it shows a connection error. Copy the address from the
browser's address bar (it starts with `http://localhost:`), and while `login`
is still waiting, open it on the machine running `archer`:

```sh
curl 'http://localhost:43411/callback?code=…&state=…'
```

`login` then finishes as usual. Alternatively, forward the port before
approving: its number is in the printed address's `redirect_uri`.

<!-- site:end — the docs site (/docs/cli) renders this file up to here. -->

## Development

The CLI is `packages/cli`, written in TypeScript and bundled with tsup.

| Module | |
| --- | --- |
| `src/cli.ts` | Argument parsing, help, dispatch, exit codes. |
| `src/commands.ts` | The commands. |
| `src/auth.ts` | Sign-in: an MCP SDK `OAuthClientProvider` backed by `~/.archer/auth.json`, the loopback listener for `login`, `logout`, and `connect()`, which gives the commands a signed-in MCP client. |
| `src/tools.ts` | `callTool`: calls a hosted tool and parses its JSON result, throwing `ToolError` on error results. |
| `src/relay.ts` | `archer mcp`: stdio on one side, the hosted server on the other. |
| `src/config.ts` | The app and MCP URLs, the version, `~/.archer`. |
| `src/starter.ts` | The document `init` writes. |

The CLI validates with `@archer/mcp/analysis` and `@archer/lang`, the same
code the MCP server runs, and does everything else by calling the hosted
server's tools, signed in like any other MCP client. It never talks to
Convex. The JSON results it reads are typed in `packages/mcp/src/contract.ts`,
and the server builds them with `satisfies`, so changing one of those results
breaks the build rather than the CLI.

Run it from the repository with `pnpm --filter archerctl dev -- <command>`.
From the repository it talks to local development (`http://localhost:3000`)
unless `ARCHER_APP_URL` says otherwise.

### Tests

```sh
pnpm --filter archerctl test
```

- `test/cli.test.ts` runs the commands that need no account in temporary
  directories.
- `test/account.test.ts` runs the real CLI end to end against `test/host.ts`:
  a stand-in OAuth authorization server (discovery, registration, PKCE,
  refresh-token rotation, revocation) and an app whose `/mcp` serves the real
  hosted tools over a fake Convex. It covers `login`, `push`, `pull`,
  `workspace`, token refresh, `logout` and `archer mcp`.
- `test/docs.test.ts` checks that this file documents every command and
  option in `archer --help`.

### Building and publishing

```sh
pnpm --filter archerctl build
cd packages/cli && pnpm publish        # prepublishOnly builds again
```

tsup bundles `src/cli.ts` into `dist/cli.js` (ESM, Node 20). It inlines the
private workspace packages (`@archer/lang`, `@archer/catalog` and the parts
of `@archer/mcp` the CLI uses), while real npm dependencies stay external. The
build fixes two values: the version, from `package.json`, and the default
app, from `ARCHER_DEFAULT_APP_URL` (default `https://tryarcher.dev`).
Set that variable at build time to target another deployment. Bump `version`
in `packages/cli/package.json` for each release, and keep
`packages/cli/README.md`, the npm page, in step with this file.
