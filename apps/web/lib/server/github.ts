import "server-only";
import { createSign } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { GitHubError, createInstallationToken, findRepoInstallation } from "@/lib/githubApi";

export * from "@/lib/githubApi";
export { verifyWebhookSignature } from "@/lib/githubWebhook";

/**
 * GitHub access for the signed-in user. The token is the OAuth token Clerk
 * stored when they signed in with GitHub; Clerk's default GitHub scopes read
 * public repos and the user's profile. Private repos need the `repo` scope
 * added to the GitHub connection in the Clerk dashboard (Configure → SSO
 * connections → GitHub → Use custom credentials → scopes).
 *
 * Repo sync can also act as the Archer GitHub App (`GITHUB_APP_ID` +
 * `GITHUB_APP_PRIVATE_KEY`, installed on the repository): push webhooks then
 * sync with nobody signed in, and people without write access of their own can
 * still publish. See docs/repo-sync.md.
 *
 * All calls go through `github()` so rate-limit and error handling live in
 * one place. Never call api.github.com anywhere else in the app.
 */

/** A user's GitHub token (from their Clerk GitHub sign-in), or null when none is stored. */
export async function githubTokenForUser(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserOauthAccessToken(userId, "github");
    return data[0]?.token ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user's GitHub token, or null when none is stored. */
export async function githubTokenForCurrentUser(): Promise<{ userId: string; token: string | null }> {
  const { userId } = await auth();
  if (!userId) throw new GitHubError("Sign in required", 401, "unauthenticated");
  return { userId, token: await githubTokenForUser(userId) };
}

/* ---------------------------------------------------------------- GitHub App */

const appCredentials = (): { id: string; key: string } | null => {
  const id = process.env.GITHUB_APP_ID?.trim();
  // Env files often carry the PEM with escaped newlines.
  const key = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return id && key ? { id, key } : null;
};

export const githubAppConfigured = (): boolean => appCredentials() !== null;

const base64url = (data: string | Buffer): string => Buffer.from(data).toString("base64url");

/** A JWT that authenticates as the App itself (RS256, valid for 9 minutes). */
function appJwt(): string | null {
  const app = appCredentials();
  if (!app) return null;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: app.id }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(app.key);
  return `${unsigned}.${base64url(signature)}`;
}

// Installation tokens last an hour. They belong to the App's installation,
// not to any user, so caching them per installation is safe.
const installationTokens = new Map<number, { token: string; expiresAt: number }>();

/**
 * A token acting as the App's installation on `owner/name` (the webhook
 * payload names the installation; otherwise it's looked up). Null when the App
 * isn't configured or isn't installed on the repository.
 */
export async function appTokenForRepo(owner: string, name: string, installationId?: number): Promise<string | null> {
  const jwt = appJwt();
  if (!jwt) return null;
  const id = installationId ?? (await findRepoInstallation(jwt, owner, name));
  if (id === null) return null;
  const cached = installationTokens.get(id);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const fresh = await createInstallationToken(jwt, id);
  installationTokens.set(id, fresh);
  return fresh.token;
}

/** Map a GitHubError to an HTTP JSON response. */
export function githubErrorResponse(e: unknown): Response {
  if (e instanceof GitHubError)
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  return Response.json({ error: "GitHub request failed", code: "upstream" }, { status: 502 });
}
