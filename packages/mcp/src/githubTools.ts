import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diffDocs, isEmptyDiff, parse } from "@archer/lang";
import { APP_URL, db, type ProjectDoc, type RepoLink } from "./backend";
import type { ProjectRead } from "./contract";
import {
  errorCode,
  errorDetails,
  type ArcherHost,
  type FileRef,
  type GitHubRepoInfo,
  type PublishResult,
  type RepoRef,
  type SyncOutcome,
} from "./host";
import { caller, fail, optionalWorkspace, parseRepository, requireProject, requireWorkspace, text, wrap } from "./tool";

// Projects stored in a .arch file in a GitHub repository (docs/repo-sync.md):
// the app's From GitHub, Move to GitHub, Sync, Publish and Stop syncing, plus
// the repository browsing its dialogs do. Everything that reaches GitHub goes
// through the host (host.ts), which acts with the user's own GitHub access.

type StoredLink = RepoLink & { path: string };

const short = (sha: string) => sha.slice(0, 7);

/** The sync state get_project reports for a project stored in a file. */
const syncView = (doc: ProjectDoc & { repo: StoredLink }) => {
  const r = doc.repo;
  return {
    base_commit: r.base?.commit ?? null,
    unpublished_changes: r.base ? !isEmptyDiff(diffDocs(parse(r.base.source).doc, parse(doc.source).doc)) : true,
    pull_request: r.pr?.url ?? null,
    conflict: !!r.incoming,
    conflicts: r.incoming?.conflicts ?? [],
    problem: r.problem?.message ?? null,
  };
};

const isStored = (doc: ProjectDoc): doc is ProjectDoc & { repo: StoredLink } => !!doc.repo?.path;

/** The repository a project describes, and the file it's stored in, as get_project reports it. */
export const repositoryView = (doc: ProjectDoc): ProjectRead["repository"] => {
  const r = doc.repo;
  if (!r) return null;
  const common = {
    full_name: `${r.owner}/${r.name}`,
    branch: r.branch,
    url: `https://github.com/${r.owner}/${r.name}/tree/${r.branch}`,
  };
  if (!isStored(doc))
    return { ...common, hint: "Drift checks and `src` paths refer to this repository at this branch." };
  const { path } = doc.repo;
  return {
    ...common,
    path,
    hint: `This project is stored in ${path} in ${r.owner}/${r.name} on ${r.branch}: that file is the source of truth. If you are working in that repository, edit the file directly (with the code it describes; validate with \`archer check\`; no layout block) and the canvas follows when it reaches ${r.branch}. update_project only changes the project's unpublished draft; publish_to_github writes the draft to the file (a pull request by default) when the user asks, and sync_with_github brings in what changed on the branch.`,
    sync: syncView(doc),
  };
};

const fileView = (f: FileRef) => ({ full_name: `${f.owner}/${f.name}`, branch: f.branch, path: f.path });

const repoInfo = (r: GitHubRepoInfo) => ({
  full_name: r.fullName,
  private: r.private,
  default_branch: r.defaultBranch,
  description: r.description,
  pushed_at: r.pushedAt,
  url: r.htmlUrl,
});

/** A repository path to a .arch file, or throw. */
const archPath = (path: string): string => {
  const p = path.trim().replace(/^\/+/, "");
  if (!p.endsWith(".arch") || p.split("/").some((s) => s === "" || s === "." || s === ".."))
    throw new Error(`The file must be a path inside the repository ending in .arch, e.g. architecture.arch or docs/system.arch (got '${path}').`);
  return p;
};

const sameRepo = (a: RepoRef, b: RepoRef) =>
  a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();

/** A project stored in a file, or throw. */
const storedOrThrow = (doc: ProjectDoc): ProjectDoc & { repo: StoredLink } => {
  if (!isStored(doc))
    throw new Error(
      doc.repo
        ? `This project is linked to ${doc.repo.owner}/${doc.repo.name} but stored in Archer, not in a file there. move_to_github stores it in one.`
        : "This project is stored in Archer, not in a repository file. move_to_github stores it in one.",
    );
  return doc;
};

/** What a sync did, in a sentence. */
function describeOutcome(o: SyncOutcome, f: StoredLink): string {
  switch (o.status) {
    case "unchanged":
      return `Up to date: ${f.path} hasn't changed on ${f.branch} since the last sync.`;
    case "missing":
      return `${f.path} doesn't exist on ${f.branch} yet: publish_to_github creates it.`;
    case "adopted":
      return `${f.branch} already has the draft's architecture (its pull request merged, or the same change landed another way): nothing is left to publish.`;
    case "imported":
      return `Imported ${f.path} from ${f.branch} (${short(o.commit)} by ${o.author}).`;
    case "merged":
      return `Merged ${o.author}'s changes to ${f.path} on ${f.branch} (${short(o.commit)}) into the draft.`;
    case "conflict":
      return `${f.path} changed on ${f.branch} in ways that conflict with the draft. See them with diff_project (compare: "incoming"), then call sync_with_github again with resolve: "draft" to keep the draft's side of each conflict or "repo" to keep the repository's.`;
    case "problem":
      return o.message;
  }
}

/** Rethrow a host error, as JSON with its diagnostics when a file didn't validate. */
const hostFailure = (e: unknown) => {
  const errors = errorDetails(e);
  if (errors) return fail({ message: e instanceof Error ? e.message : String(e), errors });
  throw e;
};

export function registerGitHubTools(server: McpServer, host: ArcherHost): void {
  const gh = host.github;

  /** The branch to use: the one given, else the repository's default branch. */
  const branchOr = async (userId: string, ref: RepoRef, branch: string | undefined) =>
    branch?.trim() || (await gh.repo(userId, ref)).defaultBranch;

  server.registerTool(
    "list_github_repos",
    {
      title: "List the user's GitHub repositories",
      description:
        "Search the GitHub repositories the user can see, most recently pushed first (the app's repository picker). Acts with the user's own GitHub access; you never see a token. `private_access: false` means private repositories are hidden (no `repo` scope): the user grants it with Grant access in the app. Public repositories work by owner/name even when not listed.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe("Filter on owner/name; an exact owner/name also finds public repositories outside the user's account"),
      },
    },
    wrap(async ({ search }) => {
      const { userId } = caller();
      const r = await gh.repos(userId, search ?? "");
      const shown = r.repos.slice(0, 50);
      const note = !r.hasToken
        ? "The user's Archer account has no GitHub token (they didn't sign in with GitHub, or need to sign out and back in). Public repositories still work by owner/name."
        : r.privateAccess === false
          ? "Private repositories are hidden: GitHub access was granted without the repo scope. The user can grant it with Grant access in the app's repository picker."
          : undefined;
      return text({
        repositories: shown.map(repoInfo),
        ...(r.repos.length > shown.length ? { more: r.repos.length - shown.length } : {}),
        github_connected: r.hasToken,
        private_access: r.privateAccess,
        ...(note ? { note } : {}),
      });
    }),
  );

  server.registerTool(
    "list_arch_files",
    {
      title: "List a repository's .arch files",
      description:
        "The .arch files on a branch of a GitHub repository, plus its branches: what From GitHub and Move to GitHub show. A file already stored as a project in this workspace has that project's id. Uses the user's GitHub access.",
      inputSchema: {
        repository: z.string().describe("owner/name (or a github.com URL)"),
        branch: z.string().optional().describe("Default: the repository's default branch"),
      },
    },
    wrap(async ({ repository, branch }) => {
      const { userId } = caller();
      const ref = parseRepository(repository);
      const info = await gh.repo(userId, ref);
      const b = branch?.trim() || info.defaultBranch;
      const [files, branches] = await Promise.all([gh.files(userId, ref, b), gh.branches(userId, ref)]);
      const ws = await optionalWorkspace();
      const projects = ws ? await db.listProjects(ws).catch(() => []) : [];
      const projectFor = (path: string) =>
        projects.find((p) => p.repo?.path === path && p.repo.branch === b && sameRepo(p.repo, ref))?._id ?? null;
      return text({
        repository: info.fullName,
        branch: b,
        default_branch: info.defaultBranch,
        branches: branches.map((x) => x.name),
        files: files.paths.map((path) => ({ path, project_id: projectFor(path) })),
        truncated: files.truncated,
      });
    }),
  );

  server.registerTool(
    "list_github_commits",
    {
      title: "List the linked repository's commits",
      description:
        "The commits on the branch of the repository a project is linked to (or stored in), newest first, 50 per page: the Code timeline in the app's History. Useful to see what changed in the code since a drift check or a revision. Uses the user's GitHub access.",
      inputSchema: {
        project_id: z.string(),
        page: z.number().int().min(1).max(100).optional().describe("Page of 50, from 1 (default 1)"),
        since: z.string().optional().describe("Only commits after this ISO timestamp"),
      },
    },
    wrap(async ({ project_id, page, since }) => {
      const ws = await requireWorkspace();
      const project = await requireProject(ws, project_id);
      const r = project.repo;
      if (!r) throw new Error("This project isn't linked to a repository. link_repository links one.");
      if (since !== undefined && Number.isNaN(Date.parse(since)))
        throw new Error(`since must be an ISO timestamp, got '${since}'.`);
      const n = page ?? 1;
      const { commits, hasMore } = await gh.commits(caller().userId, r, r.branch, {
        page: n,
        ...(since ? { since: new Date(since).toISOString() } : {}),
      });
      return text({
        repository: `${r.owner}/${r.name}`,
        branch: r.branch,
        page: n,
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message.split("\n")[0]!,
          author: c.authorLogin ?? c.authorName,
          date: c.date,
          url: c.htmlUrl,
        })),
        has_more: hasMore,
      });
    }),
  );

  server.registerTool(
    "import_from_github",
    {
      title: "New project from a repository file",
      description:
        "Create a project stored in a .arch file in a GitHub repository (the dashboard's From GitHub), in the current workspace. An existing file is imported (it must validate; the error lists what doesn't); a missing one starts blank and the first publish_to_github creates it. From then on the file on that branch is the source of truth. Needs the user's own GitHub read access; list_arch_files shows the files.",
      inputSchema: {
        repository: z.string().describe("owner/name (or a github.com URL)"),
        branch: z.string().optional().describe("Default: the repository's default branch"),
        path: z.string().describe("The .arch file in the repository, e.g. architecture.arch or docs/system.arch"),
      },
    },
    wrap(async ({ repository, branch, path }) => {
      const ws = await requireWorkspace();
      const { userId } = caller();
      const ref = parseRepository(repository);
      const file: FileRef = { ...ref, branch: await branchOr(userId, ref, branch), path: archPath(path) };
      let r: { id: string; imported: boolean };
      try {
        r = await gh.importFile(userId, ws.workspaceId, file);
      } catch (e) {
        return hostFailure(e);
      }
      const doc = await db.getProject(ws, r.id);
      return text({
        id: r.id,
        title: doc?.title ?? null,
        imported: r.imported,
        editor_url: `${APP_URL}/documents/${r.id}`,
        repository: fileView(file),
        note: r.imported
          ? `Imported ${file.path} from ${file.branch}. The file is the source of truth from now on.`
          : `${file.path} doesn't exist on ${file.branch} yet: the project starts blank, and publish_to_github creates the file.`,
      });
    }),
  );

  server.registerTool(
    "move_to_github",
    {
      title: "Store a project in a repository file",
      description:
        "Store an existing project in a .arch file in a GitHub repository from now on (the editor's Move to GitHub). Nothing is written yet: publish_to_github creates the file, or replaces an existing one (as a pull request by default). After that the file on the branch is the source of truth. Needs the user's own GitHub read access. Only when the user asks.",
      inputSchema: {
        project_id: z.string(),
        repository: z.string().optional().describe("owner/name (default: the repository the project is linked to)"),
        branch: z
          .string()
          .optional()
          .describe("Default: the linked branch, else the repository's default branch"),
        path: z.string().describe("Where the file goes in the repository, e.g. architecture.arch or docs/system.arch"),
      },
    },
    wrap(async ({ project_id, repository, branch, path }) => {
      const ws = await requireWorkspace();
      const { userId } = caller();
      const project = await requireProject(ws, project_id);
      if (isStored(project))
        throw new Error(
          `This project is already stored in ${project.repo.path} in ${project.repo.owner}/${project.repo.name} (${project.repo.branch}). stop_syncing first to store it somewhere else.`,
        );
      const linked = project.repo ?? null;
      const ref = repository ? parseRepository(repository) : linked;
      if (!ref) throw new Error("Pass repository: this project isn't linked to one.");
      const b = branch?.trim() || (linked && sameRepo(linked, ref) ? linked.branch : await branchOr(userId, ref, undefined));
      const file: FileRef = { owner: ref.owner, name: ref.name, branch: b, path: archPath(path) };
      const { existed } = await gh.storeInFile(userId, ws.workspaceId, project_id, file);
      return text({
        id: project_id,
        repository: fileView(file),
        file_existed: existed,
        note: existed
          ? `${file.path} already exists on ${file.branch}: the project is now a draft that replaces it when published (publish_to_github; a pull request by default).`
          : `publish_to_github creates ${file.path} on ${file.branch}.`,
      });
    }),
  );

  server.registerTool(
    "sync_with_github",
    {
      title: "Sync a project with its repository file",
      description:
        "Bring a repository-stored project up to date with its file (the editor's Sync now; the app also syncs on open and on every push). A newer file is imported, or merged with the draft when they changed different things; changes to the same things are recorded as a conflict. Settle one with `resolve`: 'draft' keeps the draft's side (Keep mine), 'repo' the repository's (Keep theirs). Show the user diff_project (compare: 'incoming') and let them choose. Returns what happened and the sync state.",
      inputSchema: {
        project_id: z.string(),
        resolve: z
          .enum(["draft", "repo"])
          .optional()
          .describe("Settle a conflict first, keeping the draft's side or the repository's"),
      },
    },
    wrap(async ({ project_id, resolve }) => {
      const ws = await requireWorkspace();
      const project = storedOrThrow(await requireProject(ws, project_id));
      if (resolve && !project.repo.incoming)
        throw new Error("There's no conflict to resolve. Call sync_with_github without resolve to check the file.");
      const outcome = await gh.sync(caller().userId, ws.workspaceId, project_id, resolve);
      const after = await db.getProject(ws, project_id);
      const resolved = resolve
        ? `Resolved the conflict keeping ${resolve === "draft" ? "the draft's" : "the repository's"} side. `
        : "";
      return text({
        id: project_id,
        status: outcome.status,
        message: resolved + describeOutcome(outcome, project.repo),
        ...(outcome.status === "imported" || outcome.status === "merged" ? { commit: outcome.commit, author: outcome.author } : {}),
        ...(outcome.status === "conflict" ? { conflicts: outcome.conflicts } : {}),
        sync: after && isStored(after) ? syncView(after) : null,
      });
    }),
  );

  server.registerTool(
    "publish_to_github",
    {
      title: "Publish a project's draft to its repository file",
      description:
        "Write a repository-stored project's unpublished draft to its file (the editor's Publish). mode 'pr' (default) opens a pull request, or adds a commit to the one already open; 'commit' pushes straight to the branch and needs push access. diff_project with compare: 'unpublished' shows what will be written. Refused while the document has errors or a conflict waits; if the file changed since the last sync, it syncs first. Only publish when the user asks.",
      inputSchema: {
        project_id: z.string(),
        mode: z
          .enum(["pr", "commit"])
          .optional()
          .describe("'pr' (default): a pull request; 'commit': straight to the branch"),
        message: z
          .string()
          .max(200)
          .optional()
          .describe("Commit message and pull request title (default: generated from the changes)"),
      },
    },
    wrap(async ({ project_id, mode, message }) => {
      const ws = await requireWorkspace();
      const { userId } = caller();
      const project = storedOrThrow(await requireProject(ws, project_id));
      const opts = { mode: mode ?? ("pr" as const), ...(message?.trim() ? { message: message.trim() } : {}) };
      let syncedFirst: SyncOutcome | null = null;
      let result: PublishResult;
      try {
        result = await gh.publish(userId, ws.workspaceId, project_id, opts);
      } catch (e) {
        if (errorCode(e) !== "stale") throw e;
        // The file moved since the last sync: catch up, then publish on top, as the app does.
        syncedFirst = await gh.sync(userId, ws.workspaceId, project_id);
        if (syncedFirst.status === "conflict")
          return fail({
            message: `${project.repo.path} changed on ${project.repo.branch} in ways that conflict with the draft, so nothing was published. Resolve it with sync_with_github (resolve: "draft" or "repo"), then publish again.`,
            conflicts: syncedFirst.conflicts,
          });
        result = await gh.publish(userId, ws.workspaceId, project_id, opts);
      }
      return text({
        id: project_id,
        ...result,
        repository: fileView(project.repo),
        ...(syncedFirst ? { synced_first: describeOutcome(syncedFirst, project.repo) } : {}),
      });
    }),
  );

  server.registerTool(
    "stop_syncing",
    {
      title: "Stop syncing a project with its file",
      description:
        "Keep a project in Archer again instead of in its repository file (the editor's Stop syncing). The project stays as it is, unpublished changes included; the file isn't touched; the repository stays linked. Only when the user asks.",
      inputSchema: { project_id: z.string() },
    },
    wrap(async ({ project_id }) => {
      const ws = await requireWorkspace();
      const project = storedOrThrow(await requireProject(ws, project_id));
      const f = project.repo;
      await db.unlinkFile(ws, project_id);
      return text({
        id: project_id,
        stopped_syncing: fileView(f),
        repository: { full_name: `${f.owner}/${f.name}`, branch: f.branch },
        note: `The project is stored in Archer again. ${f.path} is untouched, and ${f.owner}/${f.name} stays linked.`,
      });
    }),
  );
}
