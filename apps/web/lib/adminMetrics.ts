/**
 * The admin dashboard's numbers, computed from raw rows (Clerk's users plus
 * `adminDashboard.overview`). Pure, so tests can pin every definition:
 *
 *   - A user is *active* on a day when a browser session of theirs was open
 *     that day (UsageBeacon heartbeats) or an agent called a tool for them.
 *   - *Time in app* is a session's visible, non-idle time (`activeMs`).
 *   - An *edit* is a revision; revisions in a personal workspace belong to its
 *     owner, those in a team workspace to the team.
 *   - Days are UTC.
 */

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  github: string | null;
  imageUrl: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  lastActiveAt: number | null;
  banned: boolean;
}

export type AuthorKind = "user" | "agent" | "git";

export interface RawDocument {
  _id: string;
  createdAt: number;
  workspaceId: string;
  title: string;
  updatedAt: number;
  lines: number;
  bytes: number;
  shared: boolean;
  repo: { owner: string; name: string; branch: string; path: string | null; problem: string | null } | null;
}
export interface RawWorkspace {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}
export interface RawMember {
  workspaceId: string;
  userId: string | null;
  email: string;
  role: string;
  createdAt: number;
}
export interface RawRevision {
  _id: string;
  documentId: string;
  workspaceId: string;
  createdAt: number;
  author: { kind: AuthorKind; name?: string };
  summary: string | null;
}
export interface RawSession {
  userId: string;
  startedAt: number;
  lastSeenAt: number;
  activeMs: number;
  pageviews: number;
  paths: string[];
  device: string | null;
}
export interface RawToolCall {
  userId: string;
  tool: string;
  agent: string;
  ok: boolean;
  ms: number;
  at: number;
}

export interface RawData {
  documents: RawDocument[];
  workspaces: RawWorkspace[];
  members: RawMember[];
  revisions: RawRevision[];
  sessions: RawSession[];
  toolCalls: RawToolCall[];
  libraryTypes: { workspaceId: string; tag: string }[];
  truncated: boolean;
}

/* ------------------------------------------------------------------ helpers */

export const dayStart = (ts: number): number => Math.floor(ts / DAY) * DAY;
export const dayKey = (ts: number): string => new Date(dayStart(ts)).toISOString().slice(0, 10);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

/** Page paths with their ids folded: /documents/abc → /documents/[id]. */
export function normalizePath(path: string): string {
  const p = path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  return p
    .replace(/^\/documents\/[^/]+/, "/documents/[id]")
    .replace(/^\/share\/[^/]+/, "/share/[slug]")
    .replace(/^\/admin-dashboard\/(users|canvas)\/[^/]+/, "/admin-dashboard/$1/[id]");
}

/** Each UTC day a session touched. */
function sessionDays(s: RawSession): number[] {
  const days: number[] = [];
  for (let d = dayStart(s.startedAt); d <= s.lastSeenAt; d += DAY) days.push(d);
  return days;
}

/** A user's display name: name, GitHub login, email, or a shortened id. */
export const displayName = (u: Pick<AdminUser, "id" | "name" | "github" | "email">): string =>
  u.name ?? u.github ?? u.email ?? `${u.id.slice(0, 12)}…`;

/** Placeholder for ids Convex knows but Clerk doesn't (deleted users, pre-auth workspaces). */
export const unknownUser = (id: string): AdminUser => ({
  id,
  name: null,
  email: null,
  github: null,
  imageUrl: null,
  createdAt: 0,
  lastSignInAt: null,
  lastActiveAt: null,
  banned: false,
});

/* ------------------------------------------------------------------ metrics */

export interface DailyPoint {
  day: string;
  ts: number;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  activeMs: number;
  edits: Record<AuthorKind, number>;
  toolCalls: number;
  newDocuments: number;
}

export interface UserRow {
  user: AdminUser;
  known: boolean;
  sessions: number;
  activeMs: number;
  pageviews: number;
  activeDays: number;
  firstSeen: number | null;
  lastSeen: number | null;
  documents: number;
  edits: number;
  agentEdits: number;
  toolCalls: number;
  agents: string[];
  teams: number;
}

export interface ToolRow {
  tool: string;
  calls: number;
  errors: number;
  users: number;
  avgMs: number;
  p95Ms: number;
}

export interface AgentRow {
  agent: string;
  toolCalls: number;
  edits: number;
  users: number;
  lastUsed: number;
}

export interface DocRow extends RawDocument {
  ownerId: string | null;
  team: string | null;
  edits: number;
  agentEdits: number;
  lastEditBy: RawRevision["author"] | null;
}

export interface Cohort {
  week: number;
  size: number;
  /** Share of the cohort active in week 0, 1, 2…; null for weeks still to come. */
  retained: (number | null)[];
}

export type FeedItem =
  | { kind: "signup"; at: number; userId: string }
  | { kind: "session"; at: number; userId: string; activeMs: number; pageviews: number; paths: string[]; device: string | null }
  | { kind: "edit"; at: number; userId: string | null; documentId: string; title: string; author: RawRevision["author"]; summary: string | null }
  | { kind: "tools"; at: number; userId: string; agent: string; calls: number; tools: string[]; errors: number }
  | { kind: "document"; at: number; userId: string | null; documentId: string; title: string };

export interface Metrics {
  now: number;
  since: number;
  days: number;
  kpis: {
    users: number;
    newUsers: number;
    activeUsers: number;
    dau: number;
    wau: number;
    mau: number;
    sessions: number;
    activeMs: number;
    avgSessionMs: number;
    medianSessionMs: number;
    activeMsPerActiveUser: number;
    pageviews: number;
    documents: number;
    newDocuments: number;
    edits: Record<AuthorKind, number>;
    toolCalls: number;
    toolErrors: number;
    agentUsers: number;
    sharedDocuments: number;
    repoDocuments: number;
    storedDocuments: number;
    teams: number;
    pendingInvites: number;
    customTypes: number;
  };
  daily: DailyPoint[];
  users: UserRow[];
  documents: DocRow[];
  tools: ToolRow[];
  agents: AgentRow[];
  paths: { path: string; views: number; users: number }[];
  devices: { device: string; sessions: number; users: number }[];
  cohorts: Cohort[];
  teams: TeamRow[];
  feed: FeedItem[];
  truncated: boolean;
}

export interface TeamRow {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  /** Signed-in members (the owner included). */
  members: number;
  memberIds: string[];
  pending: number;
  documents: number;
}

const isPersonal = (workspaceId: string) => workspaceId.startsWith("user_");

export function computeMetrics(
  raw: RawData,
  clerkUsers: AdminUser[],
  opts: { now: number; days: number; exclude?: string[] },
): Metrics {
  const { now, days } = opts;
  const since = dayStart(now) - (days - 1) * DAY;
  const exclude = new Set(opts.exclude ?? []);
  const keep = (userId: string | null) => userId === null || !exclude.has(userId);

  const workspaces = new Map(raw.workspaces.map((w) => [w._id, w]));
  const ownerOf = (workspaceId: string): string | null =>
    isPersonal(workspaceId) ? workspaceId : (workspaces.get(workspaceId)?.ownerId ?? null);
  /** The person a revision belongs to: a personal workspace's owner, else nobody in particular. */
  const personOf = (workspaceId: string): string | null => (isPersonal(workspaceId) ? workspaceId : null);

  const sessions = raw.sessions.filter((s) => s.lastSeenAt >= since && keep(s.userId));
  const toolCalls = raw.toolCalls.filter((t) => t.at >= since && keep(t.userId));
  const revisions = raw.revisions.filter((r) => r.createdAt >= since && keep(personOf(r.workspaceId)));
  const documents = raw.documents.filter((d) => keep(ownerOf(d.workspaceId)));
  const users = clerkUsers.filter((u) => keep(u.id));

  /* Users: Clerk's, plus any id that shows up in activity without a Clerk record. */
  const byId = new Map(users.map((u) => [u.id, u]));
  const known = new Set(byId.keys());
  const seen = [
    ...sessions.map((s) => s.userId),
    ...toolCalls.map((t) => t.userId),
    ...documents.map((d) => d.workspaceId).filter(isPersonal),
  ];
  for (const id of seen) if (!byId.has(id)) byId.set(id, unknownUser(id));

  /* Daily series. */
  const daily = new Map<number, DailyPoint & { active: Set<string> }>();
  for (let d = since; d <= dayStart(now); d += DAY) {
    daily.set(d, {
      day: dayKey(d),
      ts: d,
      activeUsers: 0,
      newUsers: 0,
      sessions: 0,
      activeMs: 0,
      edits: { user: 0, agent: 0, git: 0 },
      toolCalls: 0,
      newDocuments: 0,
      active: new Set(),
    });
  }
  const at = (ts: number) => daily.get(dayStart(ts));
  const activeByUser = new Map<string, Set<number>>();
  const markActive = (userId: string, day: number) => {
    at(day)?.active.add(userId);
    let set = activeByUser.get(userId);
    if (!set) activeByUser.set(userId, (set = new Set()));
    set.add(day);
  };
  for (const s of sessions) {
    const p = at(s.startedAt) ?? at(s.lastSeenAt);
    if (p) {
      p.sessions++;
      p.activeMs += s.activeMs;
    }
    for (const d of sessionDays(s)) markActive(s.userId, d);
  }
  for (const t of toolCalls) {
    const p = at(t.at);
    if (p) p.toolCalls++;
    markActive(t.userId, dayStart(t.at));
  }
  for (const r of revisions) {
    const p = at(r.createdAt);
    if (p) p.edits[r.author.kind]++;
  }
  for (const u of users) {
    const p = at(u.createdAt);
    if (p) p.newUsers++;
  }
  for (const d of documents) {
    const p = at(d.createdAt);
    if (p) p.newDocuments++;
  }
  const dailyPoints: DailyPoint[] = [...daily.values()].map(({ active, ...p }) => ({
    ...p,
    activeUsers: active.size,
  }));

  const activeWithin = (ms: number) => {
    const from = dayStart(now) - ms + DAY;
    let n = 0;
    for (const days of activeByUser.values()) if ([...days].some((d) => d >= from)) n++;
    return n;
  };

  /* Per user. */
  const teamsOf = new Map<string, number>();
  for (const m of raw.members) if (m.userId) teamsOf.set(m.userId, (teamsOf.get(m.userId) ?? 0) + 1);
  for (const w of raw.workspaces) teamsOf.set(w.ownerId, (teamsOf.get(w.ownerId) ?? 0) + 1);

  const rows = new Map<string, UserRow>();
  for (const u of byId.values()) {
    rows.set(u.id, {
      user: u,
      known: known.has(u.id),
      sessions: 0,
      activeMs: 0,
      pageviews: 0,
      activeDays: activeByUser.get(u.id)?.size ?? 0,
      firstSeen: null,
      lastSeen: u.lastActiveAt,
      documents: 0,
      edits: 0,
      agentEdits: 0,
      toolCalls: 0,
      agents: [],
      teams: teamsOf.get(u.id) ?? 0,
    });
  }
  const touch = (row: UserRow, ts: number) => {
    row.firstSeen = row.firstSeen === null ? ts : Math.min(row.firstSeen, ts);
    row.lastSeen = row.lastSeen === null ? ts : Math.max(row.lastSeen, ts);
  };
  for (const s of sessions) {
    const row = rows.get(s.userId)!;
    row.sessions++;
    row.activeMs += s.activeMs;
    row.pageviews += s.pageviews;
    touch(row, s.startedAt);
    touch(row, s.lastSeenAt);
  }
  const agentsOf = new Map<string, Set<string>>();
  for (const t of toolCalls) {
    const row = rows.get(t.userId)!;
    row.toolCalls++;
    touch(row, t.at);
    let set = agentsOf.get(t.userId);
    if (!set) agentsOf.set(t.userId, (set = new Set()));
    set.add(t.agent);
  }
  for (const d of documents) {
    const row = isPersonal(d.workspaceId) ? rows.get(d.workspaceId) : undefined;
    if (row) row.documents++;
  }
  for (const r of revisions) {
    const person = personOf(r.workspaceId);
    const row = person ? rows.get(person) : undefined;
    if (!row) continue;
    if (r.author.kind === "agent") {
      row.agentEdits++;
      if (r.author.name) {
        let set = agentsOf.get(row.user.id);
        if (!set) agentsOf.set(row.user.id, (set = new Set()));
        set.add(r.author.name);
      }
    } else row.edits++;
  }
  for (const [id, set] of agentsOf) rows.get(id)!.agents = [...set].sort();
  const userRows = [...rows.values()].sort(
    (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || b.user.createdAt - a.user.createdAt,
  );

  /* Documents. */
  const revByDoc = new Map<string, RawRevision[]>();
  for (const r of revisions) {
    const list = revByDoc.get(r.documentId);
    if (list) list.push(r);
    else revByDoc.set(r.documentId, [r]);
  }
  const docRows: DocRow[] = documents
    .map((d) => {
      const revs = (revByDoc.get(d._id) ?? []).sort((a, b) => b.createdAt - a.createdAt);
      return {
        ...d,
        ownerId: ownerOf(d.workspaceId),
        team: isPersonal(d.workspaceId) ? null : (workspaces.get(d.workspaceId)?.name ?? "Unknown team"),
        edits: revs.length,
        agentEdits: revs.filter((r) => r.author.kind === "agent").length,
        lastEditBy: revs[0]?.author ?? null,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  /* Tools and agents. */
  const toolMap = new Map<string, RawToolCall[]>();
  for (const t of toolCalls) {
    const list = toolMap.get(t.tool);
    if (list) list.push(t);
    else toolMap.set(t.tool, [t]);
  }
  const tools: ToolRow[] = [...toolMap]
    .map(([tool, calls]) => ({
      tool,
      calls: calls.length,
      errors: calls.filter((c) => !c.ok).length,
      users: new Set(calls.map((c) => c.userId)).size,
      avgMs: Math.round(sum(calls.map((c) => c.ms)) / calls.length),
      p95Ms: percentile(calls.map((c) => c.ms), 95),
    }))
    .sort((a, b) => b.calls - a.calls);

  const agentMap = new Map<string, AgentRow & { userSet: Set<string> }>();
  const agentRow = (agent: string) => {
    let row = agentMap.get(agent);
    if (!row) agentMap.set(agent, (row = { agent, toolCalls: 0, edits: 0, users: 0, lastUsed: 0, userSet: new Set() }));
    return row;
  };
  for (const t of toolCalls) {
    const row = agentRow(t.agent);
    row.toolCalls++;
    row.userSet.add(t.userId);
    row.lastUsed = Math.max(row.lastUsed, t.at);
  }
  for (const r of revisions) {
    if (r.author.kind !== "agent") continue;
    const row = agentRow(r.author.name ?? "agent");
    row.edits++;
    const person = personOf(r.workspaceId);
    if (person) row.userSet.add(person);
    row.lastUsed = Math.max(row.lastUsed, r.createdAt);
  }
  const agents: AgentRow[] = [...agentMap.values()]
    .map(({ userSet, ...row }) => ({ ...row, users: userSet.size }))
    .sort((a, b) => b.toolCalls + b.edits - (a.toolCalls + a.edits));

  /* Pages and devices. */
  const pathMap = new Map<string, { views: number; users: Set<string> }>();
  const deviceMap = new Map<string, { sessions: number; users: Set<string> }>();
  for (const s of sessions) {
    for (const p of s.paths) {
      const key = normalizePath(p);
      let e = pathMap.get(key);
      if (!e) pathMap.set(key, (e = { views: 0, users: new Set() }));
      e.views++;
      e.users.add(s.userId);
    }
    const device = s.device ?? "Unknown";
    let e = deviceMap.get(device);
    if (!e) deviceMap.set(device, (e = { sessions: 0, users: new Set() }));
    e.sessions++;
    e.users.add(s.userId);
  }
  const paths = [...pathMap]
    .map(([path, e]) => ({ path, views: e.views, users: e.users.size }))
    .sort((a, b) => b.views - a.views);
  const devices = [...deviceMap]
    .map(([device, e]) => ({ device, sessions: e.sessions, users: e.users.size }))
    .sort((a, b) => b.sessions - a.sessions);

  /* Weekly signup cohorts within the window: who came back each week after. */
  // Weeks start on Monday (the epoch was a Thursday; Jan 5, 1970 a Monday).
  const MONDAY = 4 * DAY;
  const weekOf = (ts: number) => Math.floor((ts - MONDAY) / WEEK) * WEEK + MONDAY;
  const cohortMap = new Map<number, string[]>();
  for (const u of users) {
    if (u.createdAt < since) continue;
    const w = weekOf(u.createdAt);
    const list = cohortMap.get(w);
    if (list) list.push(u.id);
    else cohortMap.set(w, [u.id]);
  }
  const thisWeek = weekOf(now);
  const cohorts: Cohort[] = [...cohortMap]
    .sort((a, b) => a[0] - b[0])
    .map(([week, ids]) => {
      const weeks = Math.round((thisWeek - week) / WEEK) + 1;
      const retained: (number | null)[] = [];
      for (let k = 0; k < Math.min(weeks, 12); k++) {
        const from = week + k * WEEK;
        const back = ids.filter((id) =>
          [...(activeByUser.get(id) ?? [])].some((d) => d >= from && d < from + WEEK),
        ).length;
        retained.push(back / ids.length);
      }
      return { week, size: ids.length, retained };
    });

  /* Team workspaces. */
  const teams: TeamRow[] = raw.workspaces
    .map((w) => {
      const rows = raw.members.filter((m) => m.workspaceId === w._id);
      const memberIds = [...new Set([w.ownerId, ...rows.flatMap((m) => (m.userId ? [m.userId] : []))])];
      return {
        id: w._id,
        name: w.name,
        ownerId: w.ownerId,
        createdAt: w.createdAt,
        members: memberIds.length,
        memberIds,
        pending: rows.filter((m) => !m.userId).length,
        documents: raw.documents.filter((d) => d.workspaceId === w._id).length,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  /* Activity feed: newest first. */
  const title = new Map(raw.documents.map((d) => [d._id, d.title]));
  const feed: FeedItem[] = [];
  for (const u of users) if (u.createdAt >= since) feed.push({ kind: "signup", at: u.createdAt, userId: u.id });
  for (const s of sessions)
    feed.push({
      kind: "session",
      at: s.startedAt,
      userId: s.userId,
      activeMs: s.activeMs,
      pageviews: s.pageviews,
      paths: s.paths,
      device: s.device,
    });
  for (const r of revisions)
    feed.push({
      kind: "edit",
      at: r.createdAt,
      userId: personOf(r.workspaceId),
      documentId: r.documentId,
      title: title.get(r.documentId) ?? "Deleted document",
      author: r.author,
      summary: r.summary,
    });
  for (const d of documents)
    if (d.createdAt >= since)
      feed.push({ kind: "document", at: d.createdAt, userId: ownerOf(d.workspaceId), documentId: d._id, title: d.title });
  // Tool calls come in bursts; one entry per user and agent per burst (gaps under 10 minutes).
  const calls = [...toolCalls].sort((a, b) => a.at - b.at);
  const open = new Map<string, Extract<FeedItem, { kind: "tools" }> & { last: number; toolSet: Set<string> }>();
  const flush = (key: string) => {
    const b = open.get(key);
    if (!b) return;
    const { last: _last, toolSet, ...item } = b;
    feed.push({ ...item, tools: [...toolSet] });
    open.delete(key);
  };
  for (const t of calls) {
    const key = `${t.userId}\u0000${t.agent}`;
    const b = open.get(key);
    if (b && t.at - b.last < 10 * 60_000) {
      b.calls++;
      b.last = t.at;
      b.toolSet.add(t.tool);
      if (!t.ok) b.errors++;
      continue;
    }
    flush(key);
    open.set(key, {
      kind: "tools",
      at: t.at,
      userId: t.userId,
      agent: t.agent,
      calls: 1,
      tools: [],
      errors: t.ok ? 0 : 1,
      last: t.at,
      toolSet: new Set([t.tool]),
    });
  }
  for (const key of [...open.keys()]) flush(key);
  feed.sort((a, b) => b.at - a.at);

  const sessionMs = sessions.map((s) => s.activeMs);
  const activeUsers = activeByUser.size;
  const totalActiveMs = sum(sessionMs);
  const edits = { user: 0, agent: 0, git: 0 };
  for (const r of revisions) edits[r.author.kind]++;

  return {
    now,
    since,
    days,
    kpis: {
      users: users.length,
      newUsers: users.filter((u) => u.createdAt >= since).length,
      activeUsers,
      dau: activeWithin(DAY),
      wau: activeWithin(WEEK),
      mau: activeWithin(30 * DAY),
      sessions: sessions.length,
      activeMs: totalActiveMs,
      avgSessionMs: sessions.length ? totalActiveMs / sessions.length : 0,
      medianSessionMs: median(sessionMs),
      activeMsPerActiveUser: activeUsers ? totalActiveMs / activeUsers : 0,
      pageviews: sum(sessions.map((s) => s.pageviews)),
      documents: documents.length,
      newDocuments: documents.filter((d) => d.createdAt >= since).length,
      edits,
      toolCalls: toolCalls.length,
      toolErrors: toolCalls.filter((t) => !t.ok).length,
      agentUsers: new Set(toolCalls.map((t) => t.userId)).size,
      sharedDocuments: documents.filter((d) => d.shared).length,
      repoDocuments: documents.filter((d) => d.repo).length,
      storedDocuments: documents.filter((d) => d.repo?.path).length,
      teams: raw.workspaces.length,
      pendingInvites: raw.members.filter((m) => !m.userId).length,
      customTypes: raw.libraryTypes.length,
    },
    daily: dailyPoints,
    users: userRows,
    documents: docRows,
    tools,
    agents,
    paths,
    devices,
    cohorts,
    teams,
    feed,
    truncated: raw.truncated,
  };
}

/* --------------------------------------------------------------- formatting */

/** 95 min → "1h 35m", 42 s → "42s". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d ${h % 24}h`;
}

export const formatNumber = (n: number): string =>
  n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString("en-US");

export const formatPercent = (x: number): string => `${Math.round(x * 100)}%`;
