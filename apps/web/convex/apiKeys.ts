import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateKey, hashKey, requireWorkspace, workspaceForKey } from "./access";

/** Keys of a workspace (never the secret itself). Editors and owners may look. */
export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "editor");
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ _id, name, prefix, createdAt }) => ({ _id, name, prefix, createdAt }));
  },
});

/** Mint a key for a workspace. The plaintext is returned exactly once. */
export const create = mutation({
  args: { workspaceId: v.string(), name: v.string() },
  handler: async (ctx, { workspaceId, name }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "editor");
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
    const row = await ctx.db.get(id);
    if (!row) return;
    await requireWorkspace(ctx, row.workspaceId, undefined, "editor");
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
