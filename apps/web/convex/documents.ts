import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generateSlug, requireWorkspace, roleFor } from "./access";
import { v, type Infer } from "convex/values";
import { author } from "./schema";

type Author = Infer<typeof author>;
const USER_AUTHOR: Author = { kind: "user" };

/** Consecutive user saves within this window collapse into one revision. */
const COALESCE_MS = 5 * 60_000;

export const list = query({
  args: { workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey);
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
  args: { id: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { id, workspaceId, apiKey }) => {
    const role = await requireWorkspace(ctx, workspaceId, apiKey);
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return null;
    return { ...doc, role };
  },
});

/** A document shared with "anyone with the link". No auth. */
export const getPublic = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (slug.length < 8) return null;
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_public_slug", (q) => q.eq("publicSlug", slug))
      .unique();
    if (!doc) return null;
    // Members get an "open in editor" affordance; everyone else just views.
    const role = await roleFor(ctx, doc.workspaceId);
    return { _id: doc._id, title: doc.title, source: doc.source, updatedAt: doc.updatedAt, role };
  },
});

/** Toggle "anyone with the link can view". Returns the slug (or null). */
export const setPublic = mutation({
  args: { id: v.id("documents"), workspaceId: v.string(), enabled: v.boolean() },
  handler: async (ctx, { id, workspaceId, enabled }) => {
    await requireWorkspace(ctx, workspaceId, undefined, "editor");
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) throw new Error("Document not found");
    if (!enabled) {
      await ctx.db.patch(id, { publicSlug: undefined });
      return null;
    }
    if (doc.publicSlug) return doc.publicSlug;
    const slug = generateSlug();
    await ctx.db.patch(id, { publicSlug: slug });
    return slug;
  },
});

/**
 * Append a revision. User saves coalesce into the previous revision when it
 * is also a user save made within COALESCE_MS; agent saves always append so
 * every agent change is individually reviewable.
 */
export async function recordRevision(
  ctx: MutationCtx,
  doc: Doc<"documents">,
  source: string,
  title: string,
  who: Author,
  summary?: string,
): Promise<Id<"revisions">> {
  const now = Date.now();
  let latest = await ctx.db
    .query("revisions")
    .withIndex("by_document", (q) => q.eq("documentId", doc._id))
    .order("desc")
    .first();
  // Documents that predate history: snapshot the state *before* this save so
  // the first agent edit is reviewable against something real.
  if (!latest) {
    const id = await ctx.db.insert("revisions", {
      workspaceId: doc.workspaceId,
      documentId: doc._id,
      source: doc.source,
      title: doc.title,
      createdAt: Math.min(doc.updatedAt, now - 1),
      author: USER_AUTHOR,
    });
    latest = await ctx.db.get(id);
    if (doc.seenRevisionAt === undefined)
      await ctx.db.patch(doc._id, { seenRevisionAt: Math.min(doc.updatedAt, now - 1) });
  }
  if (
    latest &&
    who.kind === "user" &&
    latest.author.kind === "user" &&
    now - latest.createdAt < COALESCE_MS
  ) {
    await ctx.db.patch(latest._id, { source, title, createdAt: now });
    return latest._id;
  }
  return ctx.db.insert("revisions", {
    workspaceId: doc.workspaceId,
    documentId: doc._id,
    source,
    title,
    createdAt: now,
    author: who,
    ...(summary ? { summary } : {}),
  });
}

export const create = mutation({
  args: {
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    title: v.string(),
    source: v.string(),
    author: v.optional(author),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, title, source, author: who, summary, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const now = Date.now();
    const id = await ctx.db.insert("documents", {
      workspaceId,
      title,
      source,
      updatedAt: now,
      seenRevisionAt: now,
    });
    await ctx.db.insert("revisions", {
      workspaceId,
      documentId: id,
      source,
      title,
      createdAt: now,
      author: who ?? USER_AUTHOR,
      ...(summary ? { summary } : {}),
    });
    return id;
  },
});

export const updateSource = mutation({
  args: {
    id: v.id("documents"),
    workspaceId: v.string(),
    apiKey: v.optional(v.string()),
    source: v.string(),
    title: v.string(),
    author: v.optional(author),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { id, workspaceId, source, title, author: who, summary, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return;
    if (doc.source === source && doc.title === title) return;
    const now = Date.now();
    const a = who ?? USER_AUTHOR;
    await ctx.db.patch(id, {
      source,
      title,
      updatedAt: now,
      // The user's own saves never count as unreviewed.
      ...(a.kind === "user" ? { seenRevisionAt: now } : {}),
    });
    await recordRevision(ctx, doc, source, title, a, summary);
  },
});

/** The user has reviewed every agent change up to now. */
export const markSeen = mutation({
  args: { id: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { id, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return;
    await ctx.db.patch(id, { seenRevisionAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("documents"), workspaceId: v.string(), apiKey: v.optional(v.string()) },
  handler: async (ctx, { id, workspaceId, apiKey }) => {
    await requireWorkspace(ctx, workspaceId, apiKey, "editor");
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return;
    for (const table of ["revisions", "threads", "drift"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_document", (q) => q.eq("documentId", id))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(id);
  },
});
