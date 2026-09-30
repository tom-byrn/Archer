"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  DAY,
  dayStart,
  displayName,
  formatDuration,
  normalizePath,
  type AdminUser,
  type DocRow,
  type Metrics,
  type TeamRow,
  type UserRow,
} from "@/lib/adminMetrics";
import { Chip, GitHubMark, Icon, relativeTime } from "../ui";
import { ADMIN_BASE, Avatar, Panel } from "./AdminChrome";
import { BarList, DailyChart, Stat } from "./Charts";
import { DataTable, Feed, canvasHref, dash, date, dateTime, documentHref, useUserIndex } from "./common";

export interface UserDetail {
  sessions: {
    startedAt: number;
    lastSeenAt: number;
    activeMs: number;
    pageviews: number;
    paths: string[];
    device: string | null;
  }[];
  toolCalls: { tool: string; agent: string; ok: boolean; ms: number; at: number }[];
}

export function UserView({
  user,
  row,
  metrics,
  activity,
}: {
  user: AdminUser;
  row: UserRow | null;
  metrics: Metrics;
  activity: UserDetail;
}) {
  const users = useUserIndex(metrics);
  const name = displayName(user);
  const teams = metrics.teams.filter((t) => t.memberIds.includes(user.id));
  const teamIds = new Set(teams.map((t) => t.id));
  const documents = metrics.documents.filter((d) => d.workspaceId === user.id || teamIds.has(d.workspaceId));
  const feed = metrics.feed.filter((f) => f.userId === user.id);

  const daily = useMemo(() => {
    const cols = new Map<number, number[]>();
    for (let d = metrics.since; d <= dayStart(metrics.now); d += DAY) cols.set(d, [0, 0]);
    for (const s of activity.sessions) {
      const c = cols.get(dayStart(s.startedAt));
      if (c) c[0]! += s.activeMs;
    }
    for (const t of activity.toolCalls) {
      const c = cols.get(dayStart(t.at));
      if (c) c[1]! += 1;
    }
    return [...cols].map(([ts, values]) => ({ ts, values }));
  }, [activity, metrics.since, metrics.now]);

  const byTool = useMemo(() => countBy(activity.toolCalls.map((t) => t.tool)), [activity.toolCalls]);
  const byAgent = useMemo(() => countBy(activity.toolCalls.map((t) => t.agent)), [activity.toolCalls]);
  const pages = useMemo(() => countBy(activity.sessions.flatMap((s) => s.paths.map(normalizePath))), [activity.sessions]);
  const allTimeMs = activity.sessions.reduce((a, s) => a + s.activeMs, 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`${ADMIN_BASE}/users`} className="flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <Icon.ChevronLeft className="h-3.5 w-3.5" /> Users
      </Link>
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
        <Avatar src={user.imageUrl} name={name} size={56} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            {name}
            {!row?.known && <Chip tone="warn">Not in Clerk</Chip>}
            {user.banned && <Chip tone="danger">Banned</Chip>}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-ink-2">
            {user.email && <span>{user.email}</span>}
            {user.github && (
              <a
                href={`https://github.com/${user.github}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-ink hover:underline"
              >
                <GitHubMark className="h-3.5 w-3.5" /> {user.github}
              </a>
            )}
            <span className="mono text-xs text-ink-3">{user.id}</span>
          </div>
        </div>
        <dl className="ml-auto grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-3">Signed up</dt>
          <dt className="text-ink-3">Last sign-in</dt>
          <dt className="text-ink-3">Last active</dt>
          <dd className="text-ink">{user.createdAt ? date(user.createdAt) : "—"}</dd>
          <dd className="text-ink">{user.lastSignInAt ? relativeTime(user.lastSignInAt) : "—"}</dd>
          <dd className="text-ink">{row?.lastSeen ? relativeTime(row.lastSeen) : "—"}</dd>
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat label={`Time in app · ${metrics.days}d`} value={formatDuration(row?.activeMs ?? 0)} sub={`${formatDuration(allTimeMs)} across their last ${activity.sessions.length} sessions`} />
        <Stat
          label={`Sessions · ${metrics.days}d`}
          value={row?.sessions ?? 0}
          sub={row?.sessions ? `avg ${formatDuration(row.activeMs / row.sessions)} · ${row.pageviews} page views` : "No sessions"}
        />
        <Stat label="Active days" value={row?.activeDays ?? 0} sub={`of the last ${metrics.days}`} />
        <Stat
          label="Documents"
          value={documents.length}
          sub={`${row?.edits ?? 0} edits · ${row?.agentEdits ?? 0} by agents · ${row?.toolCalls ?? 0} tool calls`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Time in app per day">
          <DailyChart
            label={`${name}'s time in app per day`}
            format="duration"
            columns={daily.map((d) => ({ ts: d.ts, values: [d.values[0]!] }))}
            series={[{ name: "Time in app", color: "var(--viz-1)" }]}
          />
        </Panel>
        <Panel title="Agent tool calls per day">
          <DailyChart
            label={`${name}'s agent tool calls per day`}
            columns={daily.map((d) => ({ ts: d.ts, values: [d.values[1]!] }))}
            series={[{ name: "Tool calls", color: "var(--viz-1)" }]}
          />
        </Panel>
      </div>

      <Panel title={`Documents · ${documents.length}`} flush>
        <DocumentsTable rows={documents} teams={teams} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Pages visited" action="views">
          <BarList items={pages.slice(0, 10).map(([path, n]) => ({ key: path, label: <span className="mono text-xs">{path}</span>, value: n }))} />
        </Panel>
        <Panel title="Tools used" action="calls">
          <BarList empty="No agent calls." items={byTool.slice(0, 10).map(([tool, n]) => ({ key: tool, label: <span className="mono text-xs">{tool}</span>, value: n }))} />
        </Panel>
        <Panel title="Agents connected" action="calls">
          <BarList empty="No agents yet." items={byAgent.map(([agent, n]) => ({ key: agent, label: agent, value: n }))} />
          {teams.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="eyebrow pb-1.5">Teams</div>
              <ul className="flex flex-col gap-1 text-sm">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-ink">
                    {t.name}
                    {t.ownerId === user.id && <Chip>Owner</Chip>}
                    <span className="ml-auto text-xs text-ink-3">{t.members} members</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel title={`Sessions · ${activity.sessions.length}`} flush>
        <DataTable
          rows={activity.sessions}
          rowKey={(s) => `${s.startedAt}`}
          empty="No sessions recorded yet."
          initialSort={{ key: "start", dir: "desc" }}
          columns={[
            { key: "start", label: "Started", sort: (s) => s.startedAt, cell: (s) => dateTime(s.startedAt) },
            { key: "time", label: "Active", align: "right", sort: (s) => s.activeMs, cell: (s) => formatDuration(s.activeMs) },
            {
              key: "span",
              label: "Open for",
              align: "right",
              sort: (s) => s.lastSeenAt - s.startedAt,
              cell: (s) => formatDuration(s.lastSeenAt - s.startedAt),
            },
            { key: "views", label: "Pages", align: "right", sort: (s) => s.pageviews, cell: (s) => s.pageviews },
            { key: "device", label: "Device", cell: (s) => dash(s.device) },
            {
              key: "path",
              label: "Path",
              className: "max-w-[420px]",
              cell: (s) => (
                <span className="mono block truncate text-xs" title={s.paths.join(" → ")}>
                  {s.paths.map(normalizePath).join(" → ")}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Activity" flush>
        <Feed items={feed} users={users} showUser={false} filterable limit={200} />
      </Panel>
    </div>
  );
}

function countBy(xs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** Documents with their owner, size, edit counts and links to the read-only canvas. */
export function DocumentsTable({
  rows,
  teams,
  users,
}: {
  rows: DocRow[];
  teams: TeamRow[];
  users?: Map<string, AdminUser>;
}) {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  return (
    <DataTable
      rows={rows}
      rowKey={(d) => d._id}
      search={(d) => `${d.title} ${d.team ?? ""} ${d.repo ? `${d.repo.owner}/${d.repo.name}` : ""} ${users?.get(d.ownerId ?? "")?.email ?? ""}`}
      placeholder="Search documents"
      empty="No documents."
      initialSort={{ key: "updated", dir: "desc" }}
      columns={[
        {
          key: "title",
          label: "Document",
          sort: (d) => d.title.toLowerCase(),
          cell: (d) => (
            <div className="flex min-w-0 items-center gap-2">
              <Link href={documentHref(d._id)} className="truncate font-medium text-ink hover:underline">
                {d.title}
              </Link>
              {d.shared && <Chip tone="accent">Public link</Chip>}
            </div>
          ),
        },
        ...(users
          ? [
              {
                key: "owner",
                label: "Owner",
                cell: (d: DocRow) => {
                  const u = d.ownerId ? users.get(d.ownerId) : undefined;
                  return u ? (
                    <Link href={`${ADMIN_BASE}/users/${encodeURIComponent(u.id)}`} className="hover:underline">
                      {displayName(u)}
                    </Link>
                  ) : (
                    dash(null)
                  );
                },
              },
            ]
          : []),
        {
          key: "where",
          label: "Workspace",
          cell: (d) => (d.team ? <Chip>{teamName.get(d.workspaceId) ?? d.team}</Chip> : <span className="text-ink-3">Personal</span>),
        },
        {
          key: "repo",
          label: "Repository",
          cell: (d) =>
            dash(
              d.repo ? (
                <span className="flex items-center gap-1 text-xs" title={d.repo.problem ?? undefined}>
                  <GitHubMark className="h-3 w-3" />
                  {d.repo.owner}/{d.repo.name}
                  {d.repo.path && <span className="text-ink-3">/{d.repo.path}</span>}
                  {d.repo.problem && <Icon.Warning className="h-3 w-3 text-warn" />}
                </span>
              ) : null,
            ),
        },
        { key: "lines", label: "Lines", align: "right", sort: (d) => d.lines, cell: (d) => d.lines },
        { key: "edits", label: "Edits", align: "right", sort: (d) => d.edits, cell: (d) => dash(d.edits) },
        { key: "agent", label: "By agents", align: "right", sort: (d) => d.agentEdits, cell: (d) => dash(d.agentEdits) },
        { key: "updated", label: "Updated", sort: (d) => d.updatedAt, cell: (d) => relativeTime(d.updatedAt) },
        { key: "created", label: "Created", sort: (d) => d.createdAt, cell: (d) => date(d.createdAt) },
        {
          key: "open",
          label: "",
          cell: (d) => (
            <Link href={canvasHref(d._id)} className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-ink-2 hover:text-ink">
              View canvas <Icon.ArrowRight className="h-3 w-3" />
            </Link>
          ),
        },
      ]}
    />
  );
}
