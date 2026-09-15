"use client";

import { use, useCallback } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspaceId } from "@/lib/workspace";
import { Editor } from "@/components/Editor";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workspaceId = useWorkspaceId();

  const doc = useQuery(
    api.documents.get,
    workspaceId ? { id: id as Id<"documents">, workspaceId } : "skip",
  );
  const updateSource = useMutation(api.documents.updateSource);

  const persist = useCallback(
    async (source: string, title: string) => {
      if (!workspaceId) return;
      await updateSource({ id: id as Id<"documents">, workspaceId, source, title });
    },
    [id, workspaceId, updateSource],
  );

  if (doc === undefined || workspaceId === null) {
    return (
      <div className="grid h-screen place-items-center bg-bg text-sm text-ink-3">
        <span className="animate-pulse">Loading document…</span>
      </div>
    );
  }
  if (doc === null) {
    return (
      <div className="grid h-screen place-items-center bg-bg text-base text-ink-2">
        <div className="text-center">
          <p className="font-display text-xl text-ink">Document not found</p>
          <p className="pt-1 text-sm text-ink-3">It may have been deleted, or it belongs to another workspace.</p>
          <Link href="/" className="mt-4 inline-block rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2">
            Back to documents
          </Link>
        </div>
      </div>
    );
  }
  return (
    <Editor
      key={doc._id}
      initialSource={doc.source}
      onPersist={persist}
      documentId={doc._id}
      workspaceId={workspaceId}
      seenRevisionAt={doc.seenRevisionAt}
    />
  );
}
