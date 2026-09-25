"use client";

/**
 * Client-side access to the app's GitHub routes (`/api/github/*`). The routes
 * use the signed-in user's GitHub token (from Clerk) server-side; the browser
 * never sees it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitHubBranch, GitHubCommit, GitHubRepo } from "@/lib/githubApi";
import type { StoredFile } from "@/lib/repoSync";

export type { GitHubBranch, GitHubCommit, GitHubRepo } from "@/lib/githubApi";

/**
 * A document's linked repository (mirrors `documents.repo` in Convex). With
 * `path` set, the document is stored in that file (see lib/repoSync.ts).
 */
export type RepoLink = {
  owner: string;
  name: string;
  branch: string;
  /** The .arch file the document is stored in. */
  path?: string;
  linkedAt: number;
} & Partial<Omit<StoredFile, "owner" | "name" | "branch" | "path">>;

/** A repo link whose document is stored in the file. */
export const storedFile = (repo: RepoLink | null | undefined): StoredFile | null =>
  repo?.path ? (repo as StoredFile) : null;

export type GitHubErrorCode =
  | "unauthenticated"
  | "no_github_token"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "conflict"
  | "invalid"
  | "upstream"
  // repo sync (lib/server/repoSync.ts)
  | "stale"
  | "nothing"
  | "no_access"
  | "no_branch"
  | "no_write_access"
  | "busy";

export class GitHubClientError extends Error {
  constructor(
    message: string,
    readonly code: GitHubErrorCode,
    readonly status: number,
    /** Extra detail, e.g. `{ errors: string[] }` when a file doesn't validate. */
    readonly details?: { errors?: string[] },
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) {
    let body: { error?: string; code?: GitHubErrorCode; details?: { errors?: string[] } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {}
    throw new GitHubClientError(
      body.error ?? `GitHub request failed (${res.status})`,
      body.code ?? "upstream",
      res.status,
      body.details,
    );
  }
  return (await res.json()) as T;
}

const post = <T,>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const repoKey = (r: { owner: string; name: string }): string => `${r.owner}/${r.name}`;

export const fetchRepos = (q: string) =>
  call<{ repos: GitHubRepo[]; hasToken: boolean; privateAccess: boolean | null }>(`/api/github/repos?q=${encodeURIComponent(q)}`);

export const fetchBranches = (repo: string) =>
  call<{ branches: GitHubBranch[] }>(`/api/github/branches?repo=${encodeURIComponent(repo)}`);

export const fetchCommits = (
  repo: string,
  branch: string,
  opts: { page?: number; since?: string } = {},
) => {
  const p = new URLSearchParams({ repo, branch, page: String(opts.page ?? 1) });
  if (opts.since) p.set("since", opts.since);
  return call<{ commits: GitHubCommit[]; hasMore: boolean }>(`/api/github/commits?${p}`);
};

/* ------------------------------------------------ Repo sync (app/api/github/*) */

export interface FileTarget {
  /** owner/name */
  repo: string;
  branch: string;
  path: string;
}

export const fetchArchFiles = (repo: string, branch: string) =>
  call<{ paths: string[]; truncated: boolean }>(
    `/api/github/files?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`,
  );

/** "From GitHub": a new document stored in the file (imported when it exists). */
export const createFromGitHub = (workspaceId: string, target: FileTarget) =>
  post<{ id: string; imported: boolean }>("/api/github/projects", { workspaceId, ...target });

/** "Move to GitHub": store an existing document in the file from now on. */
export const moveToGitHub = (workspaceId: string, documentId: string, target: FileTarget) =>
  post<{ existed: boolean }>("/api/github/link", { workspaceId, documentId, ...target });

export type SyncOutcome =
  | { status: "unchanged" | "missing" | "adopted" }
  | { status: "imported" | "merged"; commit: string; author: string }
  | { status: "conflict"; conflicts: string[] }
  | { status: "problem"; message: string };

/** Bring the document up to date with its file; with `resolve`, settle a conflict first. */
export const syncWithGitHub = (workspaceId: string, documentId: string, resolve?: "draft" | "repo") =>
  post<SyncOutcome>("/api/github/sync", { workspaceId, documentId, ...(resolve ? { resolve } : {}) });

export type PublishResult =
  | { mode: "commit"; commit: string; url: string }
  | { mode: "pr"; number: number; url: string; updated: boolean };

export const publishToGitHub = (
  workspaceId: string,
  documentId: string,
  opts: { mode: "pr" | "commit"; message?: string },
) => post<PublishResult>("/api/github/publish", { workspaceId, documentId, ...opts });

/** Human-readable message for a failed GitHub call. */
export const describeGitHubError = (e: unknown): string => {
  if (e instanceof GitHubClientError) {
    switch (e.code) {
      case "no_github_token":
        return "Sign-in didn't include a GitHub token — sign out and back in with GitHub.";
      case "forbidden":
        return "GitHub refused. Private repositories need the `repo` scope on the Clerk GitHub connection.";
      case "rate_limited":
        return "GitHub rate limit reached. Try again in a few minutes.";
      case "not_found":
        return "Repository or branch not found.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : "GitHub request failed.";
};

export interface CommitsState {
  commits: GitHubCommit[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Commits on the linked branch, newest first, 50 per page. State is keyed by
 * repo+branch so switching the link starts fresh; the same key keeps its list.
 * A new `refresh` value reloads it (e.g. the synced commit moved on).
 */
export function useCommits(link: RepoLink | null, refresh?: string): CommitsState {
  const key = link ? `${repoKey(link)}@${link.branch}` : null;
  // Only the repository and branch matter: the link object itself changes on every save.
  const repo = useMemo(
    () => (link ? { owner: link.owner, name: link.name, branch: link.branch } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [state, setState] = useState<{
    key: string | null;
    commits: GitHubCommit[];
    page: number;
    hasMore: boolean;
    loading: boolean;
    error: string | null;
  }>({ key: null, commits: [], page: 0, hasMore: false, loading: false, error: null });
  const inflight = useRef(0);

  const load = useCallback(
    (page: number, reset: boolean) => {
      if (!repo || !key) return;
      const id = ++inflight.current;
      setState((s) => ({
        ...s,
        key,
        loading: true,
        error: null,
        ...(reset ? { commits: [], page: 0, hasMore: false } : {}),
      }));
      fetchCommits(repoKey(repo), repo.branch, { page })
        .then(({ commits, hasMore }) => {
          if (id !== inflight.current) return;
          setState((s) => {
            const seen = new Set(reset ? [] : s.commits.map((c) => c.sha));
            const fresh = commits.filter((c) => !seen.has(c.sha));
            return {
              key,
              commits: reset ? fresh : [...s.commits, ...fresh],
              page,
              hasMore,
              loading: false,
              error: null,
            };
          });
        })
        .catch((e: unknown) => {
          if (id !== inflight.current) return;
          setState((s) => ({ ...s, key, loading: false, error: describeGitHubError(e) }));
        });
    },
    [repo, key],
  );

  useEffect(() => {
    if (!key) {
      setState({ key: null, commits: [], page: 0, hasMore: false, loading: false, error: null });
      return;
    }
    load(1, true);
  }, [key, load, refresh]);

  const same = state.key === key;
  return {
    commits: same ? state.commits : [],
    loading: same ? state.loading : key !== null,
    error: same ? state.error : null,
    hasMore: same ? state.hasMore : false,
    loadMore: () => {
      if (!state.loading && state.hasMore) load(state.page + 1, false);
    },
    reload: () => load(1, true),
  };
}
