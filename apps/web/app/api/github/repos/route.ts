import { NextRequest } from "next/server";
import { githubErrorResponse, githubTokenForCurrentUser, searchRepos } from "@/lib/server/github";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/repos?q=<filter>
 * Repos the signed-in user can see (needs a stored GitHub token). When `q`
 * looks like `owner/name`, that exact repo is looked up too, so public repos
 * outside the user's account can be linked.
 * `privateAccess` is false when the token lacks the `repo` scope, so GitHub
 * hides private repos (the dialog offers to re-grant it).
 * → { repos: GitHubRepo[], hasToken: boolean, privateAccess: boolean | null }
 */
export async function GET(req: NextRequest) {
  try {
    const { token } = await githubTokenForCurrentUser();
    return Response.json(await searchRepos(token, req.nextUrl.searchParams.get("q") ?? ""));
  } catch (e) {
    return githubErrorResponse(e);
  }
}
