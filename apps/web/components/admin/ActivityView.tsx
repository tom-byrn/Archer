"use client";

import type { Metrics } from "@/lib/adminMetrics";
import { Panel } from "./AdminChrome";
import { Feed, useUserIndex } from "./common";
import { Truncated } from "./OverviewView";

export function ActivityView({ metrics }: { metrics: Metrics }) {
  const users = useUserIndex(metrics);
  return (
    <div className="flex flex-col gap-5">
      <Truncated metrics={metrics} />
      <Panel title="Everything that happened" action={`last ${metrics.days} days, newest first`} flush>
        <Feed items={metrics.feed} users={users} filterable limit={400} />
      </Panel>
    </div>
  );
}
