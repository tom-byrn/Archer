import { UsersView } from "@/components/admin/UsersView";
import { loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const metrics = await loadMetrics(searchParams, await requireAdmin());
  return <UsersView metrics={{ ...metrics, feed: [] }} />;
}
