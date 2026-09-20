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
| `CONTEXT_DEV_API_KEY` | | Brand-color lookups for custom types (optional) |

You do **not** set `NEXT_PUBLIC_CONVEX_URL` on Vercel: `convex deploy --cmd`
sets it for the build from the deploy key.

Redeploy after adding the variables. The first deploy without them still
succeeds (so the project links cleanly) — it just renders the setup panel.

## 4. Agents against the hosted app

Users create API keys in the app (avatar → Connect an agent). The MCP server
needs to know which backend to talk to:

```sh
claude mcp add archer \
  --env ARCHER_API_KEY=<key> \
  --env CONVEX_URL=https://<name>.convex.cloud \
  --env ARCHER_APP_URL=https://<your-vercel-domain> \
  -- pnpm --dir <repo>/packages/mcp start
```

## 5. Share images

Any document with *Share → Anyone with the link* enabled is viewable at
`/s/<slug>` and embeddable as an image:

```md
![Architecture](https://<your-domain>/s/<slug>/image.svg)
```

Append `?theme=dark` for the dark palette. The image is rendered from the
current document on every request and cached for one minute.
