# Archer — agent conventions

Archer is an architecture canvas that compiles to/from an agent-readable
language (`.arch` files). pnpm monorepo, TypeScript throughout:
`packages/lang` (the language: parser/validator/formatter/layout/transforms —
pure TS, no app deps), `packages/catalog` (component types + glyphs),
`packages/mcp` (stdio MCP server, `docs/mcp.md`), `packages/cli` (the
published `archer` binary — check/fmt/init/push/pull + `archer mcp`; a thin
shell over lang + `mcp/src/backend.ts`, bundled with tsup, `docs/cli.md`),
`apps/web` (Next.js 15 App
Router + React Flow + Convex).

- Run: `pnpm dev` from the repo root starts Convex and Next together
  (`apps/web` script `dev:all`). NEVER run `npx convex …` from the repo
  root — it scaffolds a second, empty Convex project there and pushes empty
  functions to the dev deployment. Use `pnpm convex <args>` (root alias) or
  run the CLI inside `apps/web`. Local dev targets the cloud dev deployment
  `keen-iguana-117`; production is `greedy-goldfinch-347` (`--prod`).
- Auth: Clerk (GitHub login) via `ConvexProviderWithClerk`; Convex validates
  Clerk JWTs (`convex/auth.config.ts`, template "convex"). Workspaces:
  personal (id == Clerk user id, owner) and team (`workspaces` rows, roles
  owner/editor/viewer via `members`, invites by email). Every workspace-scoped
  Convex function calls `requireWorkspace(ctx, workspaceId, apiKey?, need)`
  from `convex/access.ts` — queries need viewer, document mutations editor,
  member/workspace management owner. API keys (hashed in `apiKeys`, per
  workspace) act as editors; that is how the MCP server authenticates.
  Public share links: `documents.publicSlug` → `/share/<slug>` (viewer UI) and
  `/share/<slug>/image.svg` (server-rendered SVG from `lib/svg.ts`). Pre-auth
  anonymous workspaces are claimed on first sign-in (`workspaces.claimLegacy`);
  `admin:transferWorkspace` (internal, CLI only) moves data between
  workspaces. Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` in
  `.env.local`, `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment. Deploy
  runbook: `docs/deploy.md`.
- Hosted MCP: `apps/web/app/mcp/route.ts` serves the MCP server at `/mcp`
  (Streamable HTTP, stateless). Auth is MCP-standard OAuth with Clerk as the
  authorization server (dynamic client registration is ON in the Clerk
  instance); discovery docs live under `app/.well-known/*`. The route verifies
  the bearer token, then calls `handleRemoteRequest` from `@archer/mcp/remote`
  — the web app must NOT import `@modelcontextprotocol/sdk` itself (two SDK
  copies, one per zod peer, do not interoperate). Tools reach Convex with a
  server-only service credential `svc_<ARCHER_SERVICE_SECRET>.<userId>` passed
  in the usual `apiKey` argument (`convex/access.ts` → `effectiveUser`); the
  same secret must be set on the Convex deployment and in the web env. The
  stdio server + API keys remain for CI, the CLI and offline use.
  `registerArcherTools(server, { mode })` registers 23 tools for stdio, 24
  for remote (`list_workspaces`/`use_workspace` instead of `set_api_key`).
- GitHub: documents can link a repo + branch (`documents.repo`; reserved
  `path` for the future `.arch`-in-repo sync). ALL GitHub REST calls go
  through `apps/web/lib/githubApi.ts` (pure client) via
  `apps/web/lib/server/github.ts` (token = the user's Clerk GitHub OAuth token
  from `getUserOauthAccessToken(userId, "github")`); routes live under
  `app/api/github/*`. Clerk's default GitHub scopes read public repos only —
  private repos need the `repo` scope on the Clerk GitHub connection.
- Landing page: `app/welcome` (static) renders `components/landing/*`.
  `middleware.ts` rewrites `/` to `/welcome` for signed-out visitors; signed-in
  users get the dashboard at `/`. The sandbox is the real `ArchCanvas` in
  `embedded` mode on a local `useArchDoc` (no Convex), lazy-loaded so React
  Flow stays out of the first paint. Absolute URLs come from `lib/site.ts`
  (`NEXT_PUBLIC_SITE_URL`, default `https://archer.tombyrne.dev`).
- UI conventions (`apps/web`): all colors, radii and text sizes come from the
  tokens in `app/globals.css` (exposed as Tailwind utilities: `bg-surface`,
  `text-ink-2`, `border-line`, `rounded-md`, `text-sm`…). Never use the raw
  Tailwind palette (`slate-*`) or `dark:` variants — dark mode is handled by
  the tokens. Build controls from `components/ui.tsx` (Button, IconButton,
  Input, Menu, Dialog, Section, PropertyRow, Chip, Icon). Code editing goes
  through `components/CodeMirror.tsx`. React Flow chrome lives in
  `components/canvas.css`.
- Language/product specs live in `docs/`; keep `docs/language-spec.md` in
  sync with `packages/*/src/languageSpec.ts` copies when the grammar changes.

## Context.dev

One API for web data (scraping, search, extraction, brand intelligence).

- **Env var**: `CONTEXT_DEV_API_KEY` in `apps/web/.env.local` (gitignored;
  template in `apps/web/.env.example`). Server-side secret — must never reach
  a client bundle. Keys: https://www.context.dev/dashboard/api-keys
- **SDK**: `context.dev` (npm), installed in `apps/web`.
- **Wrapper**: `apps/web/lib/server/contextdev.ts` — ALL Context.dev calls go
  through this module; never call the SDK/REST elsewhere. No user-facing
  path uses it today.
- **Endpoints used**:
  - `GET /web/styleguide` (10 credits) — one-off design-system extraction
    (`apps/web/scripts/fetch-styleguide.ts`); sourced Archer's theme tokens
    from mintlify.com. Docs:
    https://docs.context.dev/api-reference/brand-intelligence/styleguide
- Adding more Context.dev features? Extend the wrapper, read the endpoint's
  docs page first (https://docs.context.dev — append `.md` for markdown), and
  mind credit costs; results are cached server-side by Context.dev (pass
  `maxAgeMs` only when freshness matters).
