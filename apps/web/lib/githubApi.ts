/**
 * Pure GitHub REST client (no auth lookup, no Next.js imports) so it can be
 * unit-tested and reused. Tokens come from `lib/server/github.ts`; never call
 * api.github.com anywhere else in the app.
 */

/** REST base URL: api.github.com, or `GITHUB_API_URL` (GitHub Enterprise, local stand-ins). */
const apiBase = (): string => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");

export type GitHubErrorCode =
  | "unauthenticated"
  | "no_github_token"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "conflict"
  | "invalid"
  | "upstream";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: GitHubErrorCode,
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

/** GitHub's own explanation from an error response body, if it sent one. */
async function reason(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: unknown; errors?: { message?: unknown }[] };
    const detail = body.errors?.map((e) => e.message).find((m) => typeof m === "string");
    return typeof body.message === "string" ? (detail ? `${body.message}: ${detail}` : body.message) : null;
  } catch {
    return null;
  }
}

async function github<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<{ data: T; link: string | null; scopes: string | null }> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "archer-app",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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
    const why = await reason(res);
    throw new GitHubError(
      why ? `GitHub refused the request: ${why}` : "GitHub refused the request (private repo without the repo scope?).",
      403,
      "forbidden",
    );
  }
  // Writes: a stale blob sha, a protected branch, a ref or pull request that already exists.
  if (res.status === 409) throw new GitHubError((await reason(res)) ?? "GitHub reported a conflict.", 409, "conflict");
  if (res.status === 422) throw new GitHubError((await reason(res)) ?? "GitHub rejected the request.", 422, "invalid");
  if (!res.ok) throw new GitHubError(`GitHub error ${res.status}`, 502, "upstream");
  return {
    data: (res.status === 204 ? null : await res.json()) as T,
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
  return { commits: data.map(mapCommit), hasMore: !!link && /rel="next"/.test(link) };
}

const mapCommit = (c: Record<string, unknown>): GitHubCommit => {
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
};

const enc = encodeURIComponent;
/** A repo path or branch name in a URL: each segment encoded, slashes kept. */
const encPath = (path: string): string => path.split("/").map(enc).join("/");

// Base64 that works in any runtime (the Contents API speaks base64; files are UTF-8).
const fromBase64 = (b64: string): string => {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};
const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/* ------------------------------------------------ Files, branches and pulls */

export interface GitHubFile {
  path: string;
  /** Blob sha: identifies this content, and is required to replace it. */
  sha: string;
  content: string;
}

/** A file's text at a ref (branch, tag or commit), or null when there is no file at that path. */
export async function getFile(
  token: string | null,
  owner: string,
  name: string,
  path: string,
  ref: string,
): Promise<GitHubFile | null> {
  let data: { type: string; sha: string; path: string; content?: string; encoding?: string };
  try {
    ({ data } = await github<typeof data>(
      `/repos/${enc(owner)}/${enc(name)}/contents/${encPath(path)}?ref=${enc(ref)}`,
      token,
    ));
  } catch (e) {
    if (e instanceof GitHubError && e.code === "not_found") return null;
    throw e;
  }
  if (Array.isArray(data) || data.type !== "file")
    throw new GitHubError(`${path} is not a file.`, 400, "invalid");
  // Files over 1 MB come without content; the blob API still serves them.
  if (data.encoding !== "base64" || data.content === undefined || data.content === "") {
    const blob = await github<{ content: string }>(
      `/repos/${enc(owner)}/${enc(name)}/git/blobs/${enc(data.sha)}`,
      token,
    );
    return { path: data.path, sha: data.sha, content: fromBase64(blob.data.content) };
  }
  return { path: data.path, sha: data.sha, content: fromBase64(data.content) };
}

/** Every `.arch` file on a ref, sorted. `truncated`: the repo is too big to list completely. */
export async function listArchFiles(
  token: string | null,
  owner: string,
  name: string,
  ref: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  const { data } = await github<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `/repos/${enc(owner)}/${enc(name)}/git/trees/${encPath(ref)}?recursive=1`,
    token,
  );
  return {
    paths: data.tree
      .filter((e) => e.type === "blob" && e.path.endsWith(".arch"))
      .map((e) => e.path)
      .sort(),
    truncated: !!data.truncated,
  };
}

/** The newest commit on `ref` that touched `path`: who last changed the file, and why. */
export async function lastCommitForPath(
  token: string | null,
  owner: string,
  name: string,
  ref: string,
  path: string,
): Promise<GitHubCommit | null> {
  const params = new URLSearchParams({ sha: ref, path, per_page: "1" });
  const { data } = await github<Record<string, unknown>[]>(
    `/repos/${enc(owner)}/${enc(name)}/commits?${params}`,
    token,
  );
  return data[0] ? mapCommit(data[0]) : null;
}

/** The commit a branch points at. */
export async function getBranchHead(
  token: string | null,
  owner: string,
  name: string,
  branch: string,
): Promise<string> {
  const { data } = await github<{ object: { sha: string } }>(
    `/repos/${enc(owner)}/${enc(name)}/git/ref/heads/${encPath(branch)}`,
    token,
  );
  return data.object.sha;
}

export async function createBranch(
  token: string | null,
  owner: string,
  name: string,
  branch: string,
  fromSha: string,
): Promise<void> {
  await github(`/repos/${enc(owner)}/${enc(name)}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

/**
 * Create or replace a file with one commit on `branch`. `sha` is the blob
 * being replaced (omit it to create the file); GitHub refuses the write with
 * a conflict when the file has moved on since.
 */
export async function putFile(
  token: string | null,
  owner: string,
  name: string,
  file: { path: string; branch: string; content: string; message: string; sha?: string },
): Promise<{ commit: string; blob: string; url: string }> {
  const { data } = await github<{ content: { sha: string }; commit: { sha: string; html_url: string } }>(
    `/repos/${enc(owner)}/${enc(name)}/contents/${encPath(file.path)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({
        message: file.message,
        content: toBase64(file.content),
        branch: file.branch,
        ...(file.sha ? { sha: file.sha } : {}),
      }),
    },
  );
  return { commit: data.commit.sha, blob: data.content.sha, url: data.commit.html_url };
}

export interface GitHubPull {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  /** Head branch name. */
  head: string;
}

const mapPull = (p: Record<string, unknown>): GitHubPull => ({
  number: p.number as number,
  url: p.html_url as string,
  state: p.state === "open" ? "open" : "closed",
  merged: !!p.merged || !!p.merged_at,
  head: (p.head as { ref: string }).ref,
});

export async function createPullRequest(
  token: string | null,
  owner: string,
  name: string,
  pr: { title: string; body: string; head: string; base: string },
): Promise<GitHubPull> {
  const { data } = await github<Record<string, unknown>>(`/repos/${enc(owner)}/${enc(name)}/pulls`, token, {
    method: "POST",
    body: JSON.stringify(pr),
  });
  return mapPull(data);
}

export async function getPullRequest(
  token: string | null,
  owner: string,
  name: string,
  number: number,
): Promise<GitHubPull> {
  const { data } = await github<Record<string, unknown>>(
    `/repos/${enc(owner)}/${enc(name)}/pulls/${number}`,
    token,
  );
  return mapPull(data);
}

/* ---------------------------------------------------------------- GitHub App */

/** The App's installation on a repository, or null when it isn't installed there. `appJwt` from lib/server/github.ts. */
export async function findRepoInstallation(appJwt: string, owner: string, name: string): Promise<number | null> {
  try {
    const { data } = await github<{ id: number }>(`/repos/${enc(owner)}/${enc(name)}/installation`, appJwt);
    return data.id;
  } catch (e) {
    if (e instanceof GitHubError && e.code === "not_found") return null;
    throw e;
  }
}

/** A short-lived token that acts as the App's installation (scoped to its repositories). */
export async function createInstallationToken(
  appJwt: string,
  installationId: number,
): Promise<{ token: string; expiresAt: number }> {
  const { data } = await github<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt,
    { method: "POST" },
  );
  return { token: data.token, expiresAt: Date.parse(data.expires_at) };
}

/** Web URL for a path inside the repo at a branch (file or directory). */
export const githubTreeUrl = (owner: string, name: string, branch: string, path: string): string =>
  `https://github.com/${enc(owner)}/${enc(name)}/tree/${encodeURIComponent(branch)}/${path
    .split("/")
    .filter(Boolean)
    .map(enc)
    .join("/")}`;

