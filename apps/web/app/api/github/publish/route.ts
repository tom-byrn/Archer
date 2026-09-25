import { SyncError, publishDocument, syncErrorResponse } from "@/lib/server/repoSync";
import { jsonBody, signedInActor, stringField } from "@/lib/server/routes";

export const dynamic = "force-dynamic";

/**
 * POST /api/github/publish  { workspaceId, documentId, mode: "pr" | "commit", message? }
 * Write the draft to the repository file, as a pull request (updated in
 * place while it's open) or a commit to the branch.
 * → PublishResult · 409 { code: "stale" } when the file moved: sync, then retry
 */
export async function POST(req: Request) {
  try {
    const actor = await signedInActor();
    const body = await jsonBody(req);
    const mode = body.mode ?? "pr";
    if (mode !== "pr" && mode !== "commit") throw new SyncError('mode must be "pr" or "commit".', 400, "bad_request");
    const message = typeof body.message === "string" ? body.message.slice(0, 200) : undefined;
    return Response.json(
      await publishDocument(actor, stringField(body, "workspaceId"), stringField(body, "documentId"), {
        mode,
        ...(message ? { message } : {}),
      }),
    );
  } catch (e) {
    return syncErrorResponse(e);
  }
}
