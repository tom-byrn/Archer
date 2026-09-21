"use client";

import dynamic from "next/dynamic";
import { DocPreview } from "@/lib/preview";
import { LANDING_SAMPLE } from "@/lib/landingSample";

// Same outer dimensions as the loaded sandbox, so nothing shifts when it arrives.
function Placeholder() {
  return (
    <div className="overflow-hidden border border-line-2 bg-surface shadow-md">
      <div className="h-11 border-b border-line" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[440px] bg-ground p-16 sm:h-[528px]">
          <DocPreview source={LANDING_SAMPLE} />
        </div>
        <div className="h-[220px] border-t border-line bg-[var(--code-bg)] lg:h-auto lg:border-l lg:border-t-0" />
      </div>
    </div>
  );
}

// React Flow stays out of the landing page's first load.
const Sandbox = dynamic(() => import("./Sandbox"), { ssr: false, loading: Placeholder });

export function SandboxLoader() {
  return <Sandbox />;
}
