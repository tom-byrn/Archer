import { ActivityView } from "@/components/admin/ActivityView";
import { loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const metrics = await loadMetrics(searchParams, await requireAdmin());
  return <ActivityView metrics={{ ...metrics, feed: metrics.feed.slice(0, 400) }} />;
}
