import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { effectiveUser, roleFor } from "./access";

/**
 * The workspace a user's OAuth-connected agents act on. Called by the hosted
 * MCP route with a service credential (or by the signed-in user). Returns null
 * when nothing is set or the user lost access — callers fall back to Personal.
 */
export const get = query({
  args: { apiKey: v.optional(v.string()) },
  handler: async (ctx, { apiKey }) => {
    const who = await effectiveUser(ctx, apiKey);
    if (!who) throw new Error("Not signed in.");
    const pref = await ctx.db
      .query("agentPrefs")
      .withIndex("by_user", (q) => q.eq("userId", who.userId))
      .first();
    if (!pref) return null;
    const role = await roleFor(ctx, pref.workspaceId, apiKey);
    return role ? { workspaceId: pref.workspaceId, role } : null;
  },
});

export const set = mutation({
  args: { apiKey: v.optional(v.string()), workspaceId: v.string() },
  handler: async (ctx, { apiKey, workspaceId }) => {
    const who = await effectiveUser(ctx, apiKey);
    if (!who) throw new Error("Not signed in.");
    const role = await roleFor(ctx, workspaceId, apiKey);
    if (!role) throw new Error("You are not a member of that workspace.");
    const existing = await ctx.db
      .query("agentPrefs")
      .withIndex("by_user", (q) => q.eq("userId", who.userId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { workspaceId });
    else await ctx.db.insert("agentPrefs", { userId: who.userId, workspaceId });
    return { workspaceId, role };
  },
});
