import { NextRequest } from "next/server";
import { getRepo, githubErrorResponse, githubTokenForCurrentUser, listRepos } from "@/lib/server/github";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/repos?q=<filter>
 * Repos the signed-in user can see (needs a stored GitHub token). When `q`
 * looks like `owner/name`, that exact repo is looked up too, so public repos
 * outside the user's account can be linked.
 * → { repos: GitHubRepo[], hasToken: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const { token } = await githubTokenForCurrentUser();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const repos = token ? await listRepos(token, q) : [];
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(q.trim());
    if (m && !repos.some((r) => r.fullName.toLowerCase() === q.trim().toLowerCase())) {
      try {
        repos.unshift(await getRepo(token, m[1]!, m[2]!));
      } catch {
        // Not found or private — fall through with the list we have.
      }
    }
    return Response.json({ repos, hasToken: token !== null });
  } catch (e) {
    return githubErrorResponse(e);
  }
}
