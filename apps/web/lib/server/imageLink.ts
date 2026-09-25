import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived links to a project's diagram, for the MCP's
 * render_diagram: it hands agents a URL rather than the SVG itself, which for
 * a large diagram runs to tens of thousands of tokens. A token names the user
 * who asked, the workspace, the project and the theme, and expires;
 * app/api/render/[token] checks the signature and draws the project as that
 * user, so it only works while they can still read it. Signed with a key
 * derived from ARCHER_SERVICE_SECRET; nothing is stored.
 */

export const IMAGE_LINK_TTL_MS = 60 * 60_000;

export interface ImageClaim {
  userId: string;
  workspaceId: string;
  documentId: string;
  theme: "light" | "dark";
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** A key of its own, so these signatures mean nothing anywhere else the secret is used. */
const keyFor = (secret: string) => createHmac("sha256", secret).update("archer:image-link:v1").digest();
const signature = (payload: string, secret: string) => createHmac("sha256", keyFor(secret)).update(payload).digest();

/** A link token for `claim`, valid for IMAGE_LINK_TTL_MS. */
export function signImageLink(
  claim: Omit<ImageClaim, "expiresAt">,
  opts: { secret: string; now?: number },
): { token: string; expiresAt: number } {
  const expiresAt = (opts.now ?? Date.now()) + IMAGE_LINK_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ u: claim.userId, w: claim.workspaceId, d: claim.documentId, t: claim.theme, e: expiresAt }),
  ).toString("base64url");
  return { token: `${payload}.${signature(payload, opts.secret).toString("base64url")}`, expiresAt };
}

/** The claim a token carries; "expired" when it's genuine but too old; null when it isn't one of ours. */
export function verifyImageLink(token: string, opts: { secret: string; now?: number }): ImageClaim | "expired" | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = signature(payload, opts.secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let c: { u?: unknown; w?: unknown; d?: unknown; t?: unknown; e?: unknown };
  try {
    c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof c.u !== "string" ||
    typeof c.w !== "string" ||
    typeof c.d !== "string" ||
    (c.t !== "light" && c.t !== "dark") ||
    typeof c.e !== "number"
  )
    return null;
  if (c.e <= (opts.now ?? Date.now())) return "expired";
  return { userId: c.u, workspaceId: c.w, documentId: c.d, theme: c.t, expiresAt: c.e };
}
