import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const items = await ctx.db
      .query("libraryTypes")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return items.map(({ tag, name, color, glyph }) => ({ tag, name, color, glyph }));
  },
});

export const save = mutation({
  args: {
    workspaceId: v.string(),
    tag: v.string(),
    name: v.string(),
    color: v.string(),
    glyph: v.string(),
  },
  handler: async (ctx, { workspaceId, tag, name, color, glyph }) => {
    const existing = await ctx.db
      .query("libraryTypes")
      .withIndex("by_workspace_tag", (q) =>
        q.eq("workspaceId", workspaceId).eq("tag", tag),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { name, color, glyph });
    else await ctx.db.insert("libraryTypes", { workspaceId, tag, name, color, glyph });
  },
});

export const remove = mutation({
  args: { workspaceId: v.string(), tag: v.string() },
  handler: async (ctx, { workspaceId, tag }) => {
    const existing = await ctx.db
      .query("libraryTypes")
      .withIndex("by_workspace_tag", (q) =>
        q.eq("workspaceId", workspaceId).eq("tag", tag),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
