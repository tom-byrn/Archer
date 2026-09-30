import { Suspense } from "react";
import { AdminChrome } from "@/components/admin/AdminChrome";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminChrome>{children}</AdminChrome>
    </Suspense>
  );
}
