import type { Diagnostic } from "@archer/lang";
import { formatDiagnostic } from "./analysis";
import { db, requestContext, type RequestContext, type Workspace } from "./backend";

// Plumbing every tool module shares (server.ts, githubTools.ts, teamTools.ts):
// results, the per-request identity, and the current workspace.

export const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});
export const fail = (value: unknown) => ({ ...text(value), isError: true });

export type ToolResult = ReturnType<typeof text> & { isError?: boolean };

/**
 * The caller is a verified user (see `wrap`). Their workspace is the one they
 * picked with use_workspace, else Personal (its id == user id). Resolved per
 * call — nothing about a user may be cached in module state.
 */
export const currentWorkspace = async (ctx: RequestContext): Promise<Workspace> => {
  const pref = await db.getAgentWorkspace(ctx.serviceKey);
  return { workspaceId: pref?.workspaceId ?? ctx.userId, serviceKey: ctx.serviceKey };
};

/** The request's identity; `wrap` guarantees one inside every tool. */
export const caller = (): RequestContext => {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("Not authenticated");
  return ctx;
};

export const requireWorkspace = (): Promise<Workspace> => currentWorkspace(caller());

/** Best-effort workspace for tools that also work without one. */
export const optionalWorkspace = (): Promise<Workspace | null> =>
  currentWorkspace(caller()).catch(() => null);

/** The SDK calls tools as (args, extra) with an inputSchema and (extra) without one. */
const findExtra = (a: unknown, b: unknown): { authInfo?: { extra?: Record<string, unknown> } } | null => {
  for (const c of [b, a]) {
    if (c !== null && typeof c === "object" && "signal" in c)
      return c as { authInfo?: { extra?: Record<string, unknown> } };
  }
  return null;
};

/**
 * Every tool goes through this. It turns thrown errors into MCP error results
 * and establishes the per-request identity: the web route has already
 * verified the OAuth token and put `{ userId, agentName }` on
 * `authInfo.extra`; the tool body then runs inside `requestContext`.
 */
export const wrap =
  <A>(fn: (args: A) => Promise<ToolResult>) =>
  async (a: A, b?: unknown): Promise<ToolResult> => {
    const run = async (args: A) => {
      try {
        return await fn(args);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    };
    const extra = findExtra(a, b);
    const args = (extra !== null && (extra as unknown) === a ? {} : a) as A;
    const info = extra?.authInfo?.extra;
    const userId = typeof info?.userId === "string" ? info.userId : "";
    if (userId === "") return fail("Not authenticated");
    const secret = process.env.ARCHER_SERVICE_SECRET;
    if (!secret) return fail("Server misconfigured: ARCHER_SERVICE_SECRET is not set");
    const name = typeof info?.agentName === "string" && info.agentName.trim() !== "" ? info.agentName.trim() : "agent";
    return requestContext.run(
      { userId, agentName: name, serviceKey: `svc_${secret}.${userId}` },
      () => run(args),
    );
  };

export const diagnosticsReport = (ds: readonly Diagnostic[]) => ds.map(formatDiagnostic);

export const iso = (ms: number) => new Date(ms).toISOString();

export const requireProject = async (ws: Workspace, projectId: string) => {
  const doc = await db.getProject(ws, projectId);
  if (!doc) throw new Error(`No project with id ${projectId}. Use list_projects.`);
  return doc;
};

const REPO_NAME = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;

/** "owner/name", "owner/name.git" or a github.com URL → its parts, or throw. */
export function parseRepository(input: string): { owner: string; name: string } {
  const bare = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\/+$/, "");
  // A URL may go on into the repository (…/tree/main/docs): keep owner/name.
  const [owner, name] = bare.split("/");
  const m = owner && name ? REPO_NAME.exec(`${owner}/${name}`) : null;
  if (!m) throw new Error(`Repository must look like owner/name (e.g. acme/platform), got '${input}'.`);
  return { owner: m[1]!, name: m[2]! };
}
