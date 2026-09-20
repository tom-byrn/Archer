import { NextRequest } from "next/server";
import { githubErrorResponse, githubTokenForCurrentUser, listBranches } from "@/lib/server/github";

export const dynamic = "force-dynamic";

/** GET /api/github/branches?repo=owner/name → { branches: GitHubBranch[] } */
export async function GET(req: NextRequest) {
  try {
    const { token } = await githubTokenForCurrentUser();
    const repo = req.nextUrl.searchParams.get("repo") ?? "";
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repo);
    if (!m) return Response.json({ error: "repo must be owner/name" }, { status: 400 });
    return Response.json({ branches: await listBranches(token, m[1]!, m[2]!) });
  } catch (e) {
    return githubErrorResponse(e);
  }
}
