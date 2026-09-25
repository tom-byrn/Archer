import "server-only";
import { auth } from "@clerk/nextjs/server";
import { SyncError, actorFor, type Actor, type FileRef } from "@/lib/server/repoSync";

/** Shared plumbing for the repo sync routes under app/api/github/*. */

/** The signed-in user as a sync Actor (with their GitHub token), or throw 401. */
export async function signedInActor(): Promise<Actor> {
  const { userId } = await auth();
  if (!userId) throw new SyncError("Sign in required", 401, "unauthenticated");
  return actorFor(userId);
}

/** The JSON body as an object, or throw 400. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new SyncError("Expected a JSON object body.", 400, "bad_request");
}

export function stringField(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") throw new SyncError(`Missing "${key}".`, 400, "bad_request");
  return v.trim();
}

const REPO = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;

/** owner/name → parts, or throw 400. */
export function parseRepo(full: string): { owner: string; name: string } {
  const m = REPO.exec(full.trim());
  if (!m) throw new SyncError("repo must be owner/name.", 400, "bad_request");
  return { owner: m[1]!, name: m[2]! };
}

/** `{ repo: "owner/name", branch, path }` → a FileRef, or throw 400. */
export function fileRef(body: Record<string, unknown>): FileRef {
  const path = stringField(body, "path").replace(/^\/+/, "");
  if (!path.endsWith(".arch")) throw new SyncError("The file must end in .arch.", 400, "bad_request");
  return { ...parseRepo(stringField(body, "repo")), branch: stringField(body, "branch"), path };
}
