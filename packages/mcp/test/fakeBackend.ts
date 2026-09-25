/**
 * An in-memory stand-in for the Convex functions behind `db` (src/backend.ts),
 * so the tools can run in tests without a deployment. It keeps the rules the
 * tools rely on: access by workspace role (queries need viewer, writes editor,
 * member management owner, and a team keeps a signed-in owner), a revision
 * appended on every agent save that changes something, drift reports
 * replaced whole. Install it with `Object.assign(db, fake.db)`; seed it
 * through `fake.state`.
 */
import { agentAuthor } from "../src/backend";
import type {
  CustomTypeRow,
  DriftFinding,
  DriftRow,
  MemberRow,
  ProjectDoc,
  PublicDoc,
  RepoLink,
  RevisionRow,
  Workspace,
  WorkspaceSummary,
} from "../src/backend";

type Role = WorkspaceSummary["role"];

export interface FakeMember {
  id: string;
  /** Absent while the invite is pending. */
  userId?: string;
  email: string;
  role: Role;
  createdAt: number;
}

export interface FakeState {
  /** Team workspaces. Personal workspaces are implicit. */
  teams: { id: string; name: string; members: FakeMember[] }[];
  projects: Map<string, ProjectDoc & { workspaceId: string }>;
  /** Newest first, like the Convex query. */
  revisions: RevisionRow[];
  /** Custom types by workspace id. */
  library: Map<string, CustomTypeRow[]>;
  /** Latest drift report by project id. */
  drift: Map<string, DriftRow>;
  /** The workspace each user's agents act on (use_workspace). */
  prefs: Map<string, string>;
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;

export function createFakeBackend() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}${++seq}`;
  const state: FakeState = {
    teams: [],
    projects: new Map(),
    revisions: [],
    library: new Map(),
    drift: new Map(),
    prefs: new Map(),
  };

  /** The user a service credential acts for (svc_<secret>.<userId>). */
  const userOf = (serviceKey: string): string => {
    const m = /^svc_.+\.(user_[A-Za-z0-9]+)$/.exec(serviceKey);
    if (!m) throw new Error("Not signed in.");
    return m[1]!;
  };

  const teamOf = (workspaceId: string) => state.teams.find((t) => t.id === workspaceId);

  const roleIn = (userId: string, workspaceId: string): Role | null =>
    workspaceId === userId ? "owner" : (teamOf(workspaceId)?.members.find((m) => m.userId === userId)?.role ?? null);

  const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
  const needRole = (userId: string, workspaceId: string, role: Role): void => {
    const have = roleIn(userId, workspaceId);
    if (!have) throw new Error("Not authorized for this workspace.");
    if (RANK[have] < RANK[role]) throw new Error(`This needs ${role} access; you are a ${have}.`);
  };
  const need = (ws: Workspace, role: "viewer" | "editor"): void => needRole(userOf(ws.serviceKey), ws.workspaceId, role);

  const projectIn = (ws: Workspace, id: string) => {
    const p = state.projects.get(id);
    return p && p.workspaceId === ws.workspaceId ? p : null;
  };

  const inWorkspace = (ws: Workspace, documentId: string) => projectIn(ws, documentId) !== null;

  const record = (p: ProjectDoc, summary?: string) => {
    state.revisions.unshift({
      _id: nextId("rev_"),
      documentId: p._id,
      source: p.source,
      title: p.title,
      createdAt: Date.now(),
      author: agentAuthor(),
      ...(summary ? { summary } : {}),
    });
  };

  const ensureAnotherOwner = (team: FakeState["teams"][number], m: FakeMember) => {
    if (!team.members.some((o) => o.role === "owner" && o.userId && o.id !== m.id))
      throw new Error("A workspace needs at least one other signed-in owner first.");
  };

  const memberById = (memberId: string) => {
    for (const team of state.teams) {
      const m = team.members.find((x) => x.id === memberId);
      if (m) return { team, m };
    }
    return null;
  };

  const db = {
    listProjects: async (ws: Workspace) => {
      need(ws, "viewer");
      return [...state.projects.values()]
        .filter((p) => p.workspaceId === ws.workspaceId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ _id, title, updatedAt, repo }) => ({
          _id,
          title,
          updatedAt,
          ...(repo
            ? { repo: { owner: repo.owner, name: repo.name, branch: repo.branch, linkedAt: repo.linkedAt, ...(repo.path ? { path: repo.path } : {}) } }
            : {}),
        }));
    },
    getProject: async (ws: Workspace, id: string) => {
      need(ws, "viewer");
      const p = projectIn(ws, id);
      return p ? structuredClone(p) : null;
    },
    createProject: async (ws: Workspace, title: string, source: string, summary?: string) => {
      need(ws, "editor");
      const now = Date.now();
      const p = { _id: nextId("proj_"), workspaceId: ws.workspaceId, title, source, updatedAt: now, seenRevisionAt: now };
      state.projects.set(p._id, p);
      record(p, summary);
      return p._id;
    },
    setRepo: async (ws: Workspace, id: string, repo: { owner: string; name: string; branch: string } | null) => {
      need(ws, "editor");
      const p = projectIn(ws, id);
      if (!p) throw new Error("Document not found");
      if (repo === null) {
        delete p.repo;
        return null;
      }
      const link: RepoLink = { ...repo, linkedAt: Date.now() };
      p.repo = link;
      return link;
    },
    updateProject: async (ws: Workspace, id: string, title: string, source: string, summary?: string) => {
      need(ws, "editor");
      const p = projectIn(ws, id);
      // Like Convex: a save that changes nothing records nothing.
      if (!p || (p.source === source && p.title === title)) return;
      Object.assign(p, { title, source, updatedAt: Date.now() });
      record(p, summary);
    },
    deleteProject: async (ws: Workspace, id: string) => {
      need(ws, "editor");
      if (projectIn(ws, id)) state.projects.delete(id);
    },
    setPublic: async (ws: Workspace, id: string, enabled: boolean) => {
      need(ws, "editor");
      const p = projectIn(ws, id);
      if (!p) throw new Error("Document not found");
      if (!enabled) {
        delete p.publicSlug;
        return null;
      }
      p.publicSlug ??= `slug${String(++seq).padStart(12, "0")}`;
      return p.publicSlug;
    },
    getPublic: async (slug: string): Promise<PublicDoc | null> => {
      const p = [...state.projects.values()].find((x) => x.publicSlug === slug);
      if (!p) return null;
      const repo = p.repo
        ? { owner: p.repo.owner, name: p.repo.name, branch: p.repo.branch, ...(p.repo.path ? { path: p.repo.path } : {}) }
        : null;
      return { _id: p._id, title: p.title, source: p.source, updatedAt: p.updatedAt, repo };
    },
    markSeen: async (ws: Workspace, id: string) => {
      need(ws, "editor");
      const p = projectIn(ws, id);
      if (p) p.seenRevisionAt = Date.now();
    },
    unlinkFile: async (ws: Workspace, id: string) => {
      need(ws, "editor");
      const p = projectIn(ws, id);
      if (!p) throw new Error("Document not found");
      if (p.repo) p.repo = { owner: p.repo.owner, name: p.repo.name, branch: p.repo.branch, linkedAt: p.repo.linkedAt };
    },
    listCustomTypes: async (ws: Workspace) => {
      need(ws, "viewer");
      return [...(state.library.get(ws.workspaceId) ?? [])];
    },
    saveCustomType: async (ws: Workspace, t: CustomTypeRow) => {
      need(ws, "editor");
      const rows = (state.library.get(ws.workspaceId) ?? []).filter((r) => r.tag !== t.tag);
      state.library.set(ws.workspaceId, [...rows, t]);
    },
    deleteCustomType: async (ws: Workspace, tag: string) => {
      need(ws, "editor");
      state.library.set(ws.workspaceId, (state.library.get(ws.workspaceId) ?? []).filter((r) => r.tag !== tag));
    },
    listRevisions: async (ws: Workspace, documentId: string, limit?: number) => {
      need(ws, "viewer");
      if (!inWorkspace(ws, documentId)) return [];
      return structuredClone(
        state.revisions.filter((r) => r.documentId === documentId).slice(0, Math.min(Math.max(limit ?? 50, 1), 200)),
      );
    },
    getRevision: async (ws: Workspace, id: string) => {
      need(ws, "viewer");
      const r = state.revisions.find((x) => x._id === id);
      return r && inWorkspace(ws, r.documentId) ? structuredClone(r) : null;
    },
    reviewBaseline: async (ws: Workspace, documentId: string) => {
      need(ws, "viewer");
      const p = projectIn(ws, documentId);
      if (!p) return null;
      const all = state.revisions.filter((r) => r.documentId === documentId);
      if (p.seenRevisionAt !== undefined) {
        const seen = all.find((r) => r.createdAt <= p.seenRevisionAt!);
        if (seen) return seen;
      }
      return all.find((r) => r.author.kind === "user") ?? all[all.length - 1] ?? null;
    },
    listWorkspaces: async (serviceKey: string): Promise<WorkspaceSummary[]> => {
      const userId = userOf(serviceKey);
      return [
        { id: userId, name: "Personal", kind: "personal", role: "owner" },
        ...state.teams
          .filter((t) => roleIn(userId, t.id))
          .map((t) => ({ id: t.id, name: t.name, kind: "team" as const, role: roleIn(userId, t.id)! }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ];
    },
    getAgentWorkspace: async (serviceKey: string) => {
      const userId = userOf(serviceKey);
      const workspaceId = state.prefs.get(userId);
      return workspaceId && roleIn(userId, workspaceId) ? { workspaceId } : null;
    },
    setAgentWorkspace: async (serviceKey: string, workspaceId: string) => {
      const userId = userOf(serviceKey);
      if (!roleIn(userId, workspaceId)) throw new Error("You are not a member of that workspace.");
      state.prefs.set(userId, workspaceId);
      return { workspaceId };
    },
    acceptInvites: async (serviceKey: string, email: string) => {
      const userId = userOf(serviceKey);
      let accepted = 0;
      for (const t of state.teams)
        for (const m of t.members)
          if (!m.userId && m.email === email.toLowerCase()) {
            m.userId = userId;
            accepted++;
          }
      return { accepted };
    },
    createWorkspace: async (serviceKey: string, name: string, email: string | null) => {
      const userId = userOf(serviceKey);
      const id = nextId("team_");
      state.teams.push({
        id,
        name,
        members: [{ id: nextId("member_"), userId, email: email ?? "", role: "owner", createdAt: Date.now() }],
      });
      return id;
    },
    renameWorkspace: async (serviceKey: string, workspaceId: string, name: string) => {
      needRole(userOf(serviceKey), workspaceId, "owner");
      teamOf(workspaceId)!.name = name;
    },
    deleteWorkspace: async (serviceKey: string, workspaceId: string) => {
      needRole(userOf(serviceKey), workspaceId, "owner");
      state.teams = state.teams.filter((t) => t.id !== workspaceId);
      for (const [id, p] of state.projects) if (p.workspaceId === workspaceId) state.projects.delete(id);
    },
    leaveWorkspace: async (serviceKey: string, workspaceId: string) => {
      const userId = userOf(serviceKey);
      const team = teamOf(workspaceId);
      const m = team?.members.find((x) => x.userId === userId);
      if (!team || !m) return;
      if (m.role === "owner") ensureAnotherOwner(team, m);
      team.members = team.members.filter((x) => x !== m);
    },
    listMembers: async (serviceKey: string, workspaceId: string): Promise<MemberRow[]> => {
      const userId = userOf(serviceKey);
      needRole(userId, workspaceId, "viewer");
      return (teamOf(workspaceId)?.members ?? [])
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((m) => ({ _id: m.id, email: m.email, role: m.role, createdAt: m.createdAt, pending: !m.userId, you: m.userId === userId }));
    },
    inviteMember: async (serviceKey: string, workspaceId: string, email: string, role: Role) => {
      needRole(userOf(serviceKey), workspaceId, "owner");
      const team = teamOf(workspaceId)!;
      const existing = team.members.find((m) => m.email === email);
      if (existing) {
        if (existing.role === "owner" && role !== "owner") ensureAnotherOwner(team, existing);
        existing.role = role;
        return existing.id;
      }
      const m: FakeMember = { id: nextId("member_"), email, role, createdAt: Date.now() };
      team.members.push(m);
      return m.id;
    },
    setMemberRole: async (serviceKey: string, memberId: string, role: Role) => {
      const hit = memberById(memberId);
      if (!hit) throw new Error("Member not found.");
      needRole(userOf(serviceKey), hit.team.id, "owner");
      if (hit.m.role === "owner" && role !== "owner") ensureAnotherOwner(hit.team, hit.m);
      hit.m.role = role;
    },
    removeMember: async (serviceKey: string, memberId: string) => {
      const hit = memberById(memberId);
      if (!hit) return;
      needRole(userOf(serviceKey), hit.team.id, "owner");
      if (hit.m.role === "owner") ensureAnotherOwner(hit.team, hit.m);
      hit.team.members = hit.team.members.filter((x) => x !== hit.m);
    },
    getDrift: async (ws: Workspace, documentId: string) => {
      need(ws, "viewer");
      const row = inWorkspace(ws, documentId) ? state.drift.get(documentId) : undefined;
      return row ? structuredClone(row) : null;
    },
    reportDrift: async (ws: Workspace, documentId: string, findings: DriftFinding[]) => {
      need(ws, "editor");
      if (!inWorkspace(ws, documentId)) throw new Error("Document not found");
      const row: DriftRow = { _id: nextId("drift_"), documentId, reportedAt: Date.now(), author: agentAuthor(), findings };
      state.drift.set(documentId, row);
      return row._id;
    },
    dismissDrift: async (ws: Workspace, driftId: string, index: number) => {
      need(ws, "editor");
      for (const row of state.drift.values())
        if (row._id === driftId && inWorkspace(ws, row.documentId)) row.findings = row.findings.filter((_, i) => i !== index);
    },
    clearDrift: async (ws: Workspace, documentId: string) => {
      need(ws, "editor");
      if (inWorkspace(ws, documentId)) state.drift.delete(documentId);
    },
  };

  return { db, state, nextId };
}
