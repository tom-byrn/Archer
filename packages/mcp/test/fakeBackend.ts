/**
 * An in-memory stand-in for the Convex functions behind `db` (src/backend.ts),
 * so the tools can run in tests without a deployment. It keeps the rules the
 * tools rely on: access by workspace role (writes need editor), a revision
 * appended on every agent save that changes something, drift reports
 * replaced whole. Install it with `Object.assign(db, fake.db)`; seed it
 * through `fake.state`.
 */
import { agentAuthor } from "../src/backend";
import type {
  CustomTypeRow,
  DriftFinding,
  DriftRow,
  ProjectDoc,
  RepoLink,
  RevisionRow,
  Workspace,
  WorkspaceSummary,
} from "../src/backend";

type Role = WorkspaceSummary["role"];

export interface FakeState {
  /** Team workspaces; `members` maps user ids to roles. Personal workspaces are implicit. */
  teams: { id: string; name: string; members: Record<string, Role> }[];
  projects: Map<string, ProjectDoc & { workspaceId: string }>;
  /** Newest first, like the Convex query. */
  revisions: RevisionRow[];
  /** Custom types by workspace id. */
  library: Map<string, CustomTypeRow[]>;
  /** Latest drift report by project id. */
  drift: Map<string, DriftRow>;
  /** The workspace each user's agents act on (use_workspace). */
  prefs: Map<string, string>;
  /** Feedback sent with send_feedback, oldest first. */
  feedback: { userId: string; message: string; path: string; device: string }[];
}

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
    feedback: [],
  };

  /** The user a service credential acts for (svc_<secret>.<userId>). */
  const userOf = (serviceKey: string): string => {
    const m = /^svc_.+\.(user_[A-Za-z0-9]+)$/.exec(serviceKey);
    if (!m) throw new Error("Not signed in.");
    return m[1]!;
  };

  const roleIn = (userId: string, workspaceId: string): Role | null =>
    workspaceId === userId ? "owner" : (state.teams.find((t) => t.id === workspaceId)?.members[userId] ?? null);

  const need = (ws: Workspace, role: "viewer" | "editor"): void => {
    const have = roleIn(userOf(ws.serviceKey), ws.workspaceId);
    if (!have) throw new Error("Not authorized for this workspace.");
    if (role === "editor" && have === "viewer") throw new Error("This needs editor access; you are a viewer.");
  };

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

  const db = {
    listProjects: async (ws: Workspace) => {
      need(ws, "viewer");
      return [...state.projects.values()]
        .filter((p) => p.workspaceId === ws.workspaceId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ _id, title, updatedAt }) => ({ _id, title, updatedAt }));
    },
    getProject: async (ws: Workspace, id: string) => {
      need(ws, "viewer");
      const p = projectIn(ws, id);
      return p ? { ...p } : null;
    },
    createProject: async (ws: Workspace, title: string, source: string, summary?: string) => {
      need(ws, "editor");
      const p = { _id: nextId("proj_"), workspaceId: ws.workspaceId, title, source, updatedAt: Date.now() };
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
      return state.revisions
        .filter((r) => r.documentId === documentId)
        .slice(0, Math.min(Math.max(limit ?? 50, 1), 200));
    },
    getRevision: async (ws: Workspace, id: string) => {
      need(ws, "viewer");
      const r = state.revisions.find((x) => x._id === id);
      return r && inWorkspace(ws, r.documentId) ? r : null;
    },
    listWorkspaces: async (serviceKey: string): Promise<WorkspaceSummary[]> => {
      const userId = userOf(serviceKey);
      return [
        { id: userId, name: "Personal", kind: "personal", role: "owner" },
        ...state.teams
          .filter((t) => t.members[userId])
          .map((t) => ({ id: t.id, name: t.name, kind: "team" as const, role: t.members[userId]! })),
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
    getDrift: async (ws: Workspace, documentId: string) => {
      need(ws, "viewer");
      return inWorkspace(ws, documentId) ? (state.drift.get(documentId) ?? null) : null;
    },
    reportDrift: async (ws: Workspace, documentId: string, findings: DriftFinding[]) => {
      need(ws, "editor");
      if (!inWorkspace(ws, documentId)) throw new Error("Document not found");
      const row: DriftRow = { _id: nextId("drift_"), documentId, reportedAt: Date.now(), author: agentAuthor(), findings };
      state.drift.set(documentId, row);
      return row._id;
    },
    sendFeedback: async (serviceKey: string, message: string) => {
      const userId = userOf(serviceKey);
      if (message.trim() === "") throw new Error("Feedback is empty.");
      state.feedback.push({ userId, message: message.trim(), path: "/mcp", device: agentAuthor().name });
    },
  };

  return { db, state };
}
