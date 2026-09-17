import { mutation, query } from "./_generated/server";
import { requireWorkspace } from "./access";
import { v } from "convex/values";
import { author } from "./schema";

const USER = { kind: "user" as const };

export const list = query({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, { documentId, workspaceId, status, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) return [];
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .order("desc")
      .collect();
    return status ? rows.filter((t) => t.status === status) : rows;
  },
});

export const create = mutation({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    path: v.string(),
    text: v.string(),
    author: v.optional(author),
  },
  handler: async (ctx, { documentId, workspaceId, path, text, author: who, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) throw new Error("Document not found");
    const now = Date.now();
    return ctx.db.insert("threads", {
      workspaceId,
      documentId,
      path,
      status: "open",
      createdAt: now,
      updatedAt: now,
      messages: [{ author: who ?? USER, text, at: now }],
    });
  },
});

export const reply = mutation({
  args: {
    id: v.id("threads"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    text: v.string(),
    author: v.optional(author),
  },
  handler: async (ctx, { id, workspaceId, text, author: who, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const t = await ctx.db.get(id);
    if (!t || t.workspaceId !== workspaceId) throw new Error("Thread not found");
    const now = Date.now();
    await ctx.db.patch(id, {
      messages: [...t.messages, { author: who ?? USER, text, at: now }],
      updatedAt: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("threads"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
  },
  handler: async (ctx, { id, workspaceId, status, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const t = await ctx.db.get(id);
    if (!t || t.workspaceId !== workspaceId) throw new Error("Thread not found");
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("threads"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { id, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const t = await ctx.db.get(id);
    if (!t || t.workspaceId !== workspaceId) return;
    await ctx.db.delete(id);
  },
});
