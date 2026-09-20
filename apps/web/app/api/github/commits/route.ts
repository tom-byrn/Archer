import { NextRequest } from "next/server";
import { githubErrorResponse, githubTokenForCurrentUser, listCommits } from "@/lib/server/github";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/commits?repo=owner/name&branch=main&page=1&since=<ISO>
 * → { commits: GitHubCommit[], hasMore: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const { token } = await githubTokenForCurrentUser();
    const p = req.nextUrl.searchParams;
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(p.get("repo") ?? "");
    if (!m) return Response.json({ error: "repo must be owner/name" }, { status: 400 });
    const branch = p.get("branch") ?? "main";
    const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
    const since = p.get("since") ?? undefined;
    const result = await listCommits(token, m[1]!, m[2]!, branch, { page, perPage: 50, since });
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (e) {
    return githubErrorResponse(e);
  }
}
