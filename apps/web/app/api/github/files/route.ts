import { NextRequest } from "next/server";
import { archFiles, syncErrorResponse } from "@/lib/server/repoSync";
import { parseRepo, signedInActor } from "@/lib/server/routes";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/files?repo=owner/name&branch=main
 * Every .arch file on the branch, read with the user's own GitHub access.
 * → { paths: string[], truncated: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const actor = await signedInActor();
    const { owner, name } = parseRepo(req.nextUrl.searchParams.get("repo") ?? "");
    const branch = req.nextUrl.searchParams.get("branch") ?? "main";
    return Response.json(await archFiles(actor, owner, name, branch));
  } catch (e) {
    return syncErrorResponse(e);
  }
}
