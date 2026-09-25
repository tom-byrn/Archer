import { createFromRepo, syncErrorResponse } from "@/lib/server/repoSync";
import { fileRef, jsonBody, signedInActor, stringField } from "@/lib/server/routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/github/projects  { workspaceId, repo: "owner/name", branch, path }
 * "From GitHub": a new document stored in that file — imported when the file
 * exists, else blank until the first publish creates it.
 * → { id, imported } · 422 { error, details: { errors } } when the file has errors
 */
export async function POST(req: Request) {
  try {
    const actor = await signedInActor();
    const body = await jsonBody(req);
    return Response.json(await createFromRepo(actor, stringField(body, "workspaceId"), fileRef(body)));
  } catch (e) {
    return syncErrorResponse(e);
  }
}
