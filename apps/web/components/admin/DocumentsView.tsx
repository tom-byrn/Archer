"use client";

import { formatNumber, type Metrics } from "@/lib/adminMetrics";
import { Panel } from "./AdminChrome";
import { DailyChart, Stat } from "./Charts";
import { useUserIndex } from "./common";
import { Truncated } from "./OverviewView";
import { DocumentsTable } from "./UserView";

export function DocumentsView({ metrics: m }: { metrics: Metrics }) {
  const users = useUserIndex(m);
  const k = m.kpis;
  const avgLines = m.documents.length ? Math.round(m.documents.reduce((a, d) => a + d.lines, 0) / m.documents.length) : 0;
  return (
    <div className="flex flex-col gap-5">
      <Truncated metrics={m} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat label="Documents" value={formatNumber(k.documents)} sub={`+${k.newDocuments} in the last ${m.days} days`} />
        <Stat label="Average size" value={`${avgLines} lines`} sub={`${m.documents.filter((d) => d.team).length} in team workspaces`} />
        <Stat label="Public links" value={k.sharedDocuments} sub="anyone with the link can view" />
        <Stat label="Repo-linked" value={k.repoDocuments} sub={`${k.storedDocuments} stored in a repository`} />
      </div>
      <Panel title="Edits per day">
        <DailyChart
          label="Edits per day, by author"
          columns={m.daily.map((p) => ({ ts: p.ts, values: [p.edits.user, p.edits.agent, p.edits.git] }))}
          series={[
            { name: "People", color: "var(--viz-1)" },
            { name: "Agents", color: "var(--viz-2)" },
            { name: "Git", color: "var(--viz-3)" },
          ]}
        />
      </Panel>
      <Panel title={`All documents · ${m.documents.length}`} action={`Edit counts cover the last ${m.days} days`} flush>
        <DocumentsTable rows={m.documents} teams={m.teams} users={users} />
      </Panel>
    </div>
  );
}
