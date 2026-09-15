import { mutation, query } from "./_generated/server";
import { requireWorkspace } from "./access";
import { v } from "convex/values";
import { author, driftStatus } from "./schema";

export const finding = v.object({
  status: driftStatus,
  path: v.optional(v.string()),
  name: v.optional(v.string()),
  src: v.optional(v.string()),
  note: v.optional(v.string()),
});

/** The latest drift report for a document, or null. */
export const get = query({
  args: { documentId: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { documentId, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) return null;
    return ctx.db
      .query("drift")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .order("desc")
      .first();
  },
});

/** Replace the document's drift report. An empty findings list means "in sync". */
export const report = mutation({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    findings: v.array(finding),
    author: v.optional(author),
  },
  handler: async (ctx, { documentId, workspaceId, findings, author: who, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.workspaceId !== workspaceId) throw new Error("Document not found");
    const old = await ctx.db
      .query("drift")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
    return ctx.db.insert("drift", {
      workspaceId,
      documentId,
      reportedAt: Date.now(),
      author: who ?? { kind: "agent", name: "agent" },
      findings,
    });
  },
});

/** Drop one finding (e.g. after the user acted on it). */
export const dismiss = mutation({
  args: { id: v.id("drift"), workspaceId: v.string(), apiKey: v.optional(v.string()), index: v.number() },
  handler: async (ctx, { id, workspaceId, index, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const r = await ctx.db.get(id);
    if (!r || r.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { findings: r.findings.filter((_, i) => i !== index) });
  },
});

export const clear = mutation({
  args: { documentId: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { documentId, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
    const rows = await ctx.db
      .query("drift")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    for (const r of rows) if (r.workspaceId === workspaceId) await ctx.db.delete(r._id);
  },
});
