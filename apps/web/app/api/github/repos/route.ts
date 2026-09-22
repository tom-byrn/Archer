import { NextRequest } from "next/server";
import { getRepo, githubErrorResponse, githubTokenForCurrentUser, listRepos } from "@/lib/server/github";

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
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const { repos, privateAccess } = token
      ? await listRepos(token, q)
      : { repos: [], privateAccess: null };
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(q.trim());
    if (m && !repos.some((r) => r.fullName.toLowerCase() === q.trim().toLowerCase())) {
      try {
        repos.unshift(await getRepo(token, m[1]!, m[2]!));
      } catch {
        // Not found or private — fall through with the list we have.
      }
    }
    return Response.json({ repos, hasToken: token !== null, privateAccess });
  } catch (e) {
    return githubErrorResponse(e);
  }
}
