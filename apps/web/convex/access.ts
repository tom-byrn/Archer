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
 * Every caller is a user. Browsers sign in with Clerk. Agents and the CLI sign
 * in to the hosted MCP route (Clerk OAuth), which then acts for the user with a
 * *service credential*: `svc_<ARCHER_SERVICE_SECRET>.<userId>`, passed in the
 * functions' `apiKey` argument (named before API keys were removed). It is
 * only ever held server-side.
 *
 * Queries need "viewer", document mutations "editor", and member / workspace
 * management "owner".
 */
export async function requireWorkspace(
  ctx: QueryCtx | MutationCtx,
  workspaceId: string,
  serviceKey?: string,
  need: Role = "viewer",
): Promise<Role> {
  const role = await roleFor(ctx, workspaceId, serviceKey);
  if (role && atLeast(role, need)) return role;
  if (role) throw new Error(`This needs ${need} access; you are a ${role}.`);
  const who = await effectiveUser(ctx, serviceKey);
  throw new Error(who ? "Not authorized for this workspace." : "Not signed in.");
}

/**
 * Who is calling: the signed-in browser user, or the user a trusted server is
 * acting for via a service credential. Null when anonymous.
 */
export async function effectiveUser(
  ctx: QueryCtx | MutationCtx,
  serviceKey?: string,
): Promise<{ userId: string; email: string | null } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return { userId: identity.subject, email: identity.email?.toLowerCase() ?? null };
  const acting = serviceUser(serviceKey);
  return acting ? { userId: acting, email: null } : null;
}

const SERVICE_PREFIX = "svc_";

/** Whether `given` is the deployment's service secret (constant time). */
function isServiceSecret(given: string): boolean {
  const secret = process.env.ARCHER_SERVICE_SECRET;
  if (!secret || secret.length < 32 || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** The user id a valid service credential acts for, else null. */
function serviceUser(serviceKey?: string): string | null {
  if (!serviceKey || !serviceKey.startsWith(SERVICE_PREFIX)) return null;
  const body = serviceKey.slice(SERVICE_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = body.slice(dot + 1);
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) return null;
  return isServiceSecret(body.slice(0, dot)) ? userId : null;
}

/**
 * The user a server-held service credential acts for. Throws for any other
 * caller: some writes must only come through the web server, because it checks
 * something first that a browser could skip (repo sync verifies the user can
 * read a repository before linking a document to it).
 */
export function requireServiceUser(serviceKey?: string): string {
  const userId = serviceUser(serviceKey);
  if (!userId) throw new Error("Only the Archer server can do this.");
  return userId;
}

/**
 * The bare server credential, `svc_<ARCHER_SERVICE_SECRET>` with no user: the
 * web server acting for itself before it knows which user to act as. Two
 * callers need it: a GitHub push webhook, to find the documents stored in the
 * pushed repository (`repoSync.documentsForPush`; everything it then changes
 * is done as a user), and the admin dashboard's reads
 * (`convex/adminDashboard.ts`), which the web server makes only after checking
 * the signed-in user is the admin (`lib/server/admin.ts`).
 */
export function requireServer(serviceKey?: string): void {
  if (!serviceKey?.startsWith(SERVICE_PREFIX) || !isServiceSecret(serviceKey.slice(SERVICE_PREFIX.length)))
    throw new Error("Not authorized.");
}

/** The caller's role in a workspace, or null. */
export async function roleFor(
  ctx: QueryCtx | MutationCtx,
  workspaceId: string,
  serviceKey?: string,
): Promise<Role | null> {
  const who = await effectiveUser(ctx, serviceKey);
  if (!who) return null;
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
  return null;
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

const randomToken = (bytes: number): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/** A public share slug: 12 bytes base64url (16 chars). */
export const generateSlug = (): string => randomToken(12);
