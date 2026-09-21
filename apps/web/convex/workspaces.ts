import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { effectiveUser, requireIdentity, requireUser, requireWorkspace } from "./access";
import { role } from "./schema";

/** The signed-in user's identity, or null. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      userId: identity.subject,
      /** The personal workspace id (== user id). */
      workspaceId: identity.subject,
      name: identity.name ?? identity.nickname ?? null,
      email: identity.email ?? null,
      image: identity.pictureUrl ?? null,
    };
  },
});

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
  /** Pending invite: the user can see it but has not signed in as a member yet. */
  pending?: boolean;
}

/** Every workspace the user can open: personal first, then teams by name. */
export const list = query({
  args: { apiKey: v.optional(v.string()) },
  handler: async (ctx, { apiKey }): Promise<WorkspaceSummary[]> => {
    const who = await effectiveUser(ctx, apiKey);
    if (!who) return [];
    const out: WorkspaceSummary[] = [
      { id: who.userId, name: "Personal", kind: "personal", role: "owner" },
    ];
    const seen = new Set<string>();
    const rows: Doc<"members">[] = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", who.userId))
      .collect();
    if (who.email) {
      const email = who.email;
      const invites = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      for (const inv of invites) if (!inv.userId) rows.push(inv);
    }
    for (const m of rows) {
      if (seen.has(m.workspaceId)) continue;
      seen.add(m.workspaceId);
      const ws = await ctx.db.get(m.workspaceId as Doc<"workspaces">["_id"]);
      if (!ws) continue;
      out.push({
        id: ws._id,
        name: ws.name,
        kind: "team",
        role: m.role,
        ...(m.userId ? {} : { pending: true }),
      });
    }
    return [out[0]!, ...out.slice(1).sort((a, b) => a.name.localeCompare(b.name))];
  },
});

/** Bind pending invites addressed to my email to my user id. Call on sign-in. */
export const acceptInvites = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = identity.email?.toLowerCase();
    if (!email) return { accepted: 0 };
    const invites = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    let accepted = 0;
    for (const inv of invites) {
      if (inv.userId) continue;
      await ctx.db.patch(inv._id, { userId: identity.subject });
      accepted++;
    }
    return { accepted };
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await requireIdentity(ctx);
    const trimmed = name.trim();
    if (trimmed === "") throw new Error("Workspace name is required.");
    const id = await ctx.db.insert("workspaces", {
      name: trimmed,
      ownerId: identity.subject,
      createdAt: Date.now(),
    });
    await ctx.db.insert("members", {
      workspaceId: id,
      userId: identity.subject,
      email: identity.email?.toLowerCase() ?? "",
      role: "owner",
      invitedBy: identity.subject,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const rename = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, { workspaceId, name }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "owner");
    const trimmed = name.trim();
    if (trimmed === "") throw new Error("Workspace name is required.");
    await ctx.db.patch(workspaceId, { name: trimmed });
  },
});

const DATA_TABLES = ["documents", "libraryTypes", "revisions", "drift", "apiKeys"] as const;

/** Delete a team workspace and everything in it. */
export const remove = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "owner");
    for (const table of DATA_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);
    await ctx.db.delete(workspaceId);
  },
});

/** Members of a team workspace (any member may look). */
export const members = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "viewer");
    const rows = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ _id, userId, email, role, createdAt }) => ({
        _id,
        email,
        role,
        createdAt,
        pending: !userId,
      }));
  },
});

export const invite = mutation({
  args: { workspaceId: v.id("workspaces"), email: v.string(), role },
  handler: async (ctx, { workspaceId, email, role: r }) => {
    const identity = await requireIdentity(ctx);
    await requireWorkspace(ctx, workspaceId, undefined, "owner");
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new Error("Enter a valid email address.");
    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_email", (q) => q.eq("workspaceId", workspaceId).eq("email", addr))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { role: r });
      return existing._id;
    }
    return ctx.db.insert("members", {
      workspaceId,
      email: addr,
      role: r,
      invitedBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const setRole = mutation({
  args: { memberId: v.id("members"), role },
  handler: async (ctx, { memberId, role: r }) => {
    const m = await ctx.db.get(memberId);
    if (!m) throw new Error("Member not found.");
    await requireWorkspace(ctx, m.workspaceId, undefined, "owner");
    if (m.role === "owner" && r !== "owner") await ensureAnotherOwner(ctx, m);
    await ctx.db.patch(memberId, { role: r });
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const m = await ctx.db.get(memberId);
    if (!m) return;
    await requireWorkspace(ctx, m.workspaceId, undefined, "owner");
    if (m.role === "owner") await ensureAnotherOwner(ctx, m);
    await ctx.db.delete(memberId);
  },
});

/** Leave a team workspace (owners must hand off first). */
export const leave = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await requireUser(ctx);
    const m = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
      .first();
    if (!m) return;
    if (m.role === "owner") await ensureAnotherOwner(ctx, m);
    await ctx.db.delete(m._id);
  },
});

async function ensureAnotherOwner(
  ctx: { db: { query: (t: "members") => any } },
  m: Doc<"members">,
): Promise<void> {
  const owners = (await ctx.db
    .query("members")
    .withIndex("by_workspace", (q: any) => q.eq("workspaceId", m.workspaceId))
    .collect()) as Doc<"members">[];
  if (!owners.some((o) => o.role === "owner" && o.userId && o._id !== m._id))
    throw new Error("A workspace needs at least one other signed-in owner first.");
}

/**
 * Move everything from a pre-auth anonymous workspace (the UUID the browser
 * generated before sign-in existed) into the signed-in user's personal
 * workspace. Knowing the UUID is the credential, exactly as it was before auth.
 */
export const claimLegacy = mutation({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }) => {
    const workspaceId = await requireUser(ctx);
    if (!/^[0-9a-f-]{36}$/i.test(legacyId) || legacyId === workspaceId) return { moved: 0 };
    let moved = 0;
    for (const table of ["documents", "libraryTypes", "revisions", "drift"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", legacyId))
        .collect();
      for (const r of rows) {
        await ctx.db.patch(r._id, { workspaceId });
        moved++;
      }
    }
    return { moved };
  },
});
