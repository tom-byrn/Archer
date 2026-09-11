"use client";

import { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

export function Providers({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  }, []);
  if (!client) {
    return (
      <div className="grid h-screen place-items-center p-8 text-center text-sm text-slate-600 dark:text-slate-400">
        <div>
          <p className="font-semibold">Convex is not configured.</p>
          <p className="pt-1">
            Run <code className="mono">npx convex dev</code> in{" "}
            <code className="mono">apps/web</code> to start the local backend.
          </p>
        </div>
      </div>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
