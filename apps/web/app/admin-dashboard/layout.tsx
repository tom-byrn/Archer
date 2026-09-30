import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/admin";

/**
 * The admin dashboard: usage, users and read-only views of every canvas, for
 * the admin only (lib/admin.ts). Everyone else gets a 404. Linked from
 * nowhere; each page checks again (`requireAdmin`), since a client
 * navigation can render a page without this layout.
 */
export const metadata: Metadata = {
  title: "Admin · Archer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
