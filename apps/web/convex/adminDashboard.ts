import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireServer } from "./access";

/**
 * Reads for the admin dashboard (/admin-dashboard). Every one needs the bare
 * server credential (`svc_<ARCHER_SERVICE_SECRET>`): the web server checks
 * that the signed-in user is the admin (lib/server/admin.ts) and then reads
 * across all workspaces for them. No browser can call these.
 */

/** Row caps per read, so a busy window can't blow a query's read limit. */
const CAP = { revisions: 8000, sessions: 8000, toolCalls: 16000 } as const;

/** Everything the dashboard aggregates: all documents and workspaces, plus activity since `since`. */
export const overview = query({
  args: { apiKey: v.string(), since: v.number() },
  handler: async (ctx, { apiKey, since }) => {
    requireServer(apiKey);
    const documents = (await ctx.db.query("documents").collect()).map((d) => ({
      _id: d._id,
      createdAt: d._creationTime,
      workspaceId: d.workspaceId,
      title: d.title,
      updatedAt: d.updatedAt,
      lines: d.source.split("\n").length,
      bytes: d.source.length,
      shared: d.publicSlug !== undefined,
      repo: d.repo
        ? {
            owner: d.repo.owner,
            name: d.repo.name,
            branch: d.repo.branch,
            path: d.repo.path ?? null,
            problem: d.repo.problem?.message ?? null,
          }
        : null,
    }));
    const workspaces = (await ctx.db.query("workspaces").collect()).map((w) => ({
      _id: w._id,
      name: w.name,
      ownerId: w.ownerId,
      createdAt: w.createdAt,
    }));
    const members = (await ctx.db.query("members").collect()).map((m) => ({
      workspaceId: m.workspaceId,
      userId: m.userId ?? null,
      email: m.email,
      role: m.role,
      createdAt: m.createdAt,
    }));
    const revisions = (
      await ctx.db
        .query("revisions")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
        .order("desc")
        .take(CAP.revisions)
    ).map((r) => ({
      _id: r._id,
      documentId: r.documentId,
      workspaceId: r.workspaceId,
      createdAt: r.createdAt,
      author: r.author,
      summary: r.summary ?? null,
    }));
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_last_seen", (q) => q.gte("lastSeenAt", since))
        .order("desc")
        .take(CAP.sessions)
    ).map((s) => ({
      userId: s.userId,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      activeMs: s.activeMs,
      pageviews: s.pageviews,
      paths: s.paths,
      device: s.device ?? null,
    }));
    const toolCalls = (
      await ctx.db
        .query("toolCalls")
        .withIndex("by_at", (q) => q.gte("at", since))
        .order("desc")
        .take(CAP.toolCalls)
    ).map((t) => ({ userId: t.userId, tool: t.tool, agent: t.agent, ok: t.ok, ms: t.ms, at: t.at }));
    const libraryTypes = (await ctx.db.query("libraryTypes").collect()).map((t) => ({
      workspaceId: t.workspaceId,
      tag: t.tag,
    }));
    const truncated =
      revisions.length === CAP.revisions ||
      sessions.length === CAP.sessions ||
      toolCalls.length === CAP.toolCalls;
    return { documents, workspaces, members, revisions, sessions, toolCalls, libraryTypes, truncated };
  },
});

/** One document in full, with its history (no sources) and latest drift report. */
export const document = query({
  args: { apiKey: v.string(), id: v.string() },
  handler: async (ctx, { apiKey, id }) => {
    requireServer(apiKey);
    const docId = ctx.db.normalizeId("documents", id);
    const doc = docId ? await ctx.db.get(docId) : null;
    if (!doc) return null;
    const revisions = (
      await ctx.db
        .query("revisions")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .order("desc")
        .take(500)
    ).map((r) => ({
      _id: r._id,
      createdAt: r.createdAt,
      author: r.author,
      summary: r.summary ?? null,
      commit: r.commit ?? null,
    }));
    const drift = await ctx.db
      .query("drift")
      .withIndex("by_document", (q) => q.eq("documentId", doc._id))
      .first();
    const teamId = ctx.db.normalizeId("workspaces", doc.workspaceId);
    const team = teamId ? await ctx.db.get(teamId) : null;
    return {
      _id: doc._id,
      createdAt: doc._creationTime,
      workspaceId: doc.workspaceId,
      workspace: team ? { name: team.name, ownerId: team.ownerId } : null,
      title: doc.title,
      source: doc.source,
      updatedAt: doc.updatedAt,
      shared: doc.publicSlug !== undefined,
      repo: doc.repo ?? null,
      revisions,
      drift: drift ? { reportedAt: drift.reportedAt, findings: drift.findings.length } : null,
    };
  },
});

/** The source of one revision, to view a canvas as it was. */
export const revision = query({
  args: { apiKey: v.string(), id: v.string() },
  handler: async (ctx, { apiKey, id }) => {
    requireServer(apiKey);
    const revId = ctx.db.normalizeId("revisions", id);
    const r = revId ? await ctx.db.get(revId) : null;
    if (!r) return null;
    return {
      _id: r._id,
      documentId: r.documentId,
      title: r.title,
      source: r.source,
      createdAt: r.createdAt,
      author: r.author,
      summary: r.summary ?? null,
    };
  },
});

/** A user's recent sessions and tool calls, whatever their age. */
export const userActivity = query({
  args: { apiKey: v.string(), userId: v.string() },
  handler: async (ctx, { apiKey, userId }) => {
    requireServer(apiKey);
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(300)
    ).map((s) => ({
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      activeMs: s.activeMs,
      pageviews: s.pageviews,
      paths: s.paths,
      device: s.device ?? null,
    }));
    const toolCalls = (
      await ctx.db
        .query("toolCalls")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(500)
    ).map((t) => ({ tool: t.tool, agent: t.agent, ok: t.ok, ms: t.ms, at: t.at }));
    return { sessions, toolCalls };
  },
});
