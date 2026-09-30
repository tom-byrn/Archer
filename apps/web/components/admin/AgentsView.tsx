"use client";

import { formatNumber, formatPercent, type Metrics } from "@/lib/adminMetrics";
import { relativeTime } from "../ui";
import { Panel } from "./AdminChrome";
import { DailyChart, Stat } from "./Charts";
import { DataTable, UserCell, dash } from "./common";
import { Truncated } from "./OverviewView";

/** MCP usage: which agents, which tools, how often they fail, and who relies on them. */
export function AgentsView({ metrics: m }: { metrics: Metrics }) {
  const k = m.kpis;
  const calls = m.tools.reduce((a, t) => a + t.calls, 0);
  const slowest = [...m.tools].sort((a, b) => b.p95Ms - a.p95Ms)[0];
  const agentUsers = m.users.filter((u) => u.toolCalls > 0 || u.agentEdits > 0);
  return (
    <div className="flex flex-col gap-5">
      <Truncated metrics={m} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat label="Tool calls" value={formatNumber(calls)} sub={`${m.tools.length} different tools`} />
        <Stat label="Failed" value={calls ? formatPercent(k.toolErrors / calls) : "0%"} sub={`${k.toolErrors} calls returned an error`} />
        <Stat label="Users with agents" value={agentUsers.length} sub={`of ${k.activeUsers} active users`} />
        <Stat
          label="Agent edits"
          value={formatNumber(k.edits.agent)}
          sub={slowest ? `slowest: ${slowest.tool} (p95 ${slowest.p95Ms} ms)` : "no calls yet"}
        />
      </div>
      <Panel title="Tool calls per day">
        <DailyChart
          label="Tool calls per day"
          columns={m.daily.map((p) => ({ ts: p.ts, values: [p.toolCalls] }))}
          series={[{ name: "Tool calls", color: "var(--viz-1)" }]}
        />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Agents" flush>
          <DataTable
            rows={m.agents}
            rowKey={(a) => a.agent}
            empty="No agents have connected yet."
            initialSort={{ key: "calls", dir: "desc" }}
            columns={[
              { key: "agent", label: "Agent", sort: (a) => a.agent.toLowerCase(), cell: (a) => <span className="font-medium text-ink">{a.agent}</span> },
              { key: "calls", label: "Tool calls", align: "right", sort: (a) => a.toolCalls, cell: (a) => dash(a.toolCalls) },
              { key: "edits", label: "Edits", align: "right", sort: (a) => a.edits, cell: (a) => dash(a.edits) },
              { key: "users", label: "Users", align: "right", sort: (a) => a.users, cell: (a) => a.users },
              { key: "last", label: "Last used", sort: (a) => a.lastUsed, cell: (a) => relativeTime(a.lastUsed) },
            ]}
          />
        </Panel>
        <Panel title="Tools" flush>
          <DataTable
            rows={m.tools}
            rowKey={(t) => t.tool}
            empty="No tool calls in this window."
            initialSort={{ key: "calls", dir: "desc" }}
            columns={[
              { key: "tool", label: "Tool", sort: (t) => t.tool, cell: (t) => <span className="mono text-xs text-ink">{t.tool}</span> },
              { key: "calls", label: "Calls", align: "right", sort: (t) => t.calls, cell: (t) => t.calls },
              {
                key: "errors",
                label: "Failed",
                align: "right",
                sort: (t) => t.errors / t.calls,
                cell: (t) => (t.errors ? <span className="text-danger">{formatPercent(t.errors / t.calls)}</span> : dash(null)),
              },
              { key: "users", label: "Users", align: "right", sort: (t) => t.users, cell: (t) => t.users },
              { key: "avg", label: "Avg", align: "right", sort: (t) => t.avgMs, cell: (t) => `${t.avgMs} ms` },
              { key: "p95", label: "p95", align: "right", sort: (t) => t.p95Ms, cell: (t) => `${t.p95Ms} ms` },
            ]}
          />
        </Panel>
      </div>
      <Panel title="Who uses agents" flush>
        <DataTable
          rows={agentUsers}
          rowKey={(r) => r.user.id}
          empty="Nobody yet."
          initialSort={{ key: "calls", dir: "desc" }}
          columns={[
            { key: "user", label: "User", cell: (r) => <UserCell user={r.user} /> },
            { key: "calls", label: "Tool calls", align: "right", sort: (r) => r.toolCalls, cell: (r) => dash(r.toolCalls) },
            { key: "edits", label: "Agent edits", align: "right", sort: (r) => r.agentEdits, cell: (r) => dash(r.agentEdits) },
            { key: "agents", label: "Agents", cell: (r) => r.agents.join(", ") },
          ]}
        />
      </Panel>
    </div>
  );
}
