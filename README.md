# Archer

**An architecture canvas that compiles to an agent-readable language — and back.**

Design your software architecture on an Excalidraw-style canvas with real
technology components (AWS, Vercel, Postgres, …), strict connection rules, and
structured detail inside every node. The whole canvas *is* one `.arch` text
file: dragging a box edits the file, editing the file re-renders the canvas,
and one click compiles it into a precise spec you paste to a coding agent.

![Architecture](https://archer.tombyrne.dev/share/c_cjygFhmmD5DB3S/image.svg)

## Why

Coding agents are only as good as the spec you hand them. Diagrams describe
systems well but export as pixels; diagram-as-code tools describe *pictures*,
not systems. An Archer document is a semantic model:

- **Strict** — arrows can't point at nothing (the UI snaps them back; the
  validator rejects them with `E101`), ids must resolve, payloads must parse.
- **Deep** — a Postgres node carries its actual schema as a validated
  `json`/`yaml`/`table` payload; components nest like JSON.
- **Round-trip** — canvas ↔ text with zero loss. Layout lives in a quarantined
  machine-managed `layout` block that agents never see or write.
- **Agent-first** — "Copy for agent" emits the canonical document, layout
  stripped, with a short guide prepended. Paste it into Claude Code / Cursor
  and say "build this".

````
arch "Acme SaaS" v0.1

component backend "Backend" @vercel {
  component api "API" @vercel.functions
  component db "Postgres" @supabase.postgres {
    schema json ```
    { "users": { "id": "uuid pk", "email": "text unique" } }
    ```
  }
}

web -> backend.api @http
backend.api -> backend.db @sql
````

## Monorepo

| package | what |
| --- | --- |
| `packages/lang` | The language: parser, validator (typed error codes), canonical formatter, grid auto-layout, AST transforms, agent-export compiler. Pure TypeScript, no app dependencies. |
| `packages/catalog` | Curated component catalog (~75 technologies) + glyphs. |
| `packages/mcp` | MCP server giving agents full human-parity access: projects CRUD, validated writes, custom types, layout control, spec compilation. See [docs/mcp.md](docs/mcp.md). |
| `packages/cli` | The `archer` command (npm: `archer-cli`): `check` / `fmt` for `.arch` files in CI and agent shells, `init`, `push` / `pull`, and `archer mcp`. See [docs/cli.md](docs/cli.md). |
| `apps/web` | Next.js app: React Flow canvas, palette, detail panel, live code pane, drill-down navigation, Convex persistence. |

Docs: [language spec](docs/language-spec.md) · [product spec](docs/product-spec.md) · [roadmap](docs/roadmap.md)

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

Connect Claude Code (or any MCP client) to your projects — sign in, open
**Connect an agent** from your avatar menu, create an API key, then:

```sh
claude mcp add archer \
  --env ARCHER_API_KEY=<key> \
  -- pnpm --dir <repo>/packages/mcp start
```

## Status

v1.1 — the full core loop works: design on the canvas (drag, connect,
nest/drill down, detail panels with validated payloads), watch the `.arch`
file update live, copy code + PNG for an agent — and agents get the same
powers over MCP (validated writes, layout-preserving updates, custom types).
Next: real auth, sharing, per-technology payload validation (SQL linting
etc.), multi-file documents.
