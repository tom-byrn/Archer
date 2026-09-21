import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Role = "owner" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
export const atLeast = (have: Role, need: Role): boolean => RANK[have] >= RANK[need];

/**
 * Authorization for everything keyed by `workspaceId`.
 *
 * Workspaces come in two shapes:
 *   - personal: the id IS the Clerk user id; the user is its owner.
 *   - team: a row in `workspaces`; access comes from `members` (by user id, or
 *     by email for invitees who have not signed in yet).
 * Agents authenticate with an API key bound to a workspace; keys act as editors.
 * The hosted MCP route authenticates users itself (Clerk OAuth) and then acts
 * for them with a *service credential*: `svc_<ARCHER_SERVICE_SECRET>.<userId>`
 * passed in the same `apiKey` argument. It is only ever held server-side.
 *
 * Queries need "viewer", document mutations "editor", and member / key /
 * workspace management "owner".
 */
export async function requireWorkspace(
  ctx: QueryCtx | MutationCtx,
  workspaceId: string,
  apiKey?: string,
  need: Role = "viewer",
): Promise<Role> {
  const role = await roleFor(ctx, workspaceId, apiKey);
  if (role && atLeast(role, need)) return role;
  if (role) throw new Error(`This needs ${need} access; you are a ${role}.`);
  const identity = await ctx.auth.getUserIdentity();
  throw new Error(
    identity
      ? "Not authorized for this workspace."
      : "Not signed in. Sign in with GitHub, or pass a valid API key.",
  );
}

/**
 * Who is calling: the signed-in browser user, or the user a trusted server is
 * acting for via a service credential. Null for anonymous / plain API keys.
 */
export async function effectiveUser(
  ctx: QueryCtx | MutationCtx,
  apiKey?: string,
): Promise<{ userId: string; email: string | null } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return { userId: identity.subject, email: identity.email?.toLowerCase() ?? null };
  const acting = serviceUser(apiKey);
  return acting ? { userId: acting, email: null } : null;
}

const SERVICE_PREFIX = "svc_";

/** The user id a valid service credential acts for, else null. */
function serviceUser(apiKey?: string): string | null {
  if (!apiKey || !apiKey.startsWith(SERVICE_PREFIX)) return null;
  const secret = process.env.ARCHER_SERVICE_SECRET;
  if (!secret || secret.length < 32) return null;
  const body = apiKey.slice(SERVICE_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const given = body.slice(0, dot);
  const userId = body.slice(dot + 1);
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) return null;
  // Constant-time comparison.
  if (given.length !== secret.length) return null;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0 ? userId : null;
}

/** The caller's role in a workspace, or null. */
export async function roleFor(
  ctx: QueryCtx | MutationCtx,
  workspaceId: string,
  apiKey?: string,
): Promise<Role | null> {
  const who = await effectiveUser(ctx, apiKey);
  if (who) {
    if (who.userId === workspaceId) return "owner";
    const byUser = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", who.userId),
      )
      .first();
    if (byUser) return byUser.role;
    if (who.email) {
      const email = who.email;
      const byEmail = await ctx.db
        .query("members")
        .withIndex("by_workspace_email", (q) =>
          q.eq("workspaceId", workspaceId).eq("email", email),
        )
        .first();
      if (byEmail) return byEmail.role;
    }
  }
  if (apiKey && !apiKey.startsWith(SERVICE_PREFIX)) {
    const owner = await workspaceForKey(ctx, apiKey);
    if (owner === workspaceId) return "editor";
  }
  return null;
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

/** The signed-in user's identity, or throw. */
export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  return identity;
}

/** The signed-in user's id, or throw. */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<string> {
  return (await requireIdentity(ctx)).subject;
}

export const KEY_PREFIX = "archer_";

/** SHA-256 hex of a key; only hashes are stored. */
export async function hashKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const randomToken = (bytes: number): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/** A fresh random API key: prefix + 32 bytes base64url. */
export const generateKey = (): string => KEY_PREFIX + randomToken(32);

/** A public share slug: 12 bytes base64url (16 chars). */
export const generateSlug = (): string => randomToken(12);
