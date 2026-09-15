import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ _id, title, updatedAt, source }) => ({ _id, title, updatedAt, source }));
  },
});

export const get = query({
  args: { id: v.id("documents"), workspaceId: v.string() },
  handler: async (ctx, { id, workspaceId }) => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return null;
    return doc;
  },
});

export const create = mutation({
  args: { workspaceId: v.string(), title: v.string(), source: v.string() },
  handler: async (ctx, { workspaceId, title, source }) =>
    ctx.db.insert("documents", {
      workspaceId,
      title,
      source,
      updatedAt: Date.now(),
    }),
});

export const updateSource = mutation({
  args: {
    id: v.id("documents"),
    workspaceId: v.string(),
    source: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { id, workspaceId, source, title }) => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { source, title, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("documents"), workspaceId: v.string() },
  handler: async (ctx, { id, workspaceId }) => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return;
    await ctx.db.delete(id);
  },
});
