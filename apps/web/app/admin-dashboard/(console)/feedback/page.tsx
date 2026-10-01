import { api } from "@/convex/_generated/api";
import { FeedbackView } from "@/components/admin/FeedbackView";
import { adminQuery, getUser, requireAdmin, type SearchParams } from "@/lib/server/admin";

export default async function AdminFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const all = await adminQuery(api.adminDashboard.feedback, {});
  const items = sp.self === "hide" ? all.filter((f) => f.userId !== admin.id) : all;
  const ids = [...new Set(items.map((f) => f.userId))];
  const users = (await Promise.all(ids.map(getUser))).filter((u) => u !== null);
  return <FeedbackView items={items} users={users} />;
}
