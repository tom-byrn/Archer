import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// `workspaceId` is the owner's Clerk user id. Rows created before auth carry
// the browser-generated UUID they were made with until `workspaces.claimLegacy`
// moves them. Every function checks access via `requireWorkspace`.

/**
 * Who made a change: the human in the browser, an agent over MCP, or a commit
 * to the repository a document is stored in (imported by repo sync).
 */
export const author = v.object({
  kind: v.union(v.literal("user"), v.literal("agent"), v.literal("git")),
  /** Agent name (MCP client name, e.g. "claude-code"), or the commit author for "git"; undefined for the user. */
  name: v.optional(v.string()),
});

export const role = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"));

/** A version of a document's .arch file on its branch. */
export const fileVersion = {
  /** Commit that produced this version of the file. */
  commit: v.string(),
  /** Git blob sha of the file (what GitHub compares on write). */
  blob: v.string(),
  /** The file's architecture in canonical form, layout stripped. */
  source: v.string(),
};

/**
 * The GitHub repository a document describes. With `path` set the document is
 * *stored in the repository*: the file on `branch` is the source of truth and
 * the document is its working copy (see docs/repo-sync.md). Without it the
 * link only feeds the commit timeline and `src` links.
 */
export const repoLink = v.object({
  owner: v.string(),
  name: v.string(),
  branch: v.string(),
  /** Path of the .arch file inside the repository. */
  path: v.optional(v.string()),
  linkedAt: v.number(),
  /** User who linked the file; webhook syncs act as them. */
  linkedBy: v.optional(v.string()),
  /** The file as last imported from or published to `branch`: the draft is whatever differs from it. */
  base: v.optional(v.object({ ...fileVersion, at: v.number() })),
  /** Pull request opened by the last publish, until it merges or closes. */
  pr: v.optional(
    v.object({ number: v.number(), url: v.string(), branch: v.string(), openedAt: v.number() }),
  ),
  /** A newer version of the file that conflicts with the draft, waiting for the user. */
  incoming: v.optional(
    v.object({
      ...fileVersion,
      author: v.optional(v.string()),
      message: v.optional(v.string()),
      url: v.optional(v.string()),
      /** One line per conflict, e.g. "api: changed desc on both sides". */
      conflicts: v.array(v.string()),
      at: v.number(),
    }),
  ),
  /** Why the last sync failed (the file has errors, was deleted…), until one succeeds. */
  problem: v.optional(v.object({ message: v.string(), commit: v.optional(v.string()), at: v.number() })),
  /** When the branch was last checked. */
  checkedAt: v.optional(v.number()),
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
    /** Linked GitHub repository (commit timeline, src deep links, and the stored file). */
    repo: v.optional(repoLink),
    /**
     * `owner/name@branch`, lowercased, while the document is stored in a
     * repository: how a push webhook finds the documents it touches.
     */
    syncKey: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_public_slug", ["publicSlug"])
    .index("by_sync_key", ["syncKey"]),

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
    /** One-line description of the change (agents supply it; users rarely; commit subject for "git"). */
    summary: v.optional(v.string()),
    /** The commit a "git" revision was imported from. */
    commit: v.optional(v.object({ sha: v.string(), url: v.string() })),
  })
    .index("by_document", ["documentId", "createdAt"])
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

  /**
   * Time spent in the app: one row per browser tab session, extended by the
   * signed-in page's heartbeat (`usage.heartbeat`, components/UsageBeacon.tsx)
   * while the tab is visible and the user is active. Read by the admin
   * dashboard only.
   */
  sessions: defineTable({
    userId: v.string(),
    /** Random id the tab generated; a new one after 30 idle minutes. */
    key: v.string(),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    /** Visible, non-idle time, summed from heartbeats. */
    activeMs: v.number(),
    /** Page views: each path change counts one. */
    pageviews: v.number(),
    /** Paths visited, in order, consecutive repeats dropped (capped). */
    paths: v.array(v.string()),
    /** "Chrome · macOS"; derived in the browser from its user agent. */
    device: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_user", ["userId", "lastSeenAt"])
    .index("by_last_seen", ["lastSeenAt"]),

  /** One row per MCP tool call (agents and the CLI), recorded by the /mcp route. */
  toolCalls: defineTable({
    userId: v.string(),
    tool: v.string(),
    /** OAuth client name: "Claude Code", "Cursor", "Archer CLI"… */
    agent: v.string(),
    ok: v.boolean(),
    ms: v.number(),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_user", ["userId", "at"]),

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
