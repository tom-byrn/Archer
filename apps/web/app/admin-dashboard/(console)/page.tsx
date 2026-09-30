import { OverviewView } from "@/components/admin/OverviewView";
import { loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const metrics = await loadMetrics(searchParams, await requireAdmin());
  return <OverviewView metrics={{ ...metrics, feed: metrics.feed.slice(0, 12) }} />;
}
