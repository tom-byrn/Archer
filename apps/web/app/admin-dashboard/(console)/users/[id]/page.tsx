import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { UserView } from "@/components/admin/UserView";
import { unknownUser } from "@/lib/adminMetrics";
import { adminQuery, getUser, loadMetrics, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const [metrics, clerkUser, activity] = await Promise.all([
    loadMetrics(searchParams, admin),
    getUser(id),
    adminQuery(api.adminDashboard.userActivity, { userId: id }),
  ]);
  const row = metrics.users.find((r) => r.user.id === id) ?? null;
  if (!clerkUser && !row && activity.sessions.length === 0) notFound();
  return (
    <UserView
      user={clerkUser ?? row?.user ?? unknownUser(id)}
      row={row}
      metrics={{ ...metrics, feed: metrics.feed.filter((f) => f.userId === id) }}
      activity={activity}
    />
  );
}
