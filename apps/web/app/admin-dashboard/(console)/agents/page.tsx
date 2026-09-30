import { AgentsView } from "@/components/admin/AgentsView";
import { loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminAgentsPage({ searchParams }: { searchParams: SearchParams }) {
  const metrics = await loadMetrics(searchParams, await requireAdmin());
  return <AgentsView metrics={{ ...metrics, feed: [] }} />;
}
