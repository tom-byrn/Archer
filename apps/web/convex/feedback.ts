import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { effectiveUser } from "./access";

/** Longest message kept (components/FeedbackDialog.tsx stops typing at the same length). */
export const MAX_FEEDBACK = 4000;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/**
 * Feedback from the signed-in user, for the admin dashboard's Feedback tab:
 * from the browser (components/FeedbackDialog.tsx), or from an agent through
 * the MCP tool `send_feedback`, which passes the user's service credential
 * in `apiKey`.
 */
export const send = mutation({
  args: {
    apiKey: v.optional(v.string()),
    message: v.string(),
    path: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const who = await effectiveUser(ctx, args.apiKey);
    if (!who) throw new Error("Not signed in.");
    const userId = who.userId;
    const message = clip(args.message.trim(), MAX_FEEDBACK);
    if (message === "") throw new Error("Feedback is empty.");
    await ctx.db.insert("feedback", {
      userId,
      message,
      path: clip(args.path.split(/[?#]/)[0] || "/", 200),
      device: args.device ? clip(args.device, 60) : undefined,
    });
  },
});
