import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// `workspaceId` is a client-generated id identifying this user's workspace
// (v1 is a solo tool; swapping this for real auth identities is post-v1).
export default defineSchema({
  documents: defineTable({
    workspaceId: v.string(),
    title: v.string(),
    source: v.string(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  libraryTypes: defineTable({
    workspaceId: v.string(),
    tag: v.string(),
    name: v.string(),
    color: v.string(),
    glyph: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_tag", ["workspaceId", "tag"]),
});
