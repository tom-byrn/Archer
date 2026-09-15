import { query } from "./_generated/server";
import { requireWorkspace } from "./access";
import { v } from "convex/values";

/** Revision metadata, newest first (no sources — use `get`/`listFull`). */
export const list = query({
  args: { documentId: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { documentId, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) return [];
    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .order("desc")
      .collect();
    return rows.map(({ _id, createdAt, author, summary, title }) => ({
      _id,
      createdAt,
      author,
      summary,
      title,
    }));
  },
});

/** Revisions with sources, newest first, capped (for diffs and MCP history). */
export const listFull = query({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { documentId, workspaceId, limit, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) return [];
    return ctx.db
      .query("revisions")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 50, 1), 200));
  },
});

export const get = query({
  args: { id: v.id("revisions"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { id, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const rev = await ctx.db.get(id);
    if (!rev || rev.workspaceId !== workspaceId) return null;
    return rev;
  },
});

/**
 * The revision the user last reviewed: the newest one created at or before the
 * document's `seenRevisionAt`. Diffing it against the current source yields
 * everything agents changed since the user last looked.
 */
export const baseline = query({
  args: { documentId: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { documentId, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) return null;
    if (doc.seenRevisionAt !== undefined) {
      const seenAt = doc.seenRevisionAt;
      const rev = await ctx.db
        .query("revisions")
        .withIndex("by_document", (q) =>
          q.eq("documentId", documentId).lte("createdAt", seenAt),
        )
        .order("desc")
        .first();
      if (rev) return rev;
    }
    // Never reviewed: the newest user revision, else the oldest revision.
    const all = await ctx.db
      .query("revisions")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .order("desc")
      .collect();
    return all.find((r) => r.author.kind === "user") ?? all[all.length - 1] ?? null;
  },
});
