"use client";

import { use, useCallback } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@clerk/nextjs";
import { Loading } from "loading-dev";
import { useWorkspaceId } from "@/lib/workspace";
import { Editor } from "@/components/Editor";
import { DocumentViewer } from "@/components/DocumentViewer";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workspaceId = useWorkspaceId();
  const { isSignedIn } = useAuth();

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
      <div role="status" aria-label="Loading document" className="grid h-dvh place-items-center bg-bg text-ink-3">
        <Loading size={48} />
      </div>
    );
  }
  if (doc === null) {
    return (
      <div className="grid h-dvh place-items-center bg-bg text-base text-ink-2">
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
  if (doc.role === "viewer") {
    return (
      <DocumentViewer
        title={doc.title}
        source={doc.source}
        updatedAt={doc.updatedAt}
        signedIn={!!isSignedIn}
        repo={doc.repo ?? null}
      />
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
      publicSlug={doc.publicSlug ?? null}
      repo={doc.repo ?? null}
    />
  );
}
