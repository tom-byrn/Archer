# Archer — agent conventions

Archer is an architecture canvas that compiles to/from an agent-readable
language (`.arch` files). pnpm monorepo, TypeScript throughout:
`packages/lang` (the language: parser/validator/formatter/layout/transforms —
pure TS, no app deps), `packages/catalog` (component types + glyphs),
`packages/mcp` (stdio MCP server, `docs/mcp.md`), `apps/web` (Next.js 15 App
Router + React Flow + Convex).

- Run: `npx convex dev` and `pnpm dev`, both in `apps/web`.
- Auth: Clerk (GitHub login) via `ConvexProviderWithClerk`; Convex validates
  Clerk JWTs (`convex/auth.config.ts`, template "convex"). A workspace IS a
  user: `workspaceId` == Clerk user id. Every workspace-scoped Convex function
  calls `requireWorkspace(ctx, workspaceId, apiKey?)` from `convex/access.ts`
  — a signed-in browser session, or an API key (hashed in `apiKeys`) for the
  MCP server. Pre-auth anonymous workspaces are claimed on first sign-in
  (`workspaces.claimLegacy`); `admin:transferWorkspace` (internal, CLI only)
  moves data between workspaces. Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` +
  `CLERK_SECRET_KEY` in `.env.local`, `CLERK_JWT_ISSUER_DOMAIN` on the Convex
  deployment (`npx convex env set`).
- Tests: `pnpm --filter @archer/lang test` (never hit live APIs in tests —
  mock wrapper modules).
- Every canvas edit must go through `packages/lang` transforms → `format()`;
  the `.arch` text is the single source of truth.
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
  through this module; never call the SDK/REST elsewhere. It handles retries
  (429 Retry-After, one bounded retry on 408/5xx, never on validation).
- **Route**: `POST /api/brand` (`apps/web/app/api/brand/route.ts`) — body
  `{ query: string }`, returns `{ suggestion: BrandSuggestion | null }`.
- **Endpoints used**:
  - `GET /web/styleguide` (10 credits) — one-off design-system extraction
    (`apps/web/scripts/fetch-styleguide.ts`); sourced Archer's theme tokens
    from mintlify.com. Docs:
    https://docs.context.dev/api-reference/brand-intelligence/styleguide
  - `POST /brand/retrieve` (10 credits/lookup) via
  `by_name`/`by_domain` — powers the "Brand" button in the palette's
  new-custom-type form (auto-fills real brand colors for technologies the
  catalog doesn't know). Docs: https://docs.context.dev/guides/get-brand-data
- Adding more Context.dev features? Extend the wrapper, read the endpoint's
  docs page first (https://docs.context.dev — append `.md` for markdown), and
  mind credit costs; results are cached server-side by Context.dev (pass
  `maxAgeMs` only when freshness matters).
