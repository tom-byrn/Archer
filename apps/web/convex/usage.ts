import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireServiceUser, requireUser } from "./access";

/**
 * Usage recording for the admin dashboard (convex/adminDashboard.ts). Nothing
 * here is read back by the product itself.
 */

/** How often UsageBeacon beats; a beat never adds more active time than this plus slack. */
export const BEAT_MS = 30_000;
const MAX_ACTIVE_PER_BEAT = BEAT_MS * 2;
const MAX_PATHS = 60;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/**
 * The signed-in tab's heartbeat: starts or extends its session. `activeMs` is
 * the visible, non-idle time since the previous beat.
 */
export const heartbeat = mutation({
  args: {
    key: v.string(),
    path: v.string(),
    activeMs: v.number(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const key = clip(args.key, 64);
    const path = clip(args.path.split(/[?#]/)[0] || "/", 200);
    const activeMs = Math.max(0, Math.min(MAX_ACTIVE_PER_BEAT, Math.round(args.activeMs) || 0));
    const now = Date.now();

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!session || session.userId !== userId) {
      await ctx.db.insert("sessions", {
        userId,
        key,
        startedAt: now - activeMs,
        lastSeenAt: now,
        activeMs,
        pageviews: 1,
        paths: [path],
        device: args.device ? clip(args.device, 60) : undefined,
      });
      return;
    }
    const moved = session.paths[session.paths.length - 1] !== path;
    await ctx.db.patch(session._id, {
      lastSeenAt: now,
      activeMs: session.activeMs + activeMs,
      ...(moved
        ? { pageviews: session.pageviews + 1, paths: [...session.paths, path].slice(-MAX_PATHS) }
        : {}),
    });
  },
});

/** One MCP tool call, recorded by the /mcp route for the user it acted for. */
export const recordToolCall = mutation({
  args: {
    apiKey: v.string(),
    tool: v.string(),
    agent: v.string(),
    ok: v.boolean(),
    ms: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = requireServiceUser(args.apiKey);
    await ctx.db.insert("toolCalls", {
      userId,
      tool: clip(args.tool, 64),
      agent: clip(args.agent, 80),
      ok: args.ok,
      ms: Math.max(0, Math.round(args.ms)),
      at: Date.now(),
    });
  },
});
