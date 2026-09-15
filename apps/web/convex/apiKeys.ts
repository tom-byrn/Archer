import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateKey, hashKey, requireUser, workspaceForKey } from "./access";

/** Keys of the signed-in user (never the secret itself). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", identity.subject))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ _id, name, prefix, createdAt }) => ({ _id, name, prefix, createdAt }));
  },
});

/** Mint a key. The plaintext is returned exactly once. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const workspaceId = await requireUser(ctx);
    const key = generateKey();
    const id = await ctx.db.insert("apiKeys", {
      workspaceId,
      name: name.trim() === "" ? "Agent" : name.trim(),
      hash: await hashKey(key),
      prefix: key.slice(0, 14),
      createdAt: Date.now(),
    });
    return { id, key };
  },
});

export const revoke = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const workspaceId = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.workspaceId !== workspaceId) return;
    await ctx.db.delete(id);
  },
});

/** Used by the MCP server at startup to learn which workspace a key opens. */
export const resolve = query({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    const workspaceId = await workspaceForKey(ctx, apiKey);
    return workspaceId ? { workspaceId } : null;
  },
});
