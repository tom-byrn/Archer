"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { findExample } from "@/lib/examples";
import { useWorkspace } from "@/lib/workspace";

/**
 * `/new?example=<slug>`: copies a docs example into the selected workspace
 * (the personal one when that is view-only) and opens it in the editor. An
 * untouched earlier copy is reopened rather than duplicated. Not a public
 * route, so signed-out visitors sign in first and land back here.
 */
export default function NewDocumentPage() {
  // The query string is only known in the browser; the static shell shows the fallback.
  return (
    <Suspense fallback={<Opening />}>
      <NewFromExample />
    </Suspense>
  );
}

function Opening({ title }: { title?: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-bg text-sm text-ink-3">
      <span className="animate-pulse">Opening {title ?? "example"}…</span>
    </div>
  );
}

function NewFromExample() {
  const example = findExample(useSearchParams().get("example"));
  const router = useRouter();
  const { workspaceId, role, workspaces, select } = useWorkspace();
  const personal = workspaces.find((w) => w.kind === "personal");
  const target = role === "owner" || role === "editor" ? workspaceId : (personal?.id ?? null);
  const docs = useQuery(
    api.documents.list,
    example && target ? { workspaceId: target } : "skip",
  );
  const create = useMutation(api.documents.create);
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!example || !target || docs === undefined || started.current) return;
    started.current = true;
    // The document page reads from the selected workspace.
    if (target !== workspaceId) select(target);
    const open = (id: string) => router.replace(`/documents/${id}`);
    const copy = docs.find((d) => d.source === example.source);
    if (copy) open(copy._id);
    else
      create({ workspaceId: target, title: example.title, source: example.source }).then(
        open,
        () => setFailed(true),
      );
  }, [example, target, docs, workspaceId, select, create, router]);

  if (example && !failed) return <Opening title={example.title} />;
  return (
    <div className="grid h-dvh place-items-center bg-bg text-base text-ink-2">
      <div className="text-center">
        <p className="font-display text-xl text-ink">
          {failed ? "Couldn't create the document" : "Example not found"}
        </p>
        <p className="pt-1 text-sm text-ink-3">
          {failed
            ? "Check that you can edit this workspace, then try again."
            : "The link may be out of date."}
        </p>
        <Link
          href="/language/examples"
          className="mt-4 inline-block rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Back to examples
        </Link>
      </div>
    </div>
  );
}
