import { describe, expect, it } from "vitest";
import { isAdmin, type AdminCandidate } from "../lib/admin";
import {
  DAY,
  computeMetrics,
  dayStart,
  formatDuration,
  median,
  normalizePath,
  type AdminUser,
  type RawData,
} from "../lib/adminMetrics";
import { failedIds } from "../lib/server/usage";
import { describeDevice } from "../components/UsageBeacon";

const email = (emailAddress: string, status = "verified") => ({ emailAddress, verification: { status } });
const github = (username: string, status = "verified") => ({ provider: "oauth_github", username, verification: { status } });
const candidate = (c: Partial<AdminCandidate>): AdminCandidate => ({ emailAddresses: [], externalAccounts: [], ...c });

describe("isAdmin", () => {
  it("admits the admin's verified email or verified GitHub login", () => {
    expect(isAdmin(candidate({ emailAddresses: [email("tombyrne788@gmail.com")] }))).toBe(true);
    expect(isAdmin(candidate({ emailAddresses: [email("TomByrne788@Gmail.com ")] }))).toBe(true);
    expect(isAdmin(candidate({ externalAccounts: [github("tom-byrn")] }))).toBe(true);
    expect(isAdmin(candidate({ externalAccounts: [github("Tom-Byrn")] }))).toBe(true);
  });

  it("refuses everyone else, and anything unverified", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(candidate({}))).toBe(false);
    expect(isAdmin(candidate({ emailAddresses: [email("tombyrne788@gmail.com", "unverified")] }))).toBe(false);
    expect(isAdmin(candidate({ emailAddresses: [email("tombyrne788@gmail.com.evil.dev")] }))).toBe(false);
    expect(isAdmin(candidate({ externalAccounts: [github("tom-byrn", "unverified")] }))).toBe(false);
    expect(isAdmin(candidate({ externalAccounts: [github("tom-byrn-2")] }))).toBe(false);
    expect(
      isAdmin(candidate({ externalAccounts: [{ provider: "oauth_gitlab", username: "tom-byrn", verification: { status: "verified" } }] })),
    ).toBe(false);
  });
});

const NOW = Date.UTC(2026, 8, 30, 15, 0);
const TODAY = dayStart(NOW);
const user = (id: string, createdAt: number, extra: Partial<AdminUser> = {}): AdminUser => ({
  id,
  name: null,
  email: `${id}@example.com`,
  github: null,
  imageUrl: null,
  createdAt,
  lastSignInAt: null,
  lastActiveAt: null,
  banned: false,
  ...extra,
});
const empty = (): RawData => ({
  documents: [],
  workspaces: [],
  members: [],
  revisions: [],
  sessions: [],
  toolCalls: [],
  libraryTypes: [],
  truncated: false,
});
const session = (userId: string, startedAt: number, activeMs: number, paths = ["/"]) => ({
  userId,
  startedAt,
  lastSeenAt: startedAt + activeMs,
  activeMs,
  pageviews: paths.length,
  paths,
  device: "Chrome · macOS",
});

describe("computeMetrics", () => {
  it("counts active users per day from sessions and tool calls", () => {
    const raw = empty();
    raw.sessions = [
      session("user_a", TODAY + 3_600_000, 600_000),
      session("user_a", TODAY - DAY + 3_600_000, 300_000),
      session("user_b", TODAY - 2 * DAY + 3_600_000, 60_000),
    ];
    raw.toolCalls = [{ userId: "user_c", tool: "get_document", agent: "Claude Code", ok: true, ms: 40, at: TODAY + 1000 }];
    const m = computeMetrics(raw, [user("user_a", TODAY - 10 * DAY), user("user_b", TODAY - DAY), user("user_c", 0)], {
      now: NOW,
      days: 7,
    });
    expect(m.daily).toHaveLength(7);
    expect(m.daily.at(-1)!.activeUsers).toBe(2); // a (session) + c (agent)
    expect(m.daily.at(-2)!.activeUsers).toBe(1);
    expect(m.kpis.dau).toBe(2);
    expect(m.kpis.wau).toBe(3);
    expect(m.kpis.activeMs).toBe(960_000);
    expect(m.kpis.medianSessionMs).toBe(300_000);
    expect(m.kpis.newUsers).toBe(1);
    const a = m.users.find((r) => r.user.id === "user_a")!;
    expect(a.sessions).toBe(2);
    expect(a.activeDays).toBe(2);
  });

  it("attributes edits in personal workspaces to their owner, team edits to nobody", () => {
    const raw = empty();
    raw.workspaces = [{ _id: "team1", name: "Acme", ownerId: "user_a", createdAt: 0 }];
    raw.members = [
      { workspaceId: "team1", userId: "user_b", email: "b@example.com", role: "editor", createdAt: 0 },
      { workspaceId: "team1", userId: null, email: "c@example.com", role: "viewer", createdAt: 0 },
    ];
    raw.documents = [
      { _id: "d1", createdAt: TODAY, workspaceId: "user_a", title: "Mine", updatedAt: TODAY, lines: 10, bytes: 100, shared: true, repo: null },
      { _id: "d2", createdAt: TODAY, workspaceId: "team1", title: "Ours", updatedAt: TODAY, lines: 20, bytes: 200, shared: false, repo: null },
    ];
    raw.revisions = [
      { _id: "r1", documentId: "d1", workspaceId: "user_a", createdAt: TODAY + 1, author: { kind: "user" }, summary: null },
      { _id: "r2", documentId: "d1", workspaceId: "user_a", createdAt: TODAY + 2, author: { kind: "agent", name: "Cursor" }, summary: "add cache" },
      { _id: "r3", documentId: "d2", workspaceId: "team1", createdAt: TODAY + 3, author: { kind: "user" }, summary: null },
    ];
    const m = computeMetrics(raw, [user("user_a", 0), user("user_b", 0)], { now: NOW, days: 7 });
    const a = m.users.find((r) => r.user.id === "user_a")!;
    expect([a.documents, a.edits, a.agentEdits, a.agents]).toEqual([1, 1, 1, ["Cursor"]]);
    expect(m.kpis.edits).toEqual({ user: 2, agent: 1, git: 0 });
    expect(m.documents.find((d) => d._id === "d2")).toMatchObject({ team: "Acme", ownerId: "user_a", edits: 1 });
    expect(m.teams[0]).toMatchObject({ members: 2, pending: 1, documents: 1 });
    expect(m.agents).toEqual([expect.objectContaining({ agent: "Cursor", edits: 1, users: 1 })]);
    expect(m.feed.filter((f) => f.kind === "edit").map((f) => f.userId)).toEqual([null, "user_a", "user_a"]);
  });

  it("leaves the admin out when asked, and lists ids Clerk doesn't know", () => {
    const raw = empty();
    raw.sessions = [session("user_me", TODAY, 60_000), session("user_ghost", TODAY, 60_000)];
    const m = computeMetrics(raw, [user("user_me", 0)], { now: NOW, days: 7, exclude: ["user_me"] });
    expect(m.kpis.users).toBe(0);
    expect(m.users.map((r) => [r.user.id, r.known])).toEqual([["user_ghost", false]]);
  });

  it("groups bursts of tool calls into one feed entry and computes per-tool stats", () => {
    const raw = empty();
    raw.toolCalls = [0, 1, 2].map((i) => ({
      userId: "user_a",
      tool: i === 2 ? "update_document" : "get_document",
      agent: "Claude Code",
      ok: i !== 2,
      ms: 100 * (i + 1),
      at: TODAY + i * 60_000,
    }));
    raw.toolCalls.push({ userId: "user_a", tool: "get_document", agent: "Claude Code", ok: true, ms: 50, at: TODAY + 3 * 3_600_000 });
    const m = computeMetrics(raw, [user("user_a", 0)], { now: NOW, days: 7 });
    const bursts = m.feed.filter((f) => f.kind === "tools");
    expect(bursts.map((b) => b.kind === "tools" && [b.calls, b.errors])).toEqual([[1, 0], [3, 1]]);
    expect(m.tools[0]).toMatchObject({ tool: "get_document", calls: 3, errors: 0 });
    expect(m.kpis.toolErrors).toBe(1);
  });

  it("builds weekly sign-up cohorts from later activity", () => {
    const raw = empty();
    const weekAgo = TODAY - 7 * DAY;
    raw.sessions = [session("user_a", TODAY, 1000)];
    const m = computeMetrics(raw, [user("user_a", weekAgo), user("user_b", weekAgo)], { now: NOW, days: 30 });
    const cohort = m.cohorts.find((c) => c.size === 2)!;
    expect(cohort.retained.at(-1)).toBe(0.5);
  });
});

describe("helpers", () => {
  it("normalizes paths", () => {
    expect(normalizePath("/documents/abc123?x=1")).toBe("/documents/[id]");
    expect(normalizePath("/share/zzz/")).toBe("/share/[slug]");
    expect(normalizePath("/")).toBe("/");
  });
  it("formats durations", () => {
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(95 * 60_000)).toBe("1h 35m");
    expect(median([5, 1, 3, 2])).toBe(2.5);
  });
  it("describes devices coarsely", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe(
      "Chrome · macOS",
    );
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1")).toBe(
      "Safari · iOS",
    );
  });
  it("finds failed MCP tool calls in JSON and SSE responses", () => {
    expect(failedIds(401, "")).toBe("all");
    expect([...(failedIds(200, '{"jsonrpc":"2.0","id":1,"result":{"isError":true}}') as Set<unknown>)]).toEqual([1]);
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[]}}\n\ndata: {"jsonrpc":"2.0","id":3,"error":{"code":1}}\n';
    expect([...(failedIds(200, sse) as Set<unknown>)]).toEqual([3]);
  });
});
