import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { AdminCanvas } from "@/components/admin/AdminCanvas";
import { adminQuery, requireAdmin, type SearchParams } from "@/lib/server/admin";

/** Any document's canvas, read-only; `?rev=` shows one saved version of it. */
export default async function AdminCanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const rev = (await searchParams).rev;
  const doc = await adminQuery(api.adminDashboard.document, { id });
  if (!doc) notFound();
  const version = typeof rev === "string" ? await adminQuery(api.adminDashboard.revision, { id: rev }) : null;
  if (version && version.documentId !== doc._id) notFound();
  return (
    <AdminCanvas
      documentId={doc._id}
      title={doc.title}
      source={version?.source ?? doc.source}
      updatedAt={version?.createdAt ?? doc.updatedAt}
      version={version ? { createdAt: version.createdAt } : null}
      repo={doc.repo}
    />
  );
}
