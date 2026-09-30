"use client";

import Link from "next/link";
import { formatDuration, formatNumber, formatPercent, type Metrics } from "@/lib/adminMetrics";
import { Icon } from "../ui";
import { ADMIN_BASE, Panel } from "./AdminChrome";
import { BarList, DailyChart, Stat } from "./Charts";
import { Feed, useUserIndex } from "./common";

const BLUE = { color: "var(--viz-1)" };

export function OverviewView({ metrics: m }: { metrics: Metrics }) {
  const users = useUserIndex(m);
  const k = m.kpis;
  const edits = k.edits.user + k.edits.agent + k.edits.git;
  const col = (pick: (p: Metrics["daily"][number]) => number[]) => m.daily.map((p) => ({ ts: p.ts, values: pick(p) }));

  return (
    <div className="flex flex-col gap-5">
      <Truncated metrics={m} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat label="Users" value={formatNumber(k.users)} sub={`+${k.newUsers} in the last ${m.days} days`} />
        <Stat
          label={`Active users · ${m.days}d`}
          value={formatNumber(k.activeUsers)}
          sub={`${k.dau} today · ${k.wau} this week · ${k.mau} in 30 days`}
        />
        <Stat
          label="Time in app"
          value={formatDuration(k.activeMs)}
          sub={`${formatDuration(k.activeMsPerActiveUser)} per active user`}
        />
        <Stat
          label="Sessions"
          value={formatNumber(k.sessions)}
          sub={`avg ${formatDuration(k.avgSessionMs)} · median ${formatDuration(k.medianSessionMs)}`}
        />
        <Stat label="Documents" value={formatNumber(k.documents)} sub={`+${k.newDocuments} new · ${k.customTypes} custom types`} />
        <Stat
          label="Edits"
          value={formatNumber(edits)}
          sub={`${k.edits.user} by people · ${k.edits.agent} by agents · ${k.edits.git} from git`}
        />
        <Stat
          label="Agent tool calls"
          value={formatNumber(k.toolCalls)}
          sub={`${k.agentUsers} users · ${k.toolCalls ? formatPercent(k.toolErrors / k.toolCalls) : "0%"} failed`}
        />
        <Stat
          label="Sharing & repos"
          value={`${k.sharedDocuments} · ${k.repoDocuments}`}
          sub={`public links · repo-linked (${k.storedDocuments} stored) · ${k.teams} teams`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Daily active users">
          <DailyChart label="Daily active users" columns={col((p) => [p.activeUsers])} series={[{ name: "Active users", ...BLUE }]} />
        </Panel>
        <Panel title="Time in app per day">
          <DailyChart
            label="Time in app per day"
            format="duration"
            columns={col((p) => [p.activeMs])}
            series={[{ name: "Time in app", ...BLUE }]}
          />
        </Panel>
        <Panel title="Edits per day">
          <DailyChart
            label="Edits per day, by author"
            columns={col((p) => [p.edits.user, p.edits.agent, p.edits.git])}
            series={[
              { name: "People", color: "var(--viz-1)" },
              { name: "Agents", color: "var(--viz-2)" },
              { name: "Git", color: "var(--viz-3)" },
            ]}
          />
        </Panel>
        <Panel title="Agent tool calls per day">
          <DailyChart label="Agent tool calls per day" columns={col((p) => [p.toolCalls])} series={[{ name: "Tool calls", ...BLUE }]} />
        </Panel>
        <Panel title="Sign-ups per day">
          <DailyChart label="Sign-ups per day" columns={col((p) => [p.newUsers])} series={[{ name: "Sign-ups", ...BLUE }]} />
        </Panel>
        <Panel title="New documents per day">
          <DailyChart label="New documents per day" columns={col((p) => [p.newDocuments])} series={[{ name: "New documents", ...BLUE }]} />
        </Panel>
      </div>

      <Panel title="Retention by sign-up week" action="Share of each week's sign-ups active in later weeks">
        <Cohorts metrics={m} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Top pages" action="views">
          <BarList items={m.paths.slice(0, 10).map((p) => ({ key: p.path, label: <span className="mono text-xs">{p.path}</span>, value: p.views, hint: `${p.users} users` }))} />
        </Panel>
        <Panel title="Agents" action="tool calls + edits">
          <BarList
            empty="No agent activity yet."
            items={m.agents.slice(0, 10).map((a) => ({
              key: a.agent,
              label: a.agent,
              value: a.toolCalls + a.edits,
              hint: `${a.toolCalls} tool calls, ${a.edits} edits, ${a.users} users`,
            }))}
          />
        </Panel>
        <Panel title="Devices" action="sessions">
          <BarList items={m.devices.slice(0, 10).map((d) => ({ key: d.device, label: d.device, value: d.sessions, hint: `${d.users} users` }))} />
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        flush
        action={
          <Link href={`${ADMIN_BASE}/activity`} className="flex items-center gap-1 text-ink-2 hover:text-ink">
            All activity <Icon.ArrowRight className="h-3 w-3" />
          </Link>
        }
      >
        <Feed items={m.feed} users={users} limit={12} />
      </Panel>
    </div>
  );
}

export function Truncated({ metrics }: { metrics: Metrics }) {
  if (!metrics.truncated) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border border-line bg-warn-soft px-3 py-2 text-sm text-warn">
      <Icon.Warning className="h-4 w-4" />
      This window has more activity than one read returns; the oldest days are incomplete. Pick a shorter range.
    </p>
  );
}

/** Weekly cohort grid: one ramp of the first series' hue, darker for more retained. */
function Cohorts({ metrics }: { metrics: Metrics }) {
  const cohorts = metrics.cohorts;
  if (cohorts.length === 0) return <p className="text-sm text-ink-3">No sign-ups in this window.</p>;
  const width = Math.max(...cohorts.map((c) => c.retained.length));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-semibold text-ink-3">Week of</th>
            <th className="px-2 py-1 text-right font-semibold text-ink-3">Users</th>
            {Array.from({ length: width }, (_, i) => (
              <th key={i} className="w-14 px-2 py-1 text-center font-semibold text-ink-3">
                {i === 0 ? "Week 0" : `+${i}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <td className="whitespace-nowrap px-2 py-1 text-ink-2">
                {new Date(c.week).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-ink-2">{c.size}</td>
              {Array.from({ length: width }, (_, i) => {
                const v = c.retained[i];
                return (
                  <td
                    key={i}
                    className="rounded-sm px-2 py-1 text-center tabular-nums text-ink"
                    style={
                      v === undefined || v === null
                        ? undefined
                        : { background: `color-mix(in oklab, var(--viz-1) ${Math.round(8 + v * 62)}%, var(--surface))` }
                    }
                  >
                    {v === undefined || v === null ? "" : formatPercent(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
