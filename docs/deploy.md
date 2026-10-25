# Deploying Archer

Three services: **Convex** (database + functions), **Clerk** (GitHub sign-in),
**Vercel** (the Next.js app). Everything below is one-time setup; after it,
every push to `main` deploys.

## 1. Convex cloud

```sh
cd apps/web
npx convex login                 # browser sign-in, once per machine
npx convex deploy                # creates the production deployment and pushes functions
```

`npx convex deploy` prints the deployment name and URL
(`https://<name>.convex.cloud`). Then:

```sh
# Point the production deployment at your Clerk instance (see step 2).
npx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://<your-slug>.clerk.accounts.dev
```

Finally, in the Convex dashboard (Settings → Deploy keys) generate a
**Production deploy key**. Vercel will use it to push functions on every build.

Local development keeps using `npx convex dev` and the anonymous local
deployment; nothing changes there.

## 2. Clerk

1. Create the application at clerk.com (or move the dev one to production:
   Configure → Production instance; production needs a real domain).
2. **SSO connections** → enable **GitHub**. To let users link *private*
   repositories (commit timeline, `src` deep links), open the GitHub
   connection → *Use custom credentials* and add the `repo` scope; public
   repos work with the default scopes.
3. **JWT templates** → New → **Convex**. The template must be named `convex`.
   Its *Issuer* is the value for `CLERK_JWT_ISSUER_DOMAIN` above.
4. **Domains** → add the Vercel domain (and your custom domain, if any).
5. **API keys** → copy the publishable and secret keys for step 3.

## 3. Vercel

Create the project from the GitHub repo with **Root Directory** `apps/web`
(`apps/web/vercel.json` sets the framework and build command). Then add the
environment variables (Production, and Preview if you want previews to work):

| Variable | Value | Notes |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | `prod:…` from step 1 | The build runs `npx convex deploy --cmd 'pnpm build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`, which pushes functions and injects the deployment URL into the Next build. Without this key the build falls back to a plain `pnpm build` and the app shows its setup panel. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_…` | Clerk → API keys |
| `CLERK_SECRET_KEY` | `sk_…` | Clerk → API keys |

You do **not** set `NEXT_PUBLIC_CONVEX_URL` on Vercel: `convex deploy --cmd`
sets it for the build from the deploy key.

Redeploy after adding the variables. The first deploy without them still
succeeds (so the project links cleanly) — it just renders the setup panel.

## 4. Agents and the CLI (hosted MCP)

Agents and the `archer` CLI reach workspaces only through the app's MCP
server at `/mcp`, signing in with MCP-standard OAuth (Clerk is the
authorization server). There are no API keys. Setup:

1. **Clerk** → OAuth applications → enable **Dynamic client registration**
   (MCP clients, including the CLI, register themselves), and register
   `https://<your-domain>/mcp` as an MCP server / OAuth resource so access
   tokens carry it as their audience (`aud`). The route refuses tokens
   without it.
2. Generate a service secret, at least 32 characters
   (`openssl rand -base64 48`), and set the **same** value in both places:
   `npx convex env set --prod ARCHER_SERVICE_SECRET <value>` (from
   `apps/web`) and `ARCHER_SERVICE_SECRET` in the Vercel environment. The
   route uses it to act for the verified user; it never leaves the server.
3. Connect:

   ```sh
   claude mcp add --transport http archer https://<your-domain>/mcp
   npx archerctl login     # the CLI; add ARCHER_APP_URL=https://<your-domain>
                            # if that isn't the domain the CLI was built for
   ```

## 5. Repo sync (documents stored in a repository)

Documents can be stored in a `.arch` file in a GitHub repository
(`docs/repo-sync.md`). Reading and publishing use each user's Clerk GitHub
token, so private repositories need the `repo` scope (step 2). For the canvas
to follow pushes live, set a webhook secret and point GitHub at the app:

1. `openssl rand -hex 32` → `GITHUB_WEBHOOK_SECRET` in the Vercel environment.
2. Either add a **repository webhook** per repository (Settings → Webhooks:
   payload URL `https://<your-domain>/api/github/webhook`, content type
   `application/json`, that secret, events *Pushes* and *Pull requests*), or
   create a **GitHub App** with the same URL and secret, permissions
   *Contents* and *Pull requests* read & write (and *Metadata* read),
   subscribed to *Push* and *Pull request*, and set `GITHUB_APP_ID` and
   `GITHUB_APP_PRIVATE_KEY` (the PEM) in Vercel. Install the App on the
   repositories whose documents should sync.

Without a webhook, stored documents still catch up whenever someone opens them.

## 6. Share images

Any document with *Share → Anyone with the link* enabled is viewable at
`/share/<slug>` and embeddable as an image:

```md
![Architecture](https://<your-domain>/s/<slug>/image.svg)
```

Append `?theme=dark` for the dark palette. The image is rendered from the
current document on every request and cached for one minute.
