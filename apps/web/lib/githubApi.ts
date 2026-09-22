/**
 * Pure GitHub REST client (no auth lookup, no Next.js imports) so it can be
 * unit-tested and reused. Tokens come from `lib/server/github.ts`; never call
 * api.github.com anywhere else in the app.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "unauthenticated" | "no_github_token" | "not_found" | "forbidden" | "rate_limited" | "upstream",
  ) {
    super(message);
  }
}

export interface GitHubRepo {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string | null;
  htmlUrl: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  /** Author display name (git) — always present. */
  authorName: string;
  /** GitHub login and avatar when the commit is linked to an account. */
  authorLogin: string | null;
  authorAvatar: string | null;
  /** ISO timestamp of the commit (committer date). */
  date: string;
  htmlUrl: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
}

async function github<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<{ data: T; link: string | null; scopes: string | null }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "archer-app",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    // Commit lists change often; let the route layer decide caching.
    cache: "no-store",
  });
  if (res.status === 404) throw new GitHubError("Repository not found, or no access to it.", 404, "not_found");
  if (res.status === 401) throw new GitHubError("GitHub rejected the token. Sign out and back in.", 401, "no_github_token");
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0")
      throw new GitHubError("GitHub rate limit reached. Try again in a few minutes.", 429, "rate_limited");
    throw new GitHubError("GitHub refused the request (private repo without the repo scope?).", 403, "forbidden");
  }
  if (!res.ok) throw new GitHubError(`GitHub error ${res.status}`, 502, "upstream");
  return {
    data: (await res.json()) as T,
    link: res.headers.get("link"),
    scopes: res.headers.get("x-oauth-scopes"),
  };
}

const mapRepo = (r: Record<string, unknown>): GitHubRepo => ({
  fullName: r.full_name as string,
  owner: (r.owner as { login: string }).login,
  name: r.name as string,
  private: !!r.private,
  defaultBranch: (r.default_branch as string) ?? "main",
  description: (r.description as string | null) ?? null,
  pushedAt: (r.pushed_at as string | null) ?? null,
  htmlUrl: r.html_url as string,
});

/** Most repos listed per search; GitHub pages them 100 at a time. */
const MAX_REPO_PAGES = 10;

/**
 * Repos the user can see, most recently pushed first. Requires a token.
 * `privateAccess` is whether the token carries the `repo` scope (without it
 * GitHub silently returns public repos only); null when GitHub doesn't report
 * scopes (fine-grained or GitHub App tokens).
 */
export async function listRepos(
  token: string,
  query: string,
): Promise<{ repos: GitHubRepo[]; privateAccess: boolean | null }> {
  const all: GitHubRepo[] = [];
  let scopes: string | null = null;
  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    const res = await github<Record<string, unknown>[]>(
      `/user/repos?sort=pushed&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      token,
    );
    if (page === 1) scopes = res.scopes;
    all.push(...res.data.map(mapRepo));
    if (!res.link?.includes('rel="next"')) break;
  }
  const q = query.trim().toLowerCase();
  return {
    repos: all.filter((r) => q === "" || r.fullName.toLowerCase().includes(q)),
    privateAccess: scopes === null ? null : scopes.split(",").some((s) => s.trim() === "repo"),
  };
}

/** One repo by owner/name (works unauthenticated for public repos). */
export async function getRepo(token: string | null, owner: string, name: string): Promise<GitHubRepo> {
  const { data } = await github<Record<string, unknown>>(`/repos/${enc(owner)}/${enc(name)}`, token);
  return mapRepo(data);
}

export async function listBranches(token: string | null, owner: string, name: string): Promise<GitHubBranch[]> {
  const { data } = await github<{ name: string; commit: { sha: string } }[]>(
    `/repos/${enc(owner)}/${enc(name)}/branches?per_page=100`,
    token,
  );
  return data.map((b) => ({ name: b.name, sha: b.commit.sha }));
}

/** A page of commits on a branch, newest first. */
export async function listCommits(
  token: string | null,
  owner: string,
  name: string,
  branch: string,
  opts: { page?: number; perPage?: number; since?: string } = {},
): Promise<{ commits: GitHubCommit[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    sha: branch,
    per_page: String(Math.min(opts.perPage ?? 50, 100)),
    page: String(opts.page ?? 1),
    ...(opts.since ? { since: opts.since } : {}),
  });
  const { data, link } = await github<Record<string, unknown>[]>(
    `/repos/${enc(owner)}/${enc(name)}/commits?${params}`,
    token,
  );
  const commits = data.map((c): GitHubCommit => {
    const commit = c.commit as { message: string; author: { name: string; date: string }; committer: { date: string } };
    const author = c.author as { login: string; avatar_url: string } | null;
    return {
      sha: c.sha as string,
      message: commit.message,
      authorName: commit.author?.name ?? author?.login ?? "unknown",
      authorLogin: author?.login ?? null,
      authorAvatar: author?.avatar_url ?? null,
      date: commit.committer?.date ?? commit.author?.date,
      htmlUrl: c.html_url as string,
    };
  });
  return { commits, hasMore: !!link && /rel="next"/.test(link) };
}

const enc = encodeURIComponent;

/** Web URL for a path inside the repo at a branch (file or directory). */
export const githubTreeUrl = (owner: string, name: string, branch: string, path: string): string =>
  `https://github.com/${enc(owner)}/${enc(name)}/tree/${encodeURIComponent(branch)}/${path
    .split("/")
    .filter(Boolean)
    .map(enc)
    .join("/")}`;

