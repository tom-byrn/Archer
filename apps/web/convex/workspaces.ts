import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./access";

/** The signed-in user's workspace id (= Clerk user id), or null. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      workspaceId: identity.subject,
      name: identity.name ?? identity.nickname ?? null,
      email: identity.email ?? null,
      image: identity.pictureUrl ?? null,
    };
  },
});

const TABLES = ["documents", "libraryTypes", "revisions", "threads", "drift"] as const;

/**
 * Move everything from a pre-auth anonymous workspace (the UUID the browser
 * generated before sign-in existed) into the signed-in user's workspace.
 * Knowing the UUID is the credential, exactly as it was before auth.
 */
export const claimLegacy = mutation({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }) => {
    const workspaceId = await requireUser(ctx);
    // Only anonymous UUIDs are claimable — never another user's id.
    if (!/^[0-9a-f-]{36}$/i.test(legacyId) || legacyId === workspaceId) return { moved: 0 };
    let moved = 0;
    for (const table of TABLES) {
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
