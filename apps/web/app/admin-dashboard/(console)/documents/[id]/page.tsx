import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { DocumentDetail } from "@/components/admin/DocumentDetail";
import { adminQuery, getUser, requireAdmin } from "@/lib/server/admin";

export default async function AdminDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const doc = await adminQuery(api.adminDashboard.document, { id: decodeURIComponent((await params).id) });
  if (!doc) notFound();
  const ownerId = doc.workspace ? doc.workspace.ownerId : doc.workspaceId;
  const owner = await getUser(ownerId);
  return <DocumentDetail doc={doc} owner={owner} />;
}
