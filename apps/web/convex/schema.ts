import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// `workspaceId` is the owner's Clerk user id. Rows created before auth carry
// the browser-generated UUID they were made with until `workspaces.claimLegacy`
// moves them. Every function checks access via `requireWorkspace`.

/** Who made a change: the human in the browser, or an agent over MCP. */
export const author = v.object({
  kind: v.union(v.literal("user"), v.literal("agent")),
  /** Agent name (MCP client name, e.g. "claude-code"); undefined for the user. */
  name: v.optional(v.string()),
});

export const driftStatus = v.union(
  v.literal("missing"), // declared in the document, not found in the code
  v.literal("changed"), // found, but the code differs from desc/payloads
  v.literal("extra"), // found in the code, not declared in the document
);

export default defineSchema({
  documents: defineTable({
    workspaceId: v.string(),
    title: v.string(),
    source: v.string(),
    updatedAt: v.number(),
    /** Timestamp up to which the user has reviewed agent revisions. */
    seenRevisionAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

  /** Snapshot of a document after every save (user saves coalesce). */
  revisions: defineTable({
    workspaceId: v.string(),
    documentId: v.id("documents"),
    source: v.string(),
    title: v.string(),
    createdAt: v.number(),
    author,
    /** One-line description of the change (agents supply it; users rarely). */
    summary: v.optional(v.string()),
  })
    .index("by_document", ["documentId", "createdAt"])
    .index("by_workspace", ["workspaceId"]),

  /** A question / discussion attached to one component path. */
  threads: defineTable({
    workspaceId: v.string(),
    documentId: v.id("documents"),
    path: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    updatedAt: v.number(),
    messages: v.array(
      v.object({
        author,
        text: v.string(),
        at: v.number(),
      }),
    ),
  })
    .index("by_document", ["documentId", "updatedAt"])
    .index("by_workspace", ["workspaceId"]),

  /** Latest drift report for a document (replaced on every report). */
  drift: defineTable({
    workspaceId: v.string(),
    documentId: v.id("documents"),
    reportedAt: v.number(),
    author,
    findings: v.array(
      v.object({
        status: driftStatus,
        /** Dotted component path; absent for "extra" findings. */
        path: v.optional(v.string()),
        /** For "extra": a suggested display name for the undeclared part. */
        name: v.optional(v.string()),
        /** Where in the code this was observed. */
        src: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  })
    .index("by_document", ["documentId"])
    .index("by_workspace", ["workspaceId"]),

  /** Agent credentials: only the SHA-256 of the key is stored. */
  apiKeys: defineTable({
    workspaceId: v.string(),
    name: v.string(),
    hash: v.string(),
    /** First characters of the key, for display. */
    prefix: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_hash", ["hash"]),

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
