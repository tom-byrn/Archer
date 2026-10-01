import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./access";

/** Longest message kept (components/FeedbackDialog.tsx stops typing at the same length). */
export const MAX_FEEDBACK = 4000;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Feedback from the signed-in user, for the admin dashboard's Feedback tab. */
export const send = mutation({
  args: {
    message: v.string(),
    path: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
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
