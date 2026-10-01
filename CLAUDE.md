# Archer — agent conventions

Archer is an architecture canvas that compiles to/from an agent-readable
language (`.arch` files). pnpm monorepo, TypeScript throughout:
`packages/lang` (the language: parser/validator/formatter/layout/transforms —
pure TS, no app deps), `packages/catalog` (component types + glyphs),
`packages/mcp` (the MCP tools the app serves at `/mcp`, `docs/mcp.md`),
`packages/cli` (the published `archer` binary — check/fmt/init/login/
workspace/push/pull + `archer mcp`, a stdio relay; validates with
`mcp/src/analysis.ts` and does everything else through the hosted `/mcp`
tools, signed in with the same OAuth flow agents use; bundled with tsup,
`docs/cli.md`),
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
  Convex function calls `requireWorkspace(ctx, workspaceId, serviceKey?, need)`
  from `convex/access.ts` — queries need viewer, document mutations editor,
  member/workspace management owner. Every caller is a user; there are NO
  API keys (removed — don't reintroduce per-workspace secrets). Browsers use
  the Clerk JWT; agents and the CLI come through the hosted MCP route.
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
  in the functions' `apiKey` argument (legacy name; `convex/access.ts` →
  `effectiveUser`); the same secret must be set on the Convex deployment and
  in the web env. `registerArcherTools(server)` registers 25 tools. The CLI
  (`archer login`) runs the same OAuth flow as any MCP client (DCR + PKCE +
  localhost redirect, client name "Archer CLI"), stores the session in
  `~/.archer/auth.json`, and calls the tools; the JSON shapes it reads are
  typed in `mcp/src/contract.ts` and built with `satisfies` in `server.ts`.
  `packages/cli/test/account.test.ts` runs the CLI end to end against a
  stand-in OAuth server + the real tools over a fake Convex.
- GitHub: documents can link a repo + branch (`documents.repo`). With
  `repo.path` set the document is *stored in* that `.arch` file — repo sync,
  `docs/repo-sync.md`: the file on the branch is the truth, the document its
  working copy (the draft is whatever differs from `repo.base`), and the file
  holds architecture only (no layout block; positions stay in Archer). Rules
  in `lib/repoSync.ts` (pure), the engine in `lib/server/repoSync.ts` (routes
  `app/api/github/{files,projects,link,sync,publish,webhook}`), Convex side
  `convex/repoSync.ts`, three-way merge `packages/lang/src/merge.ts`. Linking
  and importing are server-only (`requireServiceUser`) because the server
  first checks the user's own GitHub read access; the push webhook
  (`GITHUB_WEBHOOK_SECRET`; optional GitHub App `GITHUB_APP_ID` +
  `GITHUB_APP_PRIVATE_KEY`) finds documents with the bare server credential
  (`requireServer`; the admin dashboard is its only other user) and then acts as each document's linking
  user. ALL GitHub REST calls go through `apps/web/lib/githubApi.ts` (pure
  client) via `apps/web/lib/server/github.ts` (token = the user's Clerk GitHub
  OAuth token from `getUserOauthAccessToken(userId, "github")`, or the App's
  installation token); routes live under `app/api/github/*`. Clerk's default
  GitHub scopes read public repos only — private repos (and publishing) need
  the `repo` scope on the Clerk GitHub connection.
- Landing page: `app/welcome` (static) renders `components/landing/*`.
  `middleware.ts` rewrites `/` to `/welcome` for signed-out visitors; signed-in
  users get the dashboard at `/`. The sandbox is the real `ArchCanvas` in
  `embedded` mode on a local `useArchDoc` (no Convex), lazy-loaded so React
  Flow stays out of the first paint. Absolute URLs come from `lib/site.ts`
  (`NEXT_PUBLIC_SITE_URL`, default `https://archer.tombyrne.dev`).
- Docs: `/language` (the spec) and `/language/examples` (worked examples from
  `packages/mcp/src/examples.ts`, which agents also read through the MCP
  tools `list_examples`/`get_example`). Example sources must stay canonical
  and validate clean — `apps/web/test/examples.test.ts` enforces it, so the
  code shown, the diagram (`lib/svg.ts`, prerendered at
  `/language/examples/<slug>/{light,dark}.svg`), the editor copy and what
  agents read always agree. "Open in sandbox" goes to
  `/sandbox/<slug>` (see Editor sessions). "View code" opens the source in
  the editor's code popout (`components/CodeDialog.tsx`, shared with
  `CodePane`), highlighted on the server by `lib/highlightArch.ts` so the page
  never loads CodeMirror. `/new?example=<slug>`, which copies
  the example into the selected workspace (reusing an untouched earlier copy),
  still works but nothing links to it.
- MCP and CLI docs: `/docs/mcp` and `/docs/cli` render `docs/mcp.md` and
  `docs/cli.md` at build time (`lib/docs.ts`), up to their
  `<!-- site:end -->` marker; what follows it is for contributors. Headings
  get GitHub's ids and `.md` links map to the pages, so links between the
  docs work in the repo and on the site (`apps/web/test/docs.test.ts` checks
  every anchor). The MCP page's tool reference is generated, between the
  `<!-- tools:start/end -->` markers, from the registered tools
  (`@archer/mcp/reference`: `describeServer`, plus `TOOL_GROUPS`/`TOOL_DOCS`
  with an example call per tool). `packages/mcp/test/reference.test.ts`
  fails until a new tool is documented there, and runs every example against
  a fake backend; `packages/cli/test/docs.test.ts` checks `docs/cli.md`
  covers `archer --help`.
- Editor sessions: `components/Editor.tsx` takes a `session` — a stored
  document (`kind: "document"`: autosave, history/drift, share, export, repo
  link, account menu) or a sandbox (`kind: "sandbox"`: in memory only). The
  sandbox is `/sandbox/<slug>` (public, prerendered per example;
  `components/SandboxEditor.tsx`): the same editor, with custom types from
  `useLocalLibrary`, and leaving the page discards every edit. Anything new
  that saves, shares or exports goes behind `stored` in the editor so the
  sandbox never gets it; everything else reaches the sandbox automatically.
  The editor owns the canvas selection (component and plane paths + connection
  keys) and `ArchCanvas` mirrors it onto React Flow's `selected` flags; edits
  that span several components (copy/paste fragments, duplicate, group on a
  plane, nest, partial re-layout, re-pointing an edge) are pure transforms in
  `packages/lang`
  (`transform.ts`), run through `useArchDoc`'s `mutate`/`mutateWith`. The
  clipboard format is plain `.arch` text (`extractFragment`/`insertFragment`).
- Samples: "From sample" on the dashboard opens `components/SampleDialog.tsx`,
  a gallery of `lib/samples` (one module per source, listed with its title
  and blurb in `lib/samples/index.ts`). Choosing one saves the source as a new
  document verbatim, so like the docs examples, samples stay canonical and
  validate clean — `apps/web/test/samples.test.ts` enforces it.
- Catalog (`packages/catalog`): two kinds of type. Vendor-neutral building
  blocks (`@load_balancer`, `@rate_limiter`, `@cache`, `@llm`…) are grouped by
  concern (generic, ai, network, compute, storage, messaging, data,
  observability, security, platform, topology, patterns) and slate
  `#64748b`, except the AI & agents group (`ai`), which shares one violet;
  real technologies use their brand color and a vendor group (ai_platforms,
  aws, gcp, azure, vercel, databases, infra, saas). The palette lists the
  neutral groups first, in `NEUTRAL_NAMESPACES` order
  (`components/Palette.tsx`) — a new namespace needs a label in
  `NAMESPACE_LABELS` there. Tags and glyph keys end up in saved documents
  and custom types: add freely, never rename or remove one.
- Logos: a real technology's type can name a `logo`, a key into `LOGOS`
  (`@archer/catalog/logos`, generated by `scripts/logos.ts`), drawn instead of
  its glyph. One-colour logos are Simple Icons / Lobe Icons marks painted in
  the brand color; multicolour ones are full-colour artwork (Lobe Icons, SVG
  Logos) drawn as is; AWS services use AWS's own Architecture Icons, unchanged
  (`vendor/aws`, CC BY-ND 2.0, credited at the foot of the palette). Never
  recolor, crop or trace a vendor's icon, and never take one from a pack that
  relabels vendor artwork (theSVG, SVG Logos' AWS set, Iconify's `gcp`). Brands
  whose owners require permission or have refused it keep their glyph, with
  the reason in `NO_LOGO` (OpenAI, Slack, Twilio, Docker, Cloudflare,
  HashiCorp, PostgreSQL, MySQL, Apple, and Google and Azure until their
  official icon sets are vendored); `catalog.test.ts` fails until a new vendor
  type has a logo or a reason. Logos show only under a `LogoProvider`
  (`components/logos.tsx`: editor, viewer, dashboard) and in
  `renderArchSvg(…, { logos })` (share and docs images). The landing page, its
  sandbox and the OG image keep glyphs (`test/logos.test.ts`), custom types
  never get logos, and the logo chunk (~190 KB gzipped, mostly AWS's PNGs)
  loads after first paint.
- Shapes: a component's `shape` (spec §3.3; `shape cylinder` in its body) is,
  with planes, a visual field outside `layout`, so agents and repo files carry it.
  The names live in `packages/lang/src/shapes.ts` (`SHAPES`, `SHAPE_INFO`,
  `SHAPE_GROUPS`; add freely, never rename or remove one — documents store
  them; an unknown one is `W304` and draws as a box). `SHAPES` is in picker
  order, group by group (basic, people, apps & devices, network & security,
  compute, data & storage, messaging & monitoring), and the spec's §3.3 table
  lists them the same way (`packages/mcp/test/languageSpec.test.ts` fails
  until it does). How each looks is `apps/web/lib/shapes.ts`: pure geometry
  for any box size (outline paths, label area, edge-anchor insets), shared by
  the canvas (`ArchShapeNode` in `components/nodes.tsx`), `lib/svg.ts` and
  the pickers (`components/ShapePicker.tsx`: the inspector's dropdown, which
  "Change shape…" opens directly, and the palette's Shapes group), so all of
  them draw the same thing. A component with nested components keeps its
  shape; planes have none.
- Icons: a component's `icon` (spec §3.3; `icon shopping_cart` in its body)
  replaces its type's glyph or logo; an untyped component without one shows
  no icon. The names are the glyph keys plus ~380 more Phosphor icons in
  snake case, grouped for the picker (`ICON_GROUP_SOURCES` in
  `packages/catalog/scripts/glyphs.ts`, generated into
  `@archer/catalog/icons`; add freely, never rename or remove one). The
  language keeps any name as written; validators pass `knownIcons` for `W305`.
  The inspector's picker is `components/IconPicker.tsx` ("Change icon…" opens it).
- Colors: a component's `color` (spec §3.3; `color green` or `color "#b45309"`)
  replaces its type's color: its icon is drawn in it and its card or shape
  takes a tint (`arch-card-colored` / `arch-shape-typed`); logos keep their own
  colors, and planes have none. The palette is `packages/lang/src/colors.ts`
  (`COLORS`, `COLOR_HEX`, `resolveColor`; add freely, never rename or remove
  one); anything else that isn't `#rrggbb` is `W306`. `toFlow` passes the
  resolved hex as `data.color`, beside the type's `accent`. The inspector's
  picker is `components/ColorPicker.tsx` ("Change color…" opens it).
- Planes and nesting (spec §3.1, §3.4, language v0.2): a `plane` is a titled
  region of a canvas, for readers only. It is transparent to paths (`api` on
  plane `backend` is still `api`), never a connection endpoint (`E101`), and
  shares its scope's ids with the components. The AST keeps components flat per
  scope with `plane?: string`; `planeTree(scope)` (`packages/lang/src/scope.ts`)
  resolves membership and the canonical order. Any component can hold
  components: its canvas draws it as a box with a count badge, and opening it
  (double-click; the editor's `focus`) shows its own canvas, with the outside
  components its parts connect to as context nodes (`ctx:<path>`,
  `lib/toFlow.ts`). Layout is per canvas and an `at` is relative to the plane
  an item sits on (`canvasAt` adds them up). A drop onto a component nests,
  onto a plane puts it there (`lib/dropTarget.ts`). Planes never collapse:
  there is no plane-to-component conversion (a component with parts can become a
  plane, not the reverse), so keep the two concepts apart. There is no
  support for older language versions: there are no users yet, so change the
  grammar freely.
- Admin dashboard: `/admin-dashboard` (linked from nowhere) is for one person,
  hard-coded in `lib/admin.ts` (`isAdmin`: verified email
  tombyrne788@gmail.com or verified GitHub login tom-byrn — a code change, not
  an env var, widens it). Everyone else gets a 404: every page under
  `app/admin-dashboard` calls `requireAdmin()` (`lib/server/admin.ts`)
  itself, not just the layout. Data: Clerk's user list plus
  `convex/adminDashboard.ts` queries, which take the bare server credential
  (`requireServer`) — no browser can call them. The numbers are computed by
  `lib/adminMetrics.ts` (pure; definitions and tests in `test/admin.test.ts`)
  and drawn by client views in `components/admin/*` (charts use the `--viz-*`
  tokens). Usage is recorded for it: `components/UsageBeacon.tsx` (mounted in
  `Providers`) sends `usage.heartbeat` for signed-in tabs (visible, non-idle
  time → `sessions`), and the `/mcp` route records each tool call
  (`lib/server/usage.ts` → `usage.recordToolCall` → `toolCalls`) after
  responding. Feedback: "Send feedback" beside Docs in the dashboard footer
  opens `components/FeedbackDialog.tsx` → `feedback.send` (`feedback` table),
  listed with its sender on the Feedback tab (`adminDashboard.feedback`).
  Read-only canvases reuse `DocumentViewer`
  (`/admin-dashboard/canvas/<id>`, `?rev=<revisionId>` for a past version).
- Brand kit: `/branding` (signed-in only, deliberately linked from nowhere —
  keep it that way) shows the logo, colors, type, radii, icons and ui.tsx
  primitives. Values are parsed from `app/globals.css` at build time
  (`lib/brand.ts`); a new color token appears under "Other" until it gets a
  role in `COLOR_GROUPS` (`apps/web/test/brand.test.ts` fails until it does).
- UI conventions (`apps/web`): all colors, radii and text sizes come from the
  tokens in `app/globals.css` (exposed as Tailwind utilities: `bg-surface`,
  `text-ink-2`, `border-line`, `rounded-md`, `text-sm`…). Never use the raw
  Tailwind palette (`slate-*`) or `dark:` variants — dark mode is handled by
  the tokens. The theme is `data-theme="light|dark"` on `<html>`: the
  viewer's System/Light/Dark choice (localStorage, `lib/theme.ts`; toggle in
  the site header, setting in the account menu), resolved before first paint
  by the inline script in `app/layout.tsx`. Theme controls call
  `switchTheme(choice, button)`, which animates the change: a view
  transition, the new theme spreading from the button in a circle (CSS in
  `globals.css`); a plain switch without support or with reduced motion. Key
  CSS on `:root[data-theme="dark"]` and code on `useIsDark()`, never on
  `prefers-color-scheme`. Build controls from `components/ui.tsx` (Button,
  IconButton, Input, Menu, Dialog, Section, PropertyRow, Chip, Icon). An icon
  that changes on click (copy → check) is a `SwapIcon`, which animates the
  swap; never a bare ternary between two icons. The button's label stays as
  it is (no Copy → Copied), so the icon alone confirms and nothing resizes. Icons
  are Phosphor: UI icons are `@phosphor-icons/react` (bold) behind `Icon` —
  add a name there, don't import Phosphor elsewhere (`GitHubMark` stays
  GitHub's own mark on purpose); component glyphs are Phosphor paths
  generated into `packages/catalog/src/glyphs.ts` by `scripts/glyphs.ts`
  (strings, so `lib/svg.ts` and the OG image can draw them). Code editing
  goes through `components/CodeMirror.tsx`. Markdown people wrote (markdown
  and table payloads, read-only) renders through `components/Markdown.tsx`:
  marked's tokens straight to React, never an HTML string. React Flow chrome
  lives in `components/canvas.css`.
- Language/product specs live in `docs/`; keep `docs/language-spec.md` in
  sync with its copies (`packages/mcp/src/languageSpec.ts`,
  `apps/web/lib/languageSpec.ts`) when the grammar changes — tests fail until
  they match it exactly.
- Auto-layout: `autoLayout` (`packages/lang/src/layout.ts`) arranges a doc
  with no positions (or `{ reset: true }`) with the layered engine in
  `layered.ts` (solver: `simplex.ts`); otherwise it keeps positions and places
  new components next to their neighbours. Edges are drawn by
  `apps/web/lib/edgeRoute.ts` for both the canvas (`toFlow`) and `lib/svg.ts`
  — route through it so the two stay identical.

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
