import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireWorkspace, requireUser } from "./access";

/**
 * The first-run walkthrough (components/Tour.tsx). A new account sees it on
 * the dashboard until it creates its first document through it (the tour then
 * continues in that document's editor) or presses Skip.
 *
 * - "dashboard": no row, and nothing in the personal workspace yet.
 * - "editor": the tour runs in `documentId`'s editor.
 * - "off": finished, skipped, or an account that already had documents.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { status: "off" as const };
    const userId = identity.subject;
    const row = await ctx.db
      .query("onboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) {
      return row.status === "editor" && row.documentId
        ? { status: "editor" as const, documentId: row.documentId }
        : { status: "off" as const };
    }
    // Accounts that made documents before the tour existed (or through an
    // agent) never see it.
    const anyDoc = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", userId))
      .first();
    return { status: anyDoc ? ("off" as const) : ("dashboard" as const) };
  },
});

async function save(
  ctx: MutationCtx,
  userId: string,
  fields: { status: "editor" | "done" | "skipped"; documentId?: Id<"documents"> },
) {
  const row = await ctx.db
    .query("onboarding")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const next = { ...fields, updatedAt: Date.now() };
  if (row) await ctx.db.replace(row._id, { userId, ...next });
  else await ctx.db.insert("onboarding", { userId, ...next });
}

/** The tour created its document: continue there. */
export const startEditor = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");
    await requireWorkspace(ctx, doc.workspaceId, undefined, "editor");
    await save(ctx, userId, { status: "editor", documentId });
  },
});

/** Finished the last step, or pressed Skip: never show the tour again. */
export const end = mutation({
  args: { how: v.union(v.literal("done"), v.literal("skipped")) },
  handler: async (ctx, { how }) => {
    const userId = await requireUser(ctx);
    await save(ctx, userId, { status: how });
  },
});
