import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const TABLES = ["documents", "libraryTypes", "revisions", "drift"] as const;

/**
 * Operator-only: move every row of one workspace to another. Not callable from
 * clients (internal); run with the deploy key:
 *   npx convex run admin:transferWorkspace '{"from":"<id>","to":"<id>"}'
 * Useful to hand a pre-auth anonymous workspace to a user, or to undo a claim.
 */
export const transferWorkspace = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    let moved = 0;
    for (const table of TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", from))
        .collect();
      for (const r of rows) {
        await ctx.db.patch(r._id, { workspaceId: to });
        moved++;
      }
    }
    return { moved };
  },
});
