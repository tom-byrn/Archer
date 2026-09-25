/**
 * A stand-in for what the web app lends the tools (src/host.ts): an in-memory
 * GitHub that stores documents in its files the way the repo sync engine
 * (apps/web/lib/server/repoSync.ts) does — against the fake backend's state —
 * plus a renderer and the user's email. The engine's own rules are tested in
 * apps/web; this plays them just far enough for the tools' plumbing. Tests
 * override single methods (`Object.assign(host.github, …)`) to script cases.
 */
import { CURRENT_VERSION, format, parse } from "@archer/lang";
import { prepareSource, typeTags } from "../src/analysis";
import type { ArcherHost, FileRef, GitHubCommitInfo, GitHubRepoInfo, RepoRef } from "../src/host";
import type { FakeBackend } from "./fakeBackend";

export interface FakeRepo {
  info: GitHubRepoInfo;
  /** Branch → file path → content. */
  branches: Map<string, Map<string, string>>;
  /** Newest first. */
  commits: GitHubCommitInfo[];
}

export interface FakeGitHub {
  repos: Map<string, FakeRepo>;
  /** Whether the user's token carries the repo scope. */
  privateAccess: boolean;
  /** Pull requests opened so far (numbers count on from here). */
  nextPull: number;
}

export class FakeHostError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: { errors: string[] },
  ) {
    super(message);
  }
}

const key = (r: RepoRef) => `${r.owner}/${r.name}`.toLowerCase();
const sha = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${h.toString(16).padStart(8, "0")}${"0".repeat(32)}`.slice(0, 40);
};
/** A file holds architecture only: canonical, no layout. */
const fileSource = (source: string) => format(parse(source).doc, { stripLayout: true });

export function createFakeHost(fake: FakeBackend, opts: { email: string | null }) {
  const github: FakeGitHub = { repos: new Map(), privateAccess: true, nextPull: 42 };

  const repoOf = (r: RepoRef): FakeRepo => {
    const repo = github.repos.get(key(r));
    if (!repo) throw new FakeHostError("Repository not found, or no access to it.", "not_found");
    return repo;
  };
  const filesOf = (r: RepoRef, branch: string) => {
    const files = repoOf(r).branches.get(branch);
    if (!files) throw new FakeHostError(`${r.owner}/${r.name} has no branch "${branch}".`, "no_branch");
    return files;
  };
  const docOf = (workspaceId: string, id: string) => {
    const p = fake.state.projects.get(id);
    if (!p || p.workspaceId !== workspaceId) throw new FakeHostError("Document not found.", "not_found");
    return p;
  };
  const storedOf = (workspaceId: string, id: string) => {
    const p = docOf(workspaceId, id);
    if (!p.repo?.path) throw new FakeHostError("This document isn't stored in a repository.", "not_stored");
    return p as typeof p & { repo: NonNullable<typeof p.repo> & { path: string } };
  };
  const typesIn = (workspaceId: string) => typeTags((fake.state.library.get(workspaceId) ?? []).map((t) => t.tag));
  const base = (f: FileRef, content: string) => ({ commit: sha(`${f.branch}:${content}`), blob: sha(content), source: fileSource(content), at: Date.now() });

  const host: ArcherHost = {
    userEmail: async () => opts.email,
    renderSvg: (source, { theme }) => {
      const title = parse(source).doc.title;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320" role="img" aria-label="${title}"><title>${title}</title><rect width="560" height="320" fill="${theme === "dark" ? "#16150f" : "#f7f5f1"}"/></svg>`;
    },
    github: {
      repos: async (_userId, query) => ({
        repos: [...github.repos.values()]
          .map((r) => r.info)
          .filter((r) => (github.privateAccess || !r.private) && r.fullName.toLowerCase().includes(query.trim().toLowerCase())),
        hasToken: true,
        privateAccess: github.privateAccess,
      }),
      repo: async (_userId, r) => repoOf(r).info,
      branches: async (_userId, r) =>
        [...repoOf(r).branches.keys()].map((name) => ({ name, sha: sha(`${key(r)}@${name}`) })),
      files: async (_userId, r, branch) => ({
        paths: [...filesOf(r, branch).keys()].filter((p) => p.endsWith(".arch")).sort(),
        truncated: false,
      }),
      commits: async (_userId, r, _branch, { page }) => ({
        commits: page === 1 ? repoOf(r).commits : [],
        hasMore: false,
      }),
      importFile: async (userId, workspaceId, file) => {
        const content = filesOf(file, file.branch).get(file.path);
        const now = Date.now();
        if (content === undefined) {
          const title = file.name.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const id = await fake.db.createProject(
            { workspaceId, serviceKey: `svc_x.${userId}` },
            title,
            format({ kind: "doc", title, version: CURRENT_VERSION, components: [], connections: [], layout: [] }),
          );
          fake.state.projects.get(id)!.repo = { ...file, linkedAt: now };
          return { id, imported: false };
        }
        const prep = prepareSource(content, typesIn(workspaceId));
        if (!prep.ok)
          throw new FakeHostError(`${file.path} has errors, so it can't be imported yet.`, "invalid", {
            errors: prep.errors.map((d) => `${d.code} [error] line ${d.span?.start.line}: ${d.message}`),
          });
        const id = fake.nextId("proj_");
        fake.state.projects.set(id, {
          _id: id,
          workspaceId,
          title: prep.title,
          source: prep.text,
          updatedAt: now,
          seenRevisionAt: now,
          repo: { ...file, linkedAt: now, base: base(file, content) },
        });
        const commit = repoOf(file).commits[0];
        fake.state.revisions.unshift({
          _id: fake.nextId("rev_"),
          documentId: id,
          source: prep.text,
          title: prep.title,
          createdAt: now,
          author: { kind: "git", name: commit?.authorLogin ?? "GitHub" },
          summary: commit?.message.split("\n")[0] ?? `Imported ${file.path}`,
          ...(commit ? { commit: { sha: commit.sha, url: commit.htmlUrl } } : {}),
        });
        return { id, imported: true };
      },
      storeInFile: async (_userId, workspaceId, documentId, file) => {
        const p = docOf(workspaceId, documentId);
        const content = filesOf(file, file.branch).get(file.path);
        p.repo = { ...file, linkedAt: Date.now(), ...(content !== undefined ? { base: base(file, content) } : {}) };
        return { existed: content !== undefined };
      },
      sync: async (_userId, workspaceId, documentId, resolve) => {
        const p = storedOf(workspaceId, documentId);
        const content = filesOf(p.repo, p.repo.branch).get(p.repo.path);
        if (resolve && p.repo.incoming) {
          delete p.repo.incoming;
          if (content !== undefined) p.repo.base = base(p.repo, content);
          return { status: "unchanged" };
        }
        if (content === undefined) return { status: "missing" };
        if (p.repo.base && fileSource(content) === p.repo.base.source) return { status: "unchanged" };
        p.repo.base = base(p.repo, content);
        return { status: "imported", commit: p.repo.base.commit, author: repoOf(p.repo).commits[0]?.authorLogin ?? "GitHub" };
      },
      publish: async (_userId, workspaceId, documentId, { mode, message }) => {
        const p = storedOf(workspaceId, documentId);
        if (p.repo.incoming)
          throw new FakeHostError("The repository has changes that conflict with the draft. Resolve them first.", "conflict");
        const content = fileSource(p.source);
        const f = p.repo;
        if (mode === "commit") {
          filesOf(f, f.branch).set(f.path, content);
          p.repo.base = base(f, content);
          return { mode: "commit", commit: p.repo.base.commit, url: `https://github.com/${f.owner}/${f.name}/commit/${p.repo.base.commit}` };
        }
        if (p.repo.pr) return { mode: "pr", number: p.repo.pr.number, url: p.repo.pr.url, updated: true };
        const number = github.nextPull++;
        const url = `https://github.com/${f.owner}/${f.name}/pull/${number}`;
        p.repo.pr = { number, url, branch: `archer/${message ?? "publish"}`, openedAt: Date.now() };
        return { mode: "pr", number, url, updated: false };
      },
    },
  };

  return { host, github };
}
