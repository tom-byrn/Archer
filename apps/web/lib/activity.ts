"use client";

/**
 * Client-side access to everything that lives *next to* a document in Convex:
 * revisions (history + agent attribution) and drift reports. One hook, one object, so panels and the canvas share a single
 * subscription set.
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export type Author = { kind: "user" | "agent"; name?: string };
export type Revision = Doc<"revisions">;
export type DriftReport = Doc<"drift">;
export type DriftFinding = DriftReport["findings"][number];

export const authorLabel = (a: Author): string =>
  a.kind === "user" ? "You" : a.name && a.name.trim() !== "" ? a.name : "Agent";

export interface DocumentActivity {
  ready: boolean;
  /** Newest first, with sources (capped at 100). */
  revisions: Revision[];
  /** Revision the user last reviewed (null before any review or when none exists). */
  baseline: Revision | null | undefined;
  /** Agent revisions newer than `seenRevisionAt`. */
  unseenAgentRevisions: Revision[];
  drift: DriftReport | null | undefined;
  driftByPath: Map<string, DriftFinding>;

  markSeen: () => Promise<unknown>;
  dismissFinding: (index: number) => Promise<unknown>;
  clearDrift: () => Promise<unknown>;
}

export function useDocumentActivity(
  documentId: Id<"documents"> | null,
  workspaceId: string | null,
  seenRevisionAt: number | undefined,
): DocumentActivity {
  const args = documentId && workspaceId ? { documentId, workspaceId } : "skip";
  const revisions = useQuery(
    api.revisions.listFull,
    args === "skip" ? "skip" : { ...args, limit: 100 },
  );
  const baseline = useQuery(api.revisions.baseline, args);
  const drift = useQuery(api.drift.get, args);

  const markSeenM = useMutation(api.documents.markSeen);
  const dismissM = useMutation(api.drift.dismiss);
  const clearM = useMutation(api.drift.clear);

  const unseenAgentRevisions = useMemo(
    () =>
      (revisions ?? []).filter(
        (r) => r.author.kind === "agent" && r.createdAt > (seenRevisionAt ?? 0),
      ),
    [revisions, seenRevisionAt],
  );

  const driftByPath = useMemo(() => {
    const m = new Map<string, DriftFinding>();
    for (const f of drift?.findings ?? []) if (f.path) m.set(f.path, f);
    return m;
  }, [drift]);

  const guard = useCallback(
    <T,>(fn: (ids: { documentId: Id<"documents">; workspaceId: string }) => Promise<T>) =>
      documentId && workspaceId
        ? fn({ documentId, workspaceId })
        : Promise.reject(new Error("Document not ready")),
    [documentId, workspaceId],
  );

  return {
    ready: !!documentId && !!workspaceId && revisions !== undefined,
    revisions: revisions ?? [],
    baseline,
    unseenAgentRevisions,
    drift,
    driftByPath,
    markSeen: () => guard(({ documentId, workspaceId }) => markSeenM({ id: documentId, workspaceId })),
    dismissFinding: (index) =>
      guard(({ workspaceId }) =>
        drift ? dismissM({ id: drift._id, workspaceId, index }) : Promise.resolve(),
      ),
    clearDrift: () => guard(({ documentId, workspaceId }) => clearM({ documentId, workspaceId })),
  };
}

/** Prompt a human can paste into their agent to run a drift check. */
export const driftCheckPrompt = (
  documentId: string,
  title: string,
  repo?: { owner: string; name: string; branch: string } | null,
): string =>
  `Run a drift check on the Archer project "${title}" (id ${documentId}) against ${
    repo ? `the repository ${repo.owner}/${repo.name} on branch ${repo.branch}` : "this codebase"
  }: call get_project, then for every component use its src path (or search the repo) to find the implementation and compare it with the component's desc and payloads. Finally call report_drift with one finding per discrepancy — "missing" for components with no implementation, "changed" where the code differs, "extra" for parts of the code the architecture doesn't declare — and an empty list if everything matches.`;
