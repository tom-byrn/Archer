# Archer — agent conventions

Archer is an architecture canvas that compiles to/from an agent-readable
language (`.arch` files). pnpm monorepo, TypeScript throughout:
`packages/lang` (the language: parser/validator/formatter/layout/transforms —
pure TS, no app deps), `packages/catalog` (component types + glyphs),
`packages/mcp` (stdio MCP server, `docs/mcp.md`), `apps/web` (Next.js 15 App
Router + React Flow + Convex).

- Run: `npx convex dev` and `pnpm dev`, both in `apps/web`.
- Tests: `pnpm --filter @archer/lang test` (never hit live APIs in tests —
  mock wrapper modules).
- Every canvas edit must go through `packages/lang` transforms → `format()`;
  the `.arch` text is the single source of truth.
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
