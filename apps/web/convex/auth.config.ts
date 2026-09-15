import type { AuthConfig } from "convex/server";

// Clerk issues the JWTs; Convex validates them against Clerk's JWKS.
// CLERK_JWT_ISSUER_DOMAIN is the Clerk "Frontend API URL" of the instance
// (https://<slug>.clerk.accounts.dev in dev). Set it on the Convex
// deployment: `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://…`.
// The Clerk side needs a JWT template named "convex" (Clerk dashboard →
// JWT Templates → New → Convex).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://unconfigured.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
