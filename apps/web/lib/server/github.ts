import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { GitHubError } from "@/lib/githubApi";

export * from "@/lib/githubApi";

/**
 * GitHub access for the signed-in user. The token is the OAuth token Clerk
 * stored when they signed in with GitHub; Clerk's default GitHub scopes read
 * public repos and the user's profile. Private repos need the `repo` scope
 * added to the GitHub connection in the Clerk dashboard (Configure → SSO
 * connections → GitHub → Use custom credentials → scopes).
 *
 * All calls go through `github()` so rate-limit and error handling live in
 * one place. Never call api.github.com anywhere else in the app.
 */

/** The signed-in user's GitHub token, or null when none is stored. */
export async function githubTokenForCurrentUser(): Promise<{ userId: string; token: string | null }> {
  const { userId } = await auth();
  if (!userId) throw new GitHubError("Sign in required", 401, "unauthenticated");
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserOauthAccessToken(userId, "github");
    return { userId, token: data[0]?.token ?? null };
  } catch {
    return { userId, token: null };
  }
}

/** Map a GitHubError to an HTTP JSON response. */
export function githubErrorResponse(e: unknown): Response {
  if (e instanceof GitHubError)
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  return Response.json({ error: "GitHub request failed", code: "upstream" }, { status: 502 });
}
