import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Authorization for everything keyed by `workspaceId`.
 *
 * A workspace is a user: its id is the Clerk user id (`identity.subject`).
 * Two ways in:
 *   1. A signed-in browser session whose user id equals `workspaceId`.
 *   2. An API key (issued in the app's "Connect an agent" dialog) that belongs
 *      to that workspace — this is how the MCP server authenticates.
 */
export async function requireWorkspace(
  ctx: QueryCtx | MutationCtx,
  workspaceId: string,
  apiKey?: string,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && identity.subject === workspaceId) return;
  if (apiKey) {
    const owner = await workspaceForKey(ctx, apiKey);
    if (owner === workspaceId) return;
  }
  throw new Error(
    identity
      ? "Not authorized for this workspace."
      : "Not signed in. Sign in with GitHub, or pass a valid API key.",
  );
}

/** The workspace an API key unlocks, or null. */
export async function workspaceForKey(
  ctx: QueryCtx | MutationCtx,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey.startsWith(KEY_PREFIX)) return null;
  const hash = await hashKey(apiKey);
  const row = await ctx.db
    .query("apiKeys")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .unique();
  return row?.workspaceId ?? null;
}

/** The signed-in user's id, or throw. */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  return identity.subject;
}

export const KEY_PREFIX = "archer_";

/** SHA-256 hex of a key; only hashes are stored. */
export async function hashKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh random key: prefix + 32 bytes base64url. */
export function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return KEY_PREFIX + b64;
}
