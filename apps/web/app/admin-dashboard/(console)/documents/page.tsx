import { DocumentsView } from "@/components/admin/DocumentsView";
import { loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminDocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const metrics = await loadMetrics(searchParams, await requireAdmin());
  return <DocumentsView metrics={{ ...metrics, feed: [] }} />;
}
