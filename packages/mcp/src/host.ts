/**
 * What the hosting web app lends the tools. Some of what the app can do lives
 * in apps/web, which this package must not import: the repo sync engine and
 * the GitHub client (they act with the user's GitHub token, which only the
 * app's server can read from Clerk), the SVG renderer behind share images,
 * and the user's email address. The hosted /mcp route passes an
 * implementation to `handleRemoteRequest` (apps/web/lib/server/mcpHost.ts):
 * each GitHub method does what one of the app's `/api/github/*` routes does,
 * for the user the route verified, and image links are served by the app's
 * `/api/render` route. Without a host (tests, scripts, the docs'
 * `describeServer`) the tools that need one say so instead.
 *
 * Errors: a host method throws an Error whose message is meant for the user.
 * `code` names the case, as the app's routes answer it ("stale", "conflict",
 * "no_access", "no_branch", "no_write_access", "invalid", …), and
 * `details.errors` lists the diagnostics when a file doesn't validate.
 */
export interface ArcherHost {
  /** The user's primary email address, or null when they have none. */
  userEmail(userId: string): Promise<string | null>;
  /**
   * A short-lived link to a project's diagram as SVG, drawn the way share
   * images are, as the user sees the project when the link is opened.
   * `path` is relative to the app's origin; `expiresAt` is epoch ms.
   */
  imageLink(userId: string, image: ImageRequest): { path: string; expiresAt: number };
  github: GitHubHost;
}

export interface ImageRequest {
  workspaceId: string;
  documentId: string;
  theme: "light" | "dark";
}

export interface RepoRef {
  owner: string;
  name: string;
}

/** A .arch file on a branch. */
export interface FileRef extends RepoRef {
  branch: string;
  path: string;
}

export interface GitHubRepoInfo {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string | null;
  htmlUrl: string;
}

export interface GitHubCommitInfo {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  /** ISO timestamp. */
  date: string;
  htmlUrl: string;
}

/** What syncing a stored document with its file did (apps/web/lib/server/repoSync.ts). */
export type SyncOutcome =
  | { status: "unchanged" }
  | { status: "missing" }
  | { status: "adopted" }
  | { status: "imported" | "merged"; commit: string; author: string }
  | { status: "conflict"; conflicts: string[] }
  | { status: "problem"; message: string };

export type PublishResult =
  | { mode: "commit"; commit: string; url: string }
  | { mode: "pr"; number: number; url: string; updated: boolean };

/** The app's GitHub routes, for one user. */
export interface GitHubHost {
  /** Repositories the user's GitHub account can see, filtered by `query` (GET /api/github/repos). */
  repos(
    userId: string,
    query: string,
  ): Promise<{ repos: GitHubRepoInfo[]; hasToken: boolean; privateAccess: boolean | null }>;
  /** One repository; public ones need no token. */
  repo(userId: string, repo: RepoRef): Promise<GitHubRepoInfo>;
  /** GET /api/github/branches */
  branches(userId: string, repo: RepoRef): Promise<{ name: string; sha: string }[]>;
  /** The .arch files on a branch (GET /api/github/files). */
  files(userId: string, repo: RepoRef, branch: string): Promise<{ paths: string[]; truncated: boolean }>;
  /** A page of commits on a branch, newest first (GET /api/github/commits). */
  commits(
    userId: string,
    repo: RepoRef,
    branch: string,
    opts: { page: number; since?: string },
  ): Promise<{ commits: GitHubCommitInfo[]; hasMore: boolean }>;
  /** "From GitHub": a new document stored in the file, imported when it exists (POST /api/github/projects). */
  importFile(userId: string, workspaceId: string, file: FileRef): Promise<{ id: string; imported: boolean }>;
  /** "Move to GitHub": store an existing document in the file (POST /api/github/link). */
  storeInFile(userId: string, workspaceId: string, documentId: string, file: FileRef): Promise<{ existed: boolean }>;
  /** Bring a stored document up to date with its file, first settling a conflict when `resolve` is set (POST /api/github/sync). */
  sync(userId: string, workspaceId: string, documentId: string, resolve?: "draft" | "repo"): Promise<SyncOutcome>;
  /** Write the draft to the file as a pull request or a commit (POST /api/github/publish). */
  publish(
    userId: string,
    workspaceId: string,
    documentId: string,
    opts: { mode: "pr" | "commit"; message?: string },
  ): Promise<PublishResult>;
}

const unavailable = (what: string) => (): never => {
  throw new Error(`${what} isn't available on this server: it runs in the hosted Archer app.`);
};

/** The host when there is none: the email is unknown, everything else says it isn't available. */
export const NO_HOST: ArcherHost = {
  userEmail: async () => null,
  imageLink: unavailable("Drawing diagrams"),
  github: {
    repos: unavailable("GitHub"),
    repo: unavailable("GitHub"),
    branches: unavailable("GitHub"),
    files: unavailable("GitHub"),
    commits: unavailable("GitHub"),
    importFile: unavailable("GitHub"),
    storeInFile: unavailable("GitHub"),
    sync: unavailable("GitHub"),
    publish: unavailable("GitHub"),
  },
};

/** The `code` a host error carries, if any. */
export const errorCode = (e: unknown): string | undefined =>
  e !== null && typeof e === "object" && typeof (e as { code?: unknown }).code === "string"
    ? (e as { code: string }).code
    : undefined;

/** The validation errors a host error carries (a file that doesn't validate), if any. */
export const errorDetails = (e: unknown): string[] | undefined => {
  const details = e !== null && typeof e === "object" ? (e as { details?: { errors?: unknown } }).details : undefined;
  const errors = details?.errors;
  return Array.isArray(errors) && errors.every((x) => typeof x === "string") ? errors : undefined;
};
