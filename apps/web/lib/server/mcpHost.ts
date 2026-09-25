import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { ArcherHost } from "@archer/mcp/host";
import { renderArchSvg } from "@/lib/svg";
import { getRepo, listBranches, listCommits, searchRepos } from "@/lib/server/github";
import {
  actorFor,
  archFiles,
  createFromRepo,
  linkFile,
  publishDocument,
  syncWith,
  type Actor,
} from "@/lib/server/repoSync";

/**
 * What the hosted MCP route (app/mcp/route.ts) lends the tools — see
 * @archer/mcp/host. Each GitHub method is what one of the app's
 * `app/api/github/*` routes does, for the user the route verified instead of
 * the signed-in browser: same engine, same GitHub access (the user's own
 * token from Clerk, or the Archer GitHub App where the engine falls back to
 * it), same errors. Plus the SVG renderer behind share images, and the user's
 * email from Clerk (for invitations).
 */

/**
 * The user as a sync actor. An agent's call can reach GitHub several times
 * (list_arch_files: the repository, its branches, its files), so the token
 * lookup is reused briefly. Server memory only.
 */
const ACTOR_TTL_MS = 30_000;
const actors = new Map<string, { actor: Promise<Actor>; at: number }>();
function actor(userId: string): Promise<Actor> {
  const hit = actors.get(userId);
  if (hit && Date.now() - hit.at < ACTOR_TTL_MS) return hit.actor;
  if (actors.size > 1000) actors.clear();
  const fresh = actorFor(userId);
  actors.set(userId, { actor: fresh, at: Date.now() });
  fresh.catch(() => actors.delete(userId));
  return fresh;
}

const EMAIL_TTL_MS = 5 * 60_000;
const emails = new Map<string, { email: string | null; at: number }>();

/** The user's primary email address, as their Clerk session carries it for the app (convex/workspaces.ts). */
async function userEmail(userId: string): Promise<string | null> {
  const hit = emails.get(userId);
  if (hit && Date.now() - hit.at < EMAIL_TTL_MS) return hit.email;
  const user = await (await clerkClient()).users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  if (emails.size > 1000) emails.clear();
  emails.set(userId, { email, at: Date.now() });
  return email;
}

export const mcpHost: ArcherHost = {
  userEmail,
  renderSvg: (source, { theme, customTypes }) => renderArchSvg(source, { theme, customTypes }),
  github: {
    repos: async (userId, query) => searchRepos((await actor(userId)).token, query),
    repo: async (userId, { owner, name }) => getRepo((await actor(userId)).token, owner, name),
    branches: async (userId, { owner, name }) => listBranches((await actor(userId)).token, owner, name),
    files: async (userId, { owner, name }, branch) => archFiles(await actor(userId), owner, name, branch),
    commits: async (userId, { owner, name }, branch, { page, since }) =>
      listCommits((await actor(userId)).token, owner, name, branch, { page, perPage: 50, since }),
    importFile: async (userId, workspaceId, file) => createFromRepo(await actor(userId), workspaceId, file),
    storeInFile: async (userId, workspaceId, documentId, file) =>
      linkFile(await actor(userId), workspaceId, documentId, file),
    sync: async (userId, workspaceId, documentId, resolve) =>
      syncWith(await actor(userId), workspaceId, documentId, resolve),
    publish: async (userId, workspaceId, documentId, opts) =>
      publishDocument(await actor(userId), workspaceId, documentId, opts),
  },
};
