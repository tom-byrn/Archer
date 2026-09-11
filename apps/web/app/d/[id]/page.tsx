"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getWorkspaceId } from "@/lib/workspace";
import { Editor } from "@/components/Editor";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => setWorkspaceId(getWorkspaceId()), []);

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
      <div className="grid h-screen place-items-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (doc === null) {
    return (
      <div className="grid h-screen place-items-center text-sm text-slate-500">
        <div className="text-center">
          <p>Document not found.</p>
          <Link href="/" className="pt-2 text-slate-800 dark:text-slate-200 underline">
            Back to documents
          </Link>
        </div>
      </div>
    );
  }
  return <Editor key={doc._id} initialSource={doc.source} onPersist={persist} />;
}
