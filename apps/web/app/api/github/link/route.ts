import { linkFile, syncErrorResponse } from "@/lib/server/repoSync";
import { fileRef, jsonBody, signedInActor, stringField } from "@/lib/server/routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/github/link  { workspaceId, documentId, repo: "owner/name", branch, path }
 * "Move to GitHub": store an existing document in that file from now on.
 * (Stopping is the `repoSync.unlink` mutation; it needs no GitHub access.)
 * → { existed } — whether the file was already there (the next publish replaces it)
 */
export async function POST(req: Request) {
  try {
    const actor = await signedInActor();
    const body = await jsonBody(req);
    return Response.json(
      await linkFile(actor, stringField(body, "workspaceId"), stringField(body, "documentId"), fileRef(body)),
    );
  } catch (e) {
    return syncErrorResponse(e);
  }
}
