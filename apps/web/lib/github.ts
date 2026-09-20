"use client";

/**
 * Client-side access to the app's GitHub routes (`/api/github/*`). The routes
 * use the signed-in user's GitHub token (from Clerk) server-side; the browser
 * never sees it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubBranch, GitHubCommit, GitHubRepo } from "@/lib/githubApi";

export type { GitHubBranch, GitHubCommit, GitHubRepo } from "@/lib/githubApi";

/** A document's linked repository (mirrors `documents.repo` in Convex). */
export type RepoLink = {
  owner: string;
  name: string;
  branch: string;
  /** Reserved for the .arch file sync. */
  path?: string;
  linkedAt: number;
};

export type GitHubErrorCode =
  | "unauthenticated"
  | "no_github_token"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "upstream";

export class GitHubClientError extends Error {
  constructor(
    message: string,
    readonly code: GitHubErrorCode,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    let body: { error?: string; code?: GitHubErrorCode } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {}
    throw new GitHubClientError(
      body.error ?? `GitHub request failed (${res.status})`,
      body.code ?? "upstream",
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const repoKey = (r: { owner: string; name: string }): string => `${r.owner}/${r.name}`;

export const fetchRepos = (q: string) =>
  call<{ repos: GitHubRepo[]; hasToken: boolean }>(`/api/github/repos?q=${encodeURIComponent(q)}`);

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
 */
export function useCommits(repo: RepoLink | null): CommitsState {
  const key = repo ? `${repoKey(repo)}@${repo.branch}` : null;
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
  }, [key, load]);

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
