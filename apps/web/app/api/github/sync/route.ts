import { SyncError, syncErrorResponse, syncWith } from "@/lib/server/repoSync";
import { jsonBody, signedInActor, stringField } from "@/lib/server/routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/github/sync  { workspaceId, documentId, resolve?: "draft" | "repo" }
 * Bring a stored document up to date with its file (the editor calls this on
 * open and when the tab regains focus). With `resolve`, settle a recorded
 * conflict by keeping the draft's or the repository's side, then sync again.
 * → SyncOutcome (lib/server/repoSync.ts)
 */
export async function POST(req: Request) {
  try {
    const actor = await signedInActor();
    const body = await jsonBody(req);
    const workspaceId = stringField(body, "workspaceId");
    const documentId = stringField(body, "documentId");
    const resolve = body.resolve === "draft" || body.resolve === "repo" ? body.resolve : undefined;
    if (body.resolve !== undefined && resolve === undefined)
      throw new SyncError('resolve must be "draft" or "repo".', 400, "bad_request");
    return Response.json(await syncWith(actor, workspaceId, documentId, resolve));
  } catch (e) {
    return syncErrorResponse(e);
  }
}
