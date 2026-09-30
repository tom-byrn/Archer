"use client";

import { displayName, formatDuration, type Metrics, type UserRow } from "@/lib/adminMetrics";
import { Chip, relativeTime } from "../ui";
import { Panel } from "./AdminChrome";
import { DataTable, UserCell, dash, date, useUserIndex, type ColumnDef } from "./common";
import { Truncated } from "./OverviewView";

const COLUMNS: ColumnDef<UserRow>[] = [
  {
    key: "user",
    label: "User",
    sort: (r) => displayName(r.user).toLowerCase(),
    cell: (r) => (
      <div className="flex items-center gap-2">
        <UserCell user={r.user} />
        {!r.known && <Chip tone="warn">Not in Clerk</Chip>}
        {r.user.banned && <Chip tone="danger">Banned</Chip>}
      </div>
    ),
  },
  { key: "joined", label: "Signed up", sort: (r) => r.user.createdAt, cell: (r) => dash(r.user.createdAt ? date(r.user.createdAt) : null) },
  {
    key: "seen",
    label: "Last seen",
    sort: (r) => r.lastSeen ?? 0,
    cell: (r) => dash(r.lastSeen ? relativeTime(r.lastSeen) : null),
  },
  { key: "days", label: "Active days", align: "right", sort: (r) => r.activeDays, cell: (r) => dash(r.activeDays) },
  { key: "sessions", label: "Sessions", align: "right", sort: (r) => r.sessions, cell: (r) => dash(r.sessions) },
  { key: "time", label: "Time in app", align: "right", sort: (r) => r.activeMs, cell: (r) => dash(r.activeMs ? formatDuration(r.activeMs) : null) },
  {
    key: "avg",
    label: "Avg session",
    align: "right",
    sort: (r) => (r.sessions ? r.activeMs / r.sessions : 0),
    cell: (r) => dash(r.sessions ? formatDuration(r.activeMs / r.sessions) : null),
  },
  { key: "docs", label: "Docs", align: "right", sort: (r) => r.documents, cell: (r) => dash(r.documents) },
  { key: "edits", label: "Edits", align: "right", sort: (r) => r.edits, cell: (r) => dash(r.edits) },
  { key: "agentEdits", label: "Agent edits", align: "right", sort: (r) => r.agentEdits, cell: (r) => dash(r.agentEdits) },
  { key: "tools", label: "Tool calls", align: "right", sort: (r) => r.toolCalls, cell: (r) => dash(r.toolCalls) },
  {
    key: "agents",
    label: "Agents",
    cell: (r) =>
      dash(
        r.agents.length ? (
          <span className="flex flex-wrap gap-1">
            {r.agents.map((a) => (
              <Chip key={a} tone="accent">
                {a}
              </Chip>
            ))}
          </span>
        ) : null,
      ),
  },
];

export function UsersView({ metrics }: { metrics: Metrics }) {
  const teams = metrics.teams;
  const users = useUserIndex(metrics);
  return (
    <div className="flex flex-col gap-5">
      <Truncated metrics={metrics} />
      <Panel title={`Users · ${metrics.users.length}`} action={`Activity columns cover the last ${metrics.days} days`} flush>
        <DataTable
          rows={metrics.users}
          columns={COLUMNS}
          rowKey={(r) => r.user.id}
          search={(r) => [r.user.name, r.user.email, r.user.github, r.user.id].filter(Boolean).join(" ")}
          placeholder="Search by name, email, GitHub or id"
          initialSort={{ key: "seen", dir: "desc" }}
        />
      </Panel>
      <Panel title={`Team workspaces · ${teams.length}`} flush>
        <DataTable
          rows={teams}
          rowKey={(t) => t.id}
          empty="No team workspaces yet."
          initialSort={{ key: "created", dir: "desc" }}
          columns={[
            { key: "name", label: "Team", sort: (t) => t.name.toLowerCase(), cell: (t) => <span className="font-medium text-ink">{t.name}</span> },
            {
              key: "owner",
              label: "Owner",
              cell: (t) => {
                const u = users.get(t.ownerId);
                return u ? <UserCell user={u} detail={false} /> : <span className="mono text-xs">{t.ownerId}</span>;
              },
            },
            { key: "members", label: "Members", align: "right", sort: (t) => t.members, cell: (t) => t.members },
            { key: "pending", label: "Pending invites", align: "right", sort: (t) => t.pending, cell: (t) => dash(t.pending) },
            { key: "docs", label: "Documents", align: "right", sort: (t) => t.documents, cell: (t) => dash(t.documents) },
            { key: "created", label: "Created", sort: (t) => t.createdAt, cell: (t) => date(t.createdAt) },
          ]}
        />
      </Panel>
    </div>
  );
}
