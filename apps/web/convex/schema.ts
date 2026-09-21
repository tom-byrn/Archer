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

export const role = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"));

export const repoLink = v.object({
  owner: v.string(),
  name: v.string(),
  branch: v.string(),
  /** Reserved for the .arch file sync: path of the file inside the repo. */
  path: v.optional(v.string()),
  linkedAt: v.number(),
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
    /** Set when "anyone with the link can view" is on. */
    publicSlug: v.optional(v.string()),
    /** Linked GitHub repository (commit timeline, src deep links). */
    repo: v.optional(repoLink),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_public_slug", ["publicSlug"]),

  /**
   * Team workspaces. A user's personal workspace has no row: its id is the
   * user id itself. Team workspace ids are this table's document ids.
   */
  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  /** Membership in a team workspace. Invites are rows with no userId yet. */
  members: defineTable({
    workspaceId: v.string(),
    /** Clerk user id once the invitee has signed in; absent while pending. */
    userId: v.optional(v.string()),
    email: v.string(),
    role,
    invitedBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

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

  /** Which workspace a user's OAuth-connected agents operate on (default: personal). */
  agentPrefs: defineTable({
    userId: v.string(),
    workspaceId: v.string(),
  }).index("by_user", ["userId"]),

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
