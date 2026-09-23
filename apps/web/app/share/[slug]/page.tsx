"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loading } from "loading-dev";
import { DocumentViewer } from "@/components/DocumentViewer";

/** Public, read-only view of a document shared with "anyone with the link". */
export default function SharedDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { isSignedIn } = useAuth();
  const doc = useQuery(api.documents.getPublic, { slug });

  useEffect(() => {
    if (doc) document.title = `${doc.title} · Archer`;
  }, [doc]);

  if (doc === undefined) {
    return (
      <div role="status" aria-label="Loading" className="grid h-screen place-items-center bg-bg text-ink-3">
        <Loading size={48} />
      </div>
    );
  }
  if (doc === null) {
    return (
      <div className="grid h-screen place-items-center bg-bg text-base text-ink-2">
        <div className="text-center">
          <p className="font-display text-xl text-ink">This link is no longer shared</p>
          <p className="pt-1 text-sm text-ink-3">The owner turned off link sharing, or the document was deleted.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2"
          >
            Go to Archer
          </Link>
        </div>
      </div>
    );
  }
  return (
    <DocumentViewer
      title={doc.title}
      source={doc.source}
      updatedAt={doc.updatedAt}
      editHref={doc.role ? `/documents/${doc._id}` : undefined}
      signedIn={!!isSignedIn}
      repo={doc.repo ?? null}
    />
  );
}
