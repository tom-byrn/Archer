<p align="center">
  <a href="https://tryarcher.dev">
    <img src="apps/web/app/icon.svg" width="96" height="96" alt="Archer logo">
  </a>
</p>

<h1 align="center">Archer</h1>

<p align="center">
  <strong>A software architecture tool for you and your agents.</strong>
</p>

<p align="center">
  <a href="https://tryarcher.dev"><img src="https://img.shields.io/badge/tryarcher.dev-live-0f1117?style=flat-square" alt="Live at tryarcher.dev"></a>
  <a href="https://www.npmjs.com/package/archerctl"><img src="https://img.shields.io/npm/v/archerctl?style=flat-square&label=archerctl&logo=npm" alt="archerctl on npm"></a>
  <a href="docs/mcp.md"><img src="https://img.shields.io/badge/MCP-27_tools-0f1117?style=flat-square&logo=modelcontextprotocol&logoColor=white" alt="MCP: 27 tools"></a>
  <a href="docs/language-spec.md"><img src="https://img.shields.io/badge/.arch-v0.2-0f1117?style=flat-square" alt="Language v0.2"></a>
  <img src="https://img.shields.io/badge/Next.js-15-0f1117?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-0f1117?style=flat-square&logo=react&logoColor=61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Convex-backend-ee342f?style=flat-square" alt="Convex">
  <a href="https://github.com/tom-byrn/archer/commits/main"><img src="https://img.shields.io/github/last-commit/tom-byrn/archer?style=flat-square" alt="Last commit"></a>
</p>

<p align="center">
  <a href="https://tryarcher.dev"><strong>Try it</strong></a> ·
  <a href="https://tryarcher.dev/language"><strong>Language</strong></a> ·
  <a href="docs/mcp.md"><strong>MCP server</strong></a> ·
  <a href="docs/cli.md"><strong>CLI</strong></a> ·
  <a href="#run-it"><strong>Run it</strong></a>
</p>

Design your software architecture on a whiteboard-style canvas with real
technology components (Web app, AWS, Postgres, …), strict connection rules, and
structured detail inside every node. The whole canvas is one `.arch` diagram-as-code
file.

![Architecture](https://www.tryarcher.dev/share/1uC4PhN_kTVQmFom/image.svg?theme=dark)

## Why

Coding agents are only as good as the spec you hand them. Diagrams describe
systems well but export as pixels; diagram/ whiteboard tools describe *pictures*,
not systems. An Archer document is a semantic model:

- **Strict** — arrows can't point at nothing (the UI snaps them back; the
  validator rejects them with `E101`), ids must resolve, payloads must parse.
- **Deep** — a Postgres node carries its actual schema as a validated
  `json`/`yaml`/`table` payload, and a queue edge carries its message schema
  the same way; components nest like JSON, and planes group them on the
  canvas.
- **Round-trip** — canvas ↔ text with zero loss. Layout lives in a quarantined
  machine-managed `layout` block: agents may read it to see the diagram as
  drawn, never implement it, and write it only when asked to arrange things.
- **Readable at a glance** — a component can take a `shape` (a cylinder for a
  store, a person for a user, a robot for an agent) and an `icon`, and any
  component can hold components: it's one box on the canvas, and opening it
  shows its parts.
- **Agent-first** — "Copy for agent" emits the canonical document, with its
  layout and a short guide prepended. Paste it into Claude Code / Cursor and
  say "build this".

````
arch "Acme SaaS" v0.2

component web "Web App" @vercel.nextjs {
  shape browser
}

plane backend "Backend" @vercel {
  component api "API" @vercel.functions {
    component checkout "Checkout" {
      icon shopping_cart
    }
    component projects "Projects" {
      icon folders
    }
  }
  component db "Postgres" @supabase.postgres {
    shape cylinder
    schema json ```
    { "users": { "id": "uuid pk", "email": "text unique" } }
    ```
  }
}

api.projects -> db @sql
web -> api @http
````

## Monorepo

| package | what |
| --- | --- |
| `packages/lang` | The language: parser, validator (typed error codes), canonical formatter, layered auto-layout, AST transforms, agent-export compiler. Pure TypeScript, no app dependencies. |
| `packages/catalog` | Curated component catalog (~350 types: vendor-neutral system-design and AI building blocks — load balancers, rate limiters, queues, LLMs, agents, MCP servers… — plus real technologies) + Phosphor glyphs. |
| `packages/mcp` | MCP tools giving agents full human-parity access — projects CRUD, validated writes, custom types, layout control, spec compilation, the docs' worked examples — served by the app at `/mcp` with OAuth sign-in. See [docs/mcp.md](docs/mcp.md). |
| `packages/cli` | The `archer` command (npm: `archerctl`): `check` / `fmt` for `.arch` files in CI and agent shells, `init`, `login`, `push` / `pull`, and `archer mcp` (stdio bridge to the hosted server). See [docs/cli.md](docs/cli.md). |
| `apps/web` | Next.js app: React Flow canvas, palette, detail panel, live code pane, drill-down navigation, Convex persistence. |

Docs: [language spec](docs/language-spec.md) · [MCP server](docs/mcp.md) · [CLI](docs/cli.md) · [repo sync](docs/repo-sync.md) · [product spec](docs/product-spec.md) · [roadmap](docs/roadmap.md). The site publishes the first three at [/language](https://tryarcher.dev/language), [/docs/mcp](https://tryarcher.dev/docs/mcp) (with a tool reference generated from the server) and [/docs/cli](https://tryarcher.dev/docs/cli).

## Run it

```sh
pnpm install
pnpm --filter @archer/lang test     # 82 language tests

pnpm dev                              # Convex + Next together → http://localhost:3000

# Convex CLI: always through the alias (or from apps/web), never bare at the root
pnpm convex dashboard
```

Sign-in is GitHub via [Clerk](https://clerk.com). One-time setup:

1. Create a Clerk application, enable **GitHub** under *SSO connections*, and
   add a **JWT template** named `convex`.
2. Put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in
   `apps/web/.env.local` (template in `.env.example`).
3. Point Convex at your Clerk instance:
   `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-slug>.clerk.accounts.dev`

Deploying to Convex cloud + Vercel: see [docs/deploy.md](docs/deploy.md).

Connect Claude Code (or any MCP client) to your projects — no keys: the
agent signs you in with GitHub the first time it connects (MCP OAuth).
Locally the app serves the MCP server at `http://localhost:3000/mcp`:

```sh
claude mcp add --transport http archer http://localhost:3000/mcp
```

The `archer` CLI signs in the same way (`archer login`); see
[docs/cli.md](docs/cli.md). **Connect an agent** in the avatar menu shows the
commands for the deployment you're on.

## Status

v1.1 — the full core loop works: design on the canvas (drag, connect, group
on planes, nest and open components, detail panels with validated payloads),
watch the `.arch` file update live, copy code + PNG for an agent — and agents
get the same powers over MCP (validated writes, layout-preserving updates,
custom types). A document can also be stored in a `.arch` file in its GitHub
repository: agents edit the file alongside the code, the canvas follows the
branch, and edits made on the canvas are published back as pull requests
([repo sync](docs/repo-sync.md)).
Next: real auth, sharing, per-technology payload validation (SQL linting
etc.), multi-file documents.
