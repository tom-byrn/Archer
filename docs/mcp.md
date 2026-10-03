# Archer MCP server

Archer's MCP server lets an AI agent do what you do in the app: read and
write architecture documents, manage your component types, review history,
and record whether the code still matches the design. It works with any
client that speaks the [Model Context Protocol](https://modelcontextprotocol.io):
Claude Code, Claude, Cursor, VS Code, Codex and more.

- **Address:** `https://tryarcher.dev/mcp` (Streamable HTTP)
- **Sign-in:** in your browser, with GitHub. There are no API keys to create
  or paste.
- **Tools:** 26, covering projects, the language, component types, the
  canvas, history, drift and workspaces. See the
  [tool reference](#tool-reference).

The agent acts as you, in the workspaces you belong to, with your role in
each. Everything it saves is checked the same way as the canvas and recorded
in the project's history under the agent's name.

## Connect an agent

Add the server to your client, then sign in when it asks. Signed in to the
app, **Connect an agent** in the account menu shows the same commands for
the deployment you're using.

### Claude Code

```sh
claude mcp add --transport http archer https://tryarcher.dev/mcp
```

Then run `/mcp` in Claude Code, choose `archer`, and pick **Authenticate**.
Your browser opens to sign in to Archer.

The server is added for the current project, for you only. `--scope user`
adds it for all your projects. `--scope project` writes it to the project's
`.mcp.json` instead, to share with your team (see
[Set up a repository](#set-up-a-repository)). Claude Code's
[MCP documentation](https://code.claude.com/docs/en/mcp) has more options.

### Claude (web and desktop)

Add Archer as a custom connector: in Claude, go to **Customize → Connectors**,
choose **Add custom connector**, and paste
`https://tryarcher.dev/mcp`. Then **Connect** and sign in. Archer needs
no OAuth client ID or secret: if Claude asks how to register, choose automatic
registration. On Team and Enterprise plans an owner adds the connector for the
organization first. See
[Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Cursor

Add the server to `.cursor/mcp.json` in your project, or to
`~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "archer": {
      "url": "https://tryarcher.dev/mcp"
    }
  }
}
```

Then connect `archer` in Cursor's MCP settings and sign in.

### VS Code

For GitHub Copilot's agent mode, add the server to `.vscode/mcp.json`, or run
**MCP: Add Server** from the Command Palette:

```json
{
  "servers": {
    "archer": {
      "type": "http",
      "url": "https://tryarcher.dev/mcp"
    }
  }
}
```

VS Code opens the browser to sign in the first time the server starts. See
[MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

### Codex

```sh
codex mcp add archer --url https://tryarcher.dev/mcp
```

Codex detects the sign-in and opens the browser. To sign in again later, run
`codex mcp login archer`. See [Codex MCP](https://developers.openai.com/codex/mcp).

### Gemini CLI

```sh
gemini mcp add --transport http archer https://tryarcher.dev/mcp
```

Then run `/mcp auth archer` in Gemini CLI to sign in. See
[MCP servers with Gemini CLI](https://geminicli.com/docs/tools/mcp-server/).

### Other clients

Add a remote MCP server that uses the **Streamable HTTP** transport, at
`https://tryarcher.dev/mcp`. Don't configure headers or keys: the
client finds the sign-in on its own, registers itself, and opens your
browser. The details are under [Protocol](#protocol).

### Clients that only run local servers

Some clients can only start a server as a local command (stdio). For those,
the [Archer CLI](cli.md) relays the hosted server. Sign in once:

```sh
npx archerctl login
```

Then register the command `npx -y archerctl mcp`. For example, in Claude
Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "archer": {
      "command": "npx",
      "args": ["-y", "archerctl", "mcp"]
    }
  }
}
```

The relay passes every message to the hosted server with the CLI's sign-in,
so the tools are identical. Saves are attributed to "Archer CLI". Until you
sign in, the relay answers every request with an error telling you to run
`archer login`; after that, reconnect the server in your client.

### Set up a repository

A project's `.mcp.json` tells Claude Code (and other clients that read it)
which servers the project uses. The [CLI](cli.md#archer-init) writes the
Archer entry for you, along with a starter document:

```sh
npx archerctl init
```

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

The file names only the server. Commit it: each teammate, and each agent,
signs in for themselves the first time they connect.

### Other deployments

A self-hosted Archer, or a local development server, serves the same MCP
server at its own `/mcp`. Use that address instead, for example
`http://localhost:3000/mcp`.

## Sign-in and access

Connecting a client starts the standard MCP sign-in. The client registers
itself with Archer's sign-in service, your browser opens, you sign in to
Archer with GitHub and approve the client, and the client receives a token
it renews on its own. Nothing is copied by hand, and nothing secret is stored
in your project.

From then on the agent acts as you:

- It sees every workspace you belong to, and can do what your role allows in
  each. Owners and editors can use every tool. Viewers can use every tool
  that doesn't change the workspace; their writes are refused.
- Everything it saves is recorded in the project's history under the client's
  name, as registered at sign-in ("Claude Code", "Cursor", "Archer CLI"…),
  with the one-line summary the agent gives. The canvas highlights what an
  agent changed until you review it.
- Sharing links, workspace members and invitations, and PNG export stay in
  the app. Agents can draw a project as an SVG with `render_project`.

To disconnect an agent, remove the server from the client or clear its
sign-in there (in Claude Code, from `/mcp`).

### Workspaces

You have a Personal workspace, and you may belong to team workspaces. Project
tools act on one of them, the **current workspace**, which starts as
Personal. An agent switches with `use_workspace`, and the CLI with
`archer workspace`.

The current workspace is stored with your account, not in the client. When
one agent switches, every agent you've connected and the CLI switch with it.
That's why agents are told to switch only when you ask them to, and to say
which workspace they're working in.

## What agents do with it

A project is one Archer document, the same text you see in the editor's code
view. The canvas is drawn from it, so when an agent saves, open editors
update at once. The main things agents do:

- **Learn the language.** Agents are told to read the guide (`get_guide`)
  before they write anything. It holds the workflows, the error codes and the
  complete [language specification](https://tryarcher.dev/language).
  The [worked examples](https://tryarcher.dev/language/examples) are
  available too (`list_examples`, `get_example`).
- **Map a codebase.** The agent reads the repository and saves what it finds
  as a new project (`create_project`), with `src` paths that point back into
  the code.
- **Change a design.** The agent reads the project (`get_project`), edits the
  source and saves the whole document (`update_project`). Your arrangement of
  the canvas is kept.
- **Work in a repository-stored project.** A project can live in a `.arch`
  file in its GitHub repository (created *From GitHub* in the app, or moved
  there with *Move to GitHub*). `get_project` then returns the file as
  `repository.path`, with its sync state, and tells agents working in that
  repository to edit the file and commit it with the code. `update_project`
  still works, but only changes the project's unpublished draft (the result
  says so), which a person publishes back to the repository as a pull request.
- **Explain what changed.** `get_history` and `diff_project` show who changed
  what, and when. `get_revision` returns any past version, to compare or
  restore.
- **Hand off a spec.** `compile_for_agent` returns the document as an
  implementation spec for a coding agent. It's the same text as **Copy for
  agent** in the editor.
- **Check for drift.** The agent compares each component with the code and
  reports what's missing, changed or extra (`report_drift`). Findings appear
  as badges on the canvas, and you can add the extra parts to the document in
  one click.

Things to ask your agent:

- "Map this repository into a new Archer project."
- "Add a Redis cache in front of the orders database in the Shop project."
- "What changed in the Shop architecture since yesterday?"
- "Check the Shop project against this repository and report drift."
- "Implement the Shop project's API, following its spec."

### What the server guarantees

- **Nothing broken is saved.** A document with errors, such as a connection
  to a component that doesn't exist, is rejected with its diagnostics, and
  nothing changes. The agent fixes the errors and tries again.
- **Your layout survives.** Agents send the architecture without the
  `layout` block. Components you've placed keep their positions, and only new
  ones are placed automatically.
- **Every save is reviewable.** Each agent save is its own revision, with its
  author, time, summary and a count of what changed.

## Tool reference

<!-- tools:start -->

The reference for every tool, generated from the server's own code (its
parameters, an example call and the result), is on the docs site:
[tryarcher.dev/docs/mcp#tool-reference](https://tryarcher.dev/docs/mcp#tool-reference).
In this repository, `packages/mcp/src/server.ts` registers the tools and
`packages/mcp/src/reference.ts` holds the examples.

<!-- tools:end -->

## Results and errors

Tools answer with a single text item. Most results are JSON. `get_guide`,
`format_source`, `auto_layout_source`, `compile_for_agent` and
`render_project` answer with plain text: markdown, Archer source or SVG.

`create_project`, `update_project` and `validate_source` add `hints` when a
canvas (the top level, or the inside of a component) is too crowded to read
at a glance: more than 12 components, or more than 16 lines between them.
Each names the canvas and suggests nesting its parts. Hints never block a
save.

When a call fails, the result is marked as an error (`isError: true`) and its
text says why. Rejected writes answer with JSON that lists the problems:

```json
{
  "message": "REJECTED — fix these errors and retry.",
  "errors": ["E101 [error] line 4: Connection target 'payments' does not resolve to a declared component."],
  "warnings": []
}
```

Each diagnostic reads `<code> [<severity>] line <line>: <message>`. Errors
(`E…`) block a save, and warnings (`W…`) never do. The codes are listed under
[Validation](https://tryarcher.dev/language#8-validation) in the
language reference.

| Error | What it means |
| --- | --- |
| `REJECTED — …` | The document has errors. Nothing was saved. |
| `No project with id … Use list_projects.` | The project isn't in the current workspace, or was deleted. |
| `… This needs editor access; you are a viewer.` | Viewers can't save in this workspace. |
| `The user is not a member of workspace '…'` | `use_workspace` was given an id that isn't one of yours. The message lists the valid ones. |
| `Input validation error: …` | The arguments don't match the tool's parameters. |
| `Invalid findings — nothing recorded: …` | A drift finding has no valid `path`, or an `extra` has no `name`. |

## Protocol

For client developers and the curious:

- **Transport.** Streamable HTTP at `/mcp`, stateless: every JSON-RPC request
  is a `POST` answered with plain JSON. The server keeps no sessions and sends
  no notifications of its own. A request can run for up to 60 seconds. The
  server identifies itself as `archer`.
- **Authorization.** The standard MCP authorization flow, with Clerk as the
  authorization server:
  - `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728) names the
    authorization server and the scopes, `profile` and `email`.
    `/.well-known/oauth-authorization-server` (RFC 8414) serves the
    authorization server's metadata too, for clients that look there.
  - Clients register with dynamic client registration (RFC 7591) and sign in
    with the authorization code flow and PKCE (`S256`). The client name they
    register is the name their saves appear under.
  - Every request carries `Authorization: Bearer <access token>`. Without a
    valid token the server answers `401` with
    `WWW-Authenticate: Bearer error="invalid_token", error_description="…", resource_metadata="https://tryarcher.dev/.well-known/oauth-protected-resource/mcp"`,
    which is where clients discover all of the above.
- **CORS.** Any origin may call the server from a browser.
- **Resources.** Besides tools, the server offers the agent guide as
  `archer://guide` (markdown) and each worked example as
  `archer://examples/<slug>` (plain text).

## Troubleshooting

**The client says it needs authentication.** Start the sign-in from the
client: in Claude Code, `/mcp` → `archer` → **Authenticate**. If the browser
didn't open, the client usually shows the address to open yourself.

**The agent can't find a project.** It's probably in another workspace. Ask
the agent which workspace it's in, or have it call `list_workspaces` and
switch.

**The agent's saves are refused.** If the error says you're a viewer, ask a
workspace owner to make you an editor. If it starts with `REJECTED`, the
document has errors: the agent should fix what the diagnostics name and try
again, or check its work with `validate_source` first.

**Custom types show a `W301` warning.** The type belongs to another
workspace, or it was deleted. Warnings don't block anything.

**Agents keep working in the wrong workspace.** The current workspace is
shared by all your agents and the CLI. Switch back with `use_workspace` or
`archer workspace`.

<!-- site:end — the docs site (/docs/mcp) renders this file up to here. -->

## Development

The server's code is `packages/mcp`. The web app serves it at `/mcp`, and the
CLI calls it like any other client.

### How a request is served

1. `apps/web/app/mcp/route.ts` reads the bearer token and verifies it with
   Clerk (`auth({ acceptsToken: "oauth_token" })`, `verifyClerkToken`). It
   answers `401` with the discovery pointer when that fails. It also looks up
   the OAuth client's name, for attribution (best effort, cached per
   instance).
2. `handleRemoteRequest` (`src/remote.ts`) builds a fresh `McpServer` and a
   `WebStandardStreamableHTTPServerTransport` for the request (stateless, JSON
   responses), registers the tools, and passes the verified user and client
   name in `authInfo.extra`. The web app must not import
   `@modelcontextprotocol/sdk` itself: two copies of the SDK, one per zod
   peer, don't interoperate.
3. `wrap` (`src/server.ts`) runs each tool inside `requestContext`, an
   `AsyncLocalStorage` holding the user id, the agent's name and the service
   credential `svc_<ARCHER_SERVICE_SECRET>.<userId>`. It turns thrown errors
   into error results. Nothing about a caller is kept in module state: one
   serverless process serves many users.
4. Tools reach Convex through `db` (`src/backend.ts`), passing the service
   credential in the functions' `apiKey` argument (a legacy name).
   `apps/web/convex/access.ts` (`effectiveUser`) turns it back into the user, and
   `requireWorkspace` checks their role: viewer for queries, editor for
   document writes.
5. `create_project` and `update_project` save through `prepareWrite`
   (`src/backend.ts`). It validates with `src/analysis.ts`, the same code the
   CLI runs, against the catalog plus the workspace's custom types. Then it
   merges the layout (the sent `layout` entries first, stored positions for
   the components that survive, auto-layout for the rest) and formats the
   document canonically.

The current workspace lives in the `agentPrefs` table, keyed by user, so the
CLI and every agent share it.

### Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `ARCHER_SERVICE_SECRET` | The web app and the Convex deployment, same value, at least 32 characters. | Lets the route act for the verified user. Never leaves the server. |
| `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL` | The web app. | The Convex deployment the tools call. |
| `ARCHER_APP_URL`, `NEXT_PUBLIC_APP_URL` or `VERCEL_PROJECT_PRODUCTION_URL` | The web app. | The origin of links in results (`editor_url`, `docs_url`). Defaults to `http://localhost:3000`. |

Clerk needs dynamic client registration turned on. [`deploy.md`](deploy.md)
has the full setup.

### Adding or changing a tool

1. Register it in `registerArcherTools` (`src/server.ts`), inside `wrap`,
   with a title, a description written for agents, and a zod schema whose
   parameters each have a `.describe()`.
2. Document it in `src/reference.ts`: put it in a group in `TOOL_GROUPS` and
   give it a `TOOL_DOCS` entry with its access, an example call and the
   result. `test/reference.test.ts` fails until you do. It runs the example
   against the real tool over `test/fakeBackend.ts`, so extend the fake if the
   tool calls a new Convex function.
3. If the CLI reads its result, type the result in `src/contract.ts` and
   build it with `satisfies`.
4. Tell agents when to use it: the workflows and the capability map in
   `src/guide.ts`.
5. Update the tool count in `scripts/smoke.ts`, `scripts/remote-check.ts`,
   `packages/cli/test/account.test.ts`, this file and `CLAUDE.md`.

### Tests

```sh
pnpm --filter @archer/mcp test
```

These run the tools in-process with no deployment. `test/examples.test.ts`
covers the worked examples. `test/reference.test.ts` runs every documented
example over a fake backend seeded with the example scenario, and checks that
each result has the documented shape.

Two scripts run the tools in-process against a real deployment, exactly as
`/mcp` does: as a signed-in user, reaching Convex with the service credential.
They need that deployment's `ARCHER_SERVICE_SECRET` and a real user id (use
a dev deployment):

```sh
ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> SMOKE_USER_ID=user_… \
  pnpm --filter @archer/mcp exec tsx scripts/smoke.ts
ARCHER_SERVICE_SECRET=<secret> CONVEX_URL=<url> REMOTE_CHECK_USER_ID=user_… \
  pnpm --filter @archer/mcp exec tsx scripts/remote-check.ts
```

`smoke.ts` exercises every tool group, including the rejected write, layout
preservation, attribution in history and drift reporting. It creates and
deletes its own project and custom type. `remote-check.ts` is read-only: the
tool list, identity, workspaces, and that calls without a verified user are
refused.

The CLI's end-to-end tests (`pnpm --filter archerctl test`) run the real
tools behind a stand-in OAuth server and a fake Convex: see
[the CLI docs](cli.md#tests).

To try the server locally, run `pnpm dev` and connect a client to
`http://localhost:3000/mcp`. Sign-in goes through the development Clerk
instance.
