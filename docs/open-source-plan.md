# Open source & self-hosting plan

*Proposal, September 2026. Nothing here is built yet.*

Goal: publish this repository under open-source licenses and let anyone run
their own Archer — first on their own cloud accounts, then on their own
hardware with Docker, and finally without any third-party service. The hosted
app keeps running from the same code.

## Summary

- **Most of Archer is already portable.** `packages/lang`, `packages/catalog`
  and `packages/cli` are plain TypeScript; the Next.js app uses nothing
  Vercel-only at runtime; Convex's backend can run on your own machine from a
  Docker image; and the MCP tools only need a verified user id
  (`packages/cli/test/host.ts` already runs them behind a stand-in OAuth
  server and a fake Convex).
- **Clerk is the one hard dependency.** It does five jobs: browser sign-in,
  the JWT Convex trusts, the OAuth authorization server behind `/mcp`
  (dynamic client registration for agents and the CLI), storage of each
  user's GitHub token for repo linking, and the user ids themselves
  (`user_…`, which double as personal workspace ids).
- **Five phases, each shippable on its own:**
  0. Open-source readiness — licenses, hygiene, CI, contributor docs; make
     the repo public.
  1. Portable configuration — your own Convex + Clerk + any Node host, no
     code edits.
  2. Docker — `docker compose up` with a self-hosted Convex backend; Clerk
     still signs people in.
  3. Built-in auth — an auth seam with two providers: Clerk (hosted) and a
     built-in one that is also the MCP authorization server. No third-party
     service required.
  4. Releases & upkeep — versioned images, upgrade path, API compatibility.
- **Decide first:** the license split (D1) and whether to publish history as
  it is (D2). Whether the hosted app also moves off Clerk can wait (4.4).

## 1. Where things stand

### Dependencies

| Dependency | Used for | Where | Self-hostable? |
| --- | --- | --- | --- |
| Convex cloud | Database, functions, realtime | `apps/web/convex/`, `components/Providers.tsx`, `packages/mcp/src/backend.ts`, `app/share/[slug]/image.svg/route.ts` | Yes: self-hosted backend in Docker (Phase 2) |
| Clerk | The five jobs above | 14 files import `@clerk/*`¹; `convex/auth.config.ts`; `convex/access.ts` | No: SaaS only (Phase 3) |
| Vercel | Hosting; `build:vercel` runs `convex deploy --cmd 'pnpm build'` | `apps/web/vercel.json`, `apps/web/package.json`; `VERCEL_PROJECT_PRODUCTION_URL` fallback in `packages/mcp/src/backend.ts` | Yes: nothing Vercel-only at runtime |
| GitHub REST API | Repo linking (repos, branches, commits) | `lib/githubApi.ts` (hardcodes `api.github.com`), `lib/server/github.ts`, `app/api/github/*` | The token comes from Clerk (3.5); GitHub Enterprise needs a base URL |
| Google Fonts | Inter, Playfair Display, Newsreader via `next/font/google` | `app/layout.tsx`, `lib/fonts.ts` | Downloaded at build time, so builds need network |
| Context.dev | One-off theme extraction | `lib/server/contextdev.ts`, `scripts/fetch-styleguide.ts` | Not on any runtime path |
| npm `archerctl` | The CLI (not published yet) | `packages/cli/tsup.config.ts` bakes in the default server | Works via `ARCHER_APP_URL`; needs real server selection (1.3) |

¹ `middleware.ts`, `components/{Providers,AccountMenu,RepoDialog,Editor}.tsx`,
`lib/workspace.ts`, `lib/server/github.ts`, `app/documents/[id]/page.tsx`,
`app/share/[slug]/page.tsx`, `app/sign-in/…`, `app/sign-up/…`,
`app/mcp/route.ts` and both `app/.well-known/*` routes.

### Hosted-instance assumptions in the code

- **Public URL.** Five names — `NEXT_PUBLIC_SITE_URL` in the app;
  `ARCHER_APP_URL`, `ARCHLANG_APP_URL`, `NEXT_PUBLIC_APP_URL` and
  `VERCEL_PROJECT_PRODUCTION_URL` in `packages/mcp/src/backend.ts` — with two
  different defaults (`https://archer.tombyrne.dev`, `http://localhost:3000`).
- **"Connect an agent" CLI command.** `ConnectAgentDialog` prints a bare
  `npx archerctl login` when the page's origin equals `SITE_URL`. On a
  self-hosted instance that sets its own `NEXT_PUBLIC_SITE_URL`, that command
  signs the CLI in to archer.tombyrne.dev instead. Fixed in 1.3.
- **Landing page.** `middleware.ts` rewrites `/` to the marketing page for
  signed-out visitors; a private instance wants its sign-in page there.
- **Pre-auth leftovers.** `workspaces.claimLegacy`, `LegacyClaim`
  (`Providers.tsx`), `takeLegacyWorkspaceId` (`lib/workspace.ts`) and the
  `ARCHLANG_APP_URL` fallback exist only for the hosted app's history.
  `admin:transferWorkspace` is a useful operator tool: keep and document it.
- **Clerk-shaped ids.** `convex/access.ts` accepts service credentials only
  for ids matching `/^user_[A-Za-z0-9]+$/`.
- **Invites trust the email claim.** `workspaces.acceptInvites`,
  `workspaces.list` and `roleFor` match pending invites by email, relying on
  the sign-in provider to vouch for the address (Clerk's GitHub sign-in does).
  Any other provider must pass only verified emails, or whoever can sign up
  with an invitee's address takes the invite. Security-critical for Phase 3.
- **Contributor setup needs the maintainer's accounts.** CLAUDE.md points
  local dev at the maintainer's Convex dev deployment, and sign-in needs a
  Clerk instance.

### Repository hygiene

- **No license.** Only `packages/cli` declares one (MIT, in `package.json`),
  and there's no `LICENSE` file anywhere.
- **The CLI isn't on npm.** The README, `docs/cli.md`, `docs/mcp.md` and the
  "Connect an agent" dialog all say `npx archerctl`, but the registry returns
  404 for `archerctl` (and `archer` belongs to an unrelated package).
- **No `.github/`.** No CI, issue or PR templates, or security policy.
- **Stray dependency.** The root `package.json` depends on `agentation`, which
  nothing imports and which is licensed PolyForm-Shield-1.0.0
  (source-available, not open source). The root `package-lock.json` is an npm
  artifact in a pnpm repo.
- **Bundled fonts.** `apps/web/app/welcome/fonts/*.ttf` (Inter, Geist Mono,
  Newsreader, Playfair Display) are under the SIL Open Font License 1.1, which
  requires shipping the license text with the files.
- **No secrets found in history.** All 97 commits were pattern-scanned for
  Clerk, Convex deploy, GitHub and AWS key formats, private keys, and
  filled-in `ARCHER_SERVICE_SECRET` / `CONTEXT_DEV_API_KEY` /
  `CLERK_SECRET_KEY` values; no `.env` file was ever committed. Confirm with a
  dedicated scanner before going public (0.6).
- **Author emails.** 27 commits carry a personal email address rather than
  the GitHub noreply address; publishing the history publishes it (D2).
- **Theme provenance.** `app/globals.css` and CLAUDE.md say the theme tokens
  were sourced from mintlify.com. Colors and spacing scales aren't
  protectable, but review that wording, and whether the palette reads as
  Archer's own, before the repo is public.
- **Stale README.** "Status" still lists real auth and sharing as next.

## 2. Decisions

**D1 — Licenses.** Recommended split:

- `packages/lang`, `packages/catalog`, `packages/mcp`, `packages/cli`:
  **MIT**. The CLI is already declared MIT, and its bundle inlines lang,
  catalog and the Convex-free parts of mcp, so those ship inside an MIT
  package anyway. A permissive license is also what lets other tools adopt
  the `.arch` language.
- `apps/web`: **AGPL-3.0**. Anyone can self-host and modify it, but whoever
  runs a modified version as a public service must publish their changes —
  the usual license for an open-source app with a hosted offering (Plausible
  and Cal.com use it). Choose **MIT** instead if adoption matters more to you
  than stopping closed hosted forks.
- **Contributions:** DCO sign-off (`git commit -s`, checked in CI). If you
  might later sell a commercial license or keep closed hosted-only features,
  require a CLA from the first outside PR instead; it can't be added
  retroactively.
- **Name and logo** aren't covered by a code license. Add a short
  `TRADEMARK.md` (public forks rebrand). "Archer" is also the name of other
  software products and the `archer` npm name is taken, so run a trademark
  search before announcing.

**D2 — History.** Publish the existing history (recommended, once the scanner
in 0.6 agrees it's clean) rather than squashing it. If the author emails
matter, rewrite them once with `git filter-repo --mailmap` before the repo
goes public: every SHA changes, open branches must be recreated, and it can't
be done after people fork.

**D3 — What "self-hosted" means.** Three tiers, delivered in order:

| Tier | You run | Still external | Phase |
| --- | --- | --- | --- |
| A — own accounts | the app, on any Node host | Convex cloud, Clerk | 1 |
| B — own data | the app and the Convex backend (Docker) | Clerk, for identity only | 2 |
| C — no SaaS | everything | a GitHub OAuth app, if you want GitHub sign-in | 3 |

**D4 — Auth for tier C.** Recommended: an auth seam in the app with two
providers — `clerk` (hosted; today's code) and `builtin` (self-hosted). The
built-in provider is an auth library running inside the app (Better Auth,
3.3) that signs people in with GitHub or any OIDC identity provider, issues
the JWT Convex checks, and is itself the OAuth authorization server for MCP
clients and the CLI. Rejected:

- *Clerk only.* Self-hosters and every contributor need a Clerk account; not
  self-hosted in any real sense.
- *An external IdP as the MCP authorization server* (Keycloak, Authentik,
  Zitadel…). This mirrors today's Clerk design, but MCP clients register
  themselves and IdP support for that varies, the GitHub token still has to
  come from somewhere, and running an IdP is heavy for `docker compose up`.
  The built-in provider can still use such an IdP *for sign-in* (generic
  OIDC) while handling MCP OAuth itself.
- *Moving the hosted app off Clerk now.* One code path, but a risky user-id
  migration with nothing user-visible to show for it. Revisit once tier C has
  run in production (4.4).

## Phase 0 — Open-source readiness

Exit: the repo is public; a fork's CI is green without secrets; every package
declares a license; a newcomer can follow CONTRIBUTING to a running app.

- **0.1 Dependency hygiene (S).** Remove `agentation` from the root
  `package.json`, delete the root `package-lock.json`, reinstall. Add a CI
  check that fails on production dependencies with non-OSI or unknown
  licenses.
- **0.2 License files (S).** Root `LICENSE` (AGPL-3.0, the default for
  anything not marked otherwise), `packages/*/LICENSE` (MIT), a `license`
  field in every `package.json`, a README section explaining the split,
  `OFL.txt` next to the bundled fonts, and a `NOTICE` for third-party assets
  (the fonts; the MCP client marks in `components/landing/ClientLogos.tsx`,
  from Simple Icons and svgl).
- **0.3 Community files (S).** `CONTRIBUTING.md` (setup per 0.5, the
  conventions in CLAUDE.md, tests, DCO), `CODE_OF_CONDUCT.md` (Contributor
  Covenant), `SECURITY.md` (GitHub private vulnerability reporting; covers the
  code and the hosted app), issue and PR templates, Dependabot or Renovate.
  Keep CLAUDE.md — it is the guide for agent contributors — but make it
  contributor-neutral.
- **0.4 CI (S–M).** `.github/workflows/ci.yml`: Node 22 and the pnpm version
  from `packageManager`; `pnpm install --frozen-lockfile`, `pnpm typecheck`,
  `pnpm test`; the web build with no secrets (it should build and render its
  "not configured" panel — verify); the CLI build; the DCO check; a secret
  scan on every PR. Make the checks required on `main`.
- **0.5 Contributor setup without maintainer accounts (S).** Document
  `pnpm dev` against the contributor's own Convex — `convex dev` can run a
  local deployment without an account — plus their own free Clerk dev
  instance, until 3.6 removes that need. Mark CLAUDE.md's `keen-iguana-117` /
  `greedy-goldfinch-347` lines as maintainer-only; same for the comments in
  `.conductor/settings.toml`.
- **0.6 Go public (owner).** Run gitleaks and trufflehog over the full
  history; settle D2; rewrite the README for an outside audience (what and
  why, hosted vs self-hosted, quickstart, license, contributing; drop the
  stale Status); enable private vulnerability reporting, branch protection
  and Discussions; flip the visibility.

## Phase 1 — Portable configuration (tier A)

Exit: an instance on a non-Vercel Node host, with its own Convex project and
Clerk app, supports sign-in, editing, share images, MCP OAuth from Claude Code,
and `archer login` + push/pull — without code edits.

- **1.1 One public URL (S).** A single `ARCHER_PUBLIC_URL`, read on the
  server by both the app and `packages/mcp` (it reaches the browser through
  2.1). Unset, production derives the origin from the request
  (`app/mcp/route.ts` already does, from `x-forwarded-*`) and dev uses
  `http://localhost:3000`. Keep `NEXT_PUBLIC_SITE_URL` and `ARCHER_APP_URL` as
  deprecated aliases for one release; drop `ARCHLANG_APP_URL`,
  `NEXT_PUBLIC_APP_URL` and the Vercel fallback. The hosted deployment sets
  the variable explicitly.
- **1.2 Marketing switch (S).** `ARCHER_LANDING=off` makes `/` send
  signed-out visitors to `/sign-in` and turns off `/welcome` and its OG image.
  `/language`, the examples and the sandbox stay: agents on a private
  instance read `/language` too.
- **1.3 CLI server selection (M).**
  - `archer login [url]` signs in to `url` and makes it the current server,
    stored in `~/.archer/config.json`. Sessions in `auth.json` are already
    keyed by MCP URL, so several servers coexist.
  - `--server <url>` on every command. Precedence: the flag,
    `ARCHER_APP_URL`, the `server` recorded in `./archer.json`,
    `~/.archer/config.json`, the built-in default.
  - `push`/`pull` record the server in `./archer.json` beside the
    file → project links, and refuse to push a link that belongs to another
    server, so a team on a self-hosted instance can't write to the hosted app
    by accident.
  - `ConnectAgentDialog` prints `npx archerctl login <origin>` unless the
    origin is the published CLI's default (one shared constant), instead of
    comparing with `SITE_URL`.
  - Tests: `packages/cli/test/account.test.ts` against two stand-in hosts.
  - Then publish `archerctl` to npm, with `packages/cli/LICENSE` (npm packs
    it automatically) — the docs already tell people to `npx` it.
- **1.4 Deploy docs (S).** Rename `build:vercel` to `build:deploy`; it works
  on any CI that sets `CONVEX_DEPLOY_KEY` (update `vercel.json`). Turn
  `docs/deploy.md` into `docs/self-hosting.md`: the tiers, then tier A with
  Convex cloud, Clerk, and Vercel or any Node host, free of maintainer
  specifics. Add the self-hosted `/mcp` URL form to `docs/mcp.md`,
  `docs/cli.md` and the CLI README.
- **1.5 Typed configuration (M).** One `apps/web/lib/config.ts`: a zod schema
  over every variable, with required-ness per mode, defaults and
  descriptions. Server code reads configuration only through it; the app
  fails fast at boot with actionable messages; the "not configured" panel
  (`Providers.tsx`, which hardcodes two variables today) and the docs'
  variable reference come from the same schema.

## Phase 2 — Docker with self-hosted Convex (tier B)

Exit: on a fresh Linux VM, `docker compose up` plus a Clerk dev instance gives
a working instance with its data on local disk; upgrading to the next image
keeps the data; a backup restores into a fresh stack.

- **2.1 Runtime configuration (M).** Next.js inlines `NEXT_PUBLIC_*` values
  into its bundles at build time, so one prebuilt image can't serve different
  instances — don't rely on reading them at runtime, even on the server. Serve
  the browser's values (Convex URL, public URL, auth provider and its public
  key) from a dynamic route as a small script that sets `window.__ARCHER__`,
  loaded by a blocking `<script>` in `app/layout.tsx` beside `THEME_SCRIPT`
  (this works on prerendered pages too); `Providers.tsx` and `lib/site.ts`
  read it. Server code reads non-`NEXT_PUBLIC_` names at runtime
  (`CONVEX_URL`, `CLERK_PUBLISHABLE_KEY`) and passes keys explicitly
  (`clerkMiddleware({ publishableKey })`; `<ClerkProvider>` already takes
  one). The build-time names stay as fallbacks for Vercel and `convex dev`.
  Test: build once, run with two different env files.
- **2.2 Image (M).** `output: "standalone"` with `outputFileTracingRoot` at
  the repo root (pnpm workspace); a multi-stage `apps/web/Dockerfile` on
  Node 22, running as non-root, with a `HEALTHCHECK`. The image also carries
  `apps/web/convex/` and the Convex CLI (2.3). `app/welcome/opengraph-image.tsx`
  and `app/branding/page.tsx` read files through `process.cwd()`: confirm
  they're prerendered or add `outputFileTracingIncludes`. Optionally move to
  `next/font/local` (the font files are OFL and partly in the repo already)
  so image builds need no network.
- **2.3 Function deploys (M).** A one-shot `deploy` compose service using the
  same image: `convex deploy` against the self-hosted backend
  (`CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY`), then
  `convex env set` for `ARCHER_SERVICE_SECRET` and the auth issuer. `web`
  starts after it completes, so functions and app always come from the same
  version. Idempotent; the same command deploys to Convex cloud given
  `CONVEX_DEPLOY_KEY`.
- **2.4 Compose stack and docs (M).** `deploy/compose.yaml` with `convex`
  (backend and a volume), `dashboard` (optional, bound to localhost),
  `deploy` and `web`; a Postgres profile for durable storage; an
  `.env.example`; a Caddy example for TLS. Convex is simplest on its own
  hostname (e.g. `archer.example.com` and `convex.example.com`). Server-side
  calls — MCP tools, share images — may use an internal URL
  (`CONVEX_INTERNAL_URL`); browsers use the public one. `docs/self-hosting.md`
  gains a quickstart, the variable reference, TLS, backups (scheduled
  `convex export`, or Postgres dumps) and restore, upgrades, and
  troubleshooting.
- **2.5 Health endpoint (S).** `/api/health` reports the app, Convex
  reachability, and whether Convex accepts the service credential — which
  catches the most common misconfiguration, a different
  `ARCHER_SERVICE_SECRET` in web and Convex. Status only, no details.
- **2.6 Remove pre-auth leftovers (S).** Delete `claimLegacy`, `LegacyClaim`,
  `takeLegacyWorkspaceId` and the `ARCHLANG_APP_URL` fallback — after
  checking that the hosted deployment has no rows left with UUID workspace
  ids (move stragglers with `admin:transferWorkspace`). Keep the `/d/*` and
  `/s/*` redirects: links in the wild use them.
- **2.7 Migrations as code (S, then policy).** Self-hosters skip versions, so
  no schema change may depend on a hand-run step: widen the schema, backfill
  with an idempotent migration that the `deploy` step runs, narrow in a later
  release. Supported upgrade path: any release of a major version to the
  latest one; release notes call out schema changes.
- **2.8 Images and smoke test (M).** On a version tag, build multi-arch
  images to GHCR. A CI job boots the compose stack (backend, deploy, web) and
  checks `/api/health`, a share image and the MCP discovery documents; it runs
  on PRs that touch `apps/web/convex/`, `deploy/` or the Dockerfile.

## Phase 3 — Built-in auth (tier C)

Exit: on a fresh VM with only a GitHub OAuth app (or an OIDC provider, or
local mode) you can sign in, invite a teammate, connect Claude Code over MCP
OAuth, `archer login` and push/pull, and link a private repo. The hosted app
(Clerk) behaves exactly as before. The CLI end-to-end suite passes against
both the stand-in and the built-in authorization server.

What Clerk does today, and what replaces it:

| Clerk's job | Where | Built-in replacement |
| --- | --- | --- |
| Sign-in UI, GitHub SSO | `app/sign-in`, `app/sign-up` (`<SignIn/>`) | Archer's own sign-in page |
| Session, route protection | `middleware.ts` (`clerkMiddleware`, `auth.protect`) | The auth library's session check |
| JWT for Convex (template `convex`) | `convex/auth.config.ts`, `ConvexProviderWithClerk` | Library-issued JWT (JWKS) → a Convex `customJwt` provider; `ConvexProviderWithAuth` |
| Profile, sign-out | `AccountMenu.tsx` (`useUser`, `useClerk`) | The session user; library sign-out |
| MCP OAuth server: metadata, registration, consent, tokens | Clerk + `@clerk/mcp-tools` | The library's OAuth provider (3.4) |
| Token check at `/mcp` | `app/mcp/route.ts` (`verifyClerkToken`) | The library's token verification |
| Agent names for attribution | `clerkClient().oauthApplications.list` | `client_name` from the registration |
| The user's GitHub token | `lib/server/github.ts` (`getUserOauthAccessToken`) | The linked GitHub account (3.5) |
| Private-repo scope upgrade | `RepoDialog.tsx` (`reauthorize({ additionalScopes })`) | Re-link GitHub with `repo` (3.5) |

- **3.1 Auth seam (M–L, no behavior change).** `apps/web/lib/auth/` with a
  client side — `useSession()` (`{ loaded, signedIn, userId, user }`),
  `signOut()`, `<SignInScreen/>`, and the hook `ConvexProviderWithAuth`
  needs — and a server side: `protect()` for middleware, `currentUserId()`,
  `verifyMcpToken()` (→ `{ userId, clientId, clientName, scopes }`), the two
  `.well-known` handlers, `githubToken(userId)` and `requestGitHubScope()`.
  `ARCHER_AUTH=clerk|builtin|local` picks the implementation at runtime. Only
  `lib/auth/clerk/` may import `@clerk/*`; enforce it with a test, like the
  rule that all GitHub calls go through `githubApi.ts`.
- **3.2 Provider-agnostic Convex identity (M).** `convex/auth.config.ts`
  builds its providers from env: Clerk and/or a `customJwt` entry for the
  built-in issuer. `convex/access.ts` swaps the `user_…` regex for a check
  that fits both (ids must not contain `.`: the credential splits on the last
  one). Invites match by email only when `identity.emailVerified` is true, in
  `roleFor`, `workspaces.list` and `acceptInvites` — first make sure Clerk's
  `convex` JWT template carries `email_verified`, or hosted invites break.
  The personal workspace id stays equal to the user id.
- **3.3 Built-in sign-in (L).** Better Auth in the Next.js server:
  - Sign-in with GitHub (an OAuth App the operator registers) and, optionally,
    generic OIDC (Okta, Entra ID, Google Workspace, Keycloak, Authentik…). No
    email/password in v1: it needs SMTP for verification and resets, and
    invites depend on verified emails.
  - Storage: Better Auth's Convex component keeps users, sessions and OAuth
    clients in Convex — one datastore to back up — provided it supports the
    plugins below on a self-hosted backend. Otherwise use a SQL database (a
    SQLite volume, or the Postgres behind Convex). Settle this with a spike
    before 3.3.
  - A JWT plugin with a JWKS endpoint for Convex (3.2).
  - A sign-up policy, which Clerk's dashboard handles today:
    `ARCHER_SIGNUP=open|invite|domain:<list>|github-org:<org>`. People with a
    pending invite may always sign up. The first user becomes the instance
    owner (reserved for a later admin page; until then operators use the
    Convex dashboard).
  - Sign-in page and account menu built from `components/ui.tsx`.
- **3.4 Built-in MCP authorization server (L).**
  - Metadata per RFC 8414 (authorization server) and RFC 9728 (protected
    resource), at the paths where `@clerk/mcp-tools` serves them today.
  - Registration: dynamic client registration (RFC 7591), which Claude Code,
    the CLI and `test/host.ts` use today; add Client ID Metadata Documents if
    the current MCP spec revision prefers them. Registrations are untrusted:
    exact redirect-URI matching, with any loopback port allowed per RFC 8252.
  - Authorization code with PKCE (S256 only) and a consent screen naming the
    client, its redirect host and the scopes; remembered per client.
  - Short-lived access tokens bound to `<origin>/mcp` (RFC 8707 resource
    indicators), rotating refresh tokens, and a revocation endpoint
    (`archer logout` already calls `revocation_endpoint` when advertised).
    Rate limits on the registration and token endpoints.
  - "Connected agents" in the account menu, to list and revoke grants.
  - Tests: run `packages/cli/test/account.test.ts` against the real built-in
    server as well as the stand-in, and walk the flow with the MCP Inspector.
- **3.5 GitHub without Clerk (M).** `githubToken()` reads the GitHub account
  linked to the user; people who signed in with OIDC link one from the repo
  dialog (same OAuth app). Private repos re-link with the `repo` scope. Tokens
  are encrypted at rest. `GITHUB_API_URL` (and the OAuth base URL) makes
  GitHub Enterprise Server work. With no GitHub app configured, GitHub
  features stay hidden — the UI already handles `no_github_token`.
- **3.6 Local single-user mode (M, optional).** `ARCHER_AUTH=local`: the
  built-in provider with one implicit user, no sign-in screen, and `/mcp`
  without OAuth. It refuses to start unless bound to loopback. With Convex's
  local deployment, `git clone && pnpm install && pnpm dev` then works with no
  account at all — contributors included.
- **3.7 Defaults (S).** The compose stack defaults to `builtin`, with Clerk as
  an optional profile; the docs cover creating the GitHub OAuth app, OIDC and
  the sign-up policy; CONTRIBUTING drops Clerk.

## Phase 4 — Releases & upkeep

- **4.1 Versioning (M).** One semver version for the app and its image, with
  a `CHANGELOG.md`; the CLI keeps its own npm version. The MCP tool contract
  (`packages/mcp/src/contract.ts`, `REMOTE_SERVER_VERSION`) becomes a public
  API between servers and CLIs that upgrade independently: only additive
  changes within a major version, and `get_workspace_info` reports the server
  version so the CLI can say "server too old" instead of failing obscurely.
- **4.2 Launch (S).** README and docs cover self-hosting; announce. The hosted
  app runs the public code, with hosted-only behavior behind env flags and no
  private fork — that's the trust story.
- **4.3 Upkeep.** Dependabot; image rebuilds for base-image CVEs; a
  supported-versions matrix (Node, Convex backend); support is community
  support, stated as such in the README and SECURITY.md.
- **4.4 Later: hosted off Clerk.** One auth path instead of two. Import Clerk
  users into the built-in store keeping their `user_…` ids — otherwise every
  personal workspace id changes across `documents`, `revisions`, `drift`,
  `libraryTypes`, `members`, `workspaces` and `agentPrefs`. Users re-link
  GitHub, and every agent re-authorizes once.

## Configuration after all phases

| Variable | Phase | Purpose |
| --- | --- | --- |
| `ARCHER_PUBLIC_URL` | 1.1 | Public origin (replaces `NEXT_PUBLIC_SITE_URL`, `ARCHER_APP_URL` and friends) |
| `ARCHER_LANDING` | 1.2 | `on` (default) or `off` |
| `CONVEX_URL` | 2.1 | Public Convex URL, read at runtime (fallback: `NEXT_PUBLIC_CONVEX_URL`) |
| `CONVEX_INTERNAL_URL` | 2.4 | Optional Convex URL for server-side calls |
| `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY` | 2.3 | Function deploys to a self-hosted backend (the Convex CLI's names) |
| `CONVEX_DEPLOY_KEY` | existing | Function deploys to Convex cloud |
| `ARCHER_SERVICE_SECRET` | existing | Same value on web and Convex |
| `ARCHER_AUTH` | 3.1 | `clerk`, `builtin` or `local` |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` | 2.1 | Clerk mode; the publishable key drops its `NEXT_PUBLIC_` prefix |
| `ARCHER_AUTH_SECRET` | 3.3 | Signing and encryption secret for the built-in provider |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_API_URL` | 3.3, 3.5 | GitHub sign-in and repo linking; GitHub Enterprise |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | 3.3 | Generic OIDC sign-in |
| `ARCHER_SIGNUP` | 3.3 | Who may create an account |
| `CONTEXT_DEV_API_KEY` | existing | Scripts only |

Names are proposals; after 1.5 the schema is the single source of truth.

## Out of scope

An instance admin UI; SSO/SCIM provisioning; outgoing email (invites work
without it — the invitee signs in with the invited address); usage limits and
billing; high availability (a self-hosted Convex backend is a single node);
telemetry (Archer sends none today — keep it that way, and say so).

## Risks

- **Better Auth as an authorization server.** Its OAuth-provider support is
  younger than Clerk's hosted service. Spike before committing to 3.3/3.4:
  registration, PKCE, consent, refresh and revocation against Claude Code and
  the CLI, on the storage chosen in 3.3.
- **Convex's self-hosted backend is source-available**, under the Functional
  Source License (it converts to Apache 2.0 after two years), not an OSI
  license. Running it for your own instance is allowed; say so accurately
  instead of promising a fully open-source stack. Operators own their backups
  and upgrades.
- **Two auth paths** double the auth test matrix until 4.4. Mitigations: the
  seam (3.1), one end-to-end suite run against both, and doing 4.4 once tier
  C is proven.
- **MCP authorization spec churn.** Clerk tracks it for the hosted app; the
  built-in server has to track it itself. Client registration in particular
  is moving (dynamic registration vs. client metadata documents), so keep it
  behind one module.
- **Support load.** Set expectations early; issue templates ask for the
  version and deployment tier.

## Order

Phases 0 and 1 can run in parallel: 0 gates going public, not 1. In Phase 2,
2.1 → 2.2 → 2.3 → 2.4 is a chain; 2.5–2.7 are independent. Phase 3 starts
with 3.1 and 3.2, both safe to ship to the hosted app early; then 3.3 → 3.4,
with 3.5 and 3.6 after 3.3.
