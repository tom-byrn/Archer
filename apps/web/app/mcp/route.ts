import { auth, clerkClient } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { handleRemoteRequest } from "@archer/mcp/remote";

/**
 * Hosted MCP server: https://<app>/mcp (Streamable HTTP, stateless).
 *
 * Auth is MCP-standard OAuth with Clerk as the authorization server. Clients
 * discover it through /.well-known/oauth-protected-resource/mcp, register
 * themselves (dynamic client registration is enabled on the Clerk instance),
 * send the user through Clerk's consent screen, and call this route with a
 * bearer token. The verified user id is handed to the tools, which reach
 * Convex with a server-only service credential — see convex/access.ts.
 *
 * The same tools also ship as a local stdio server (packages/mcp) for CI and
 * offline use; that one authenticates with API keys.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

const withCors = (res: Response): Response => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

/** Public origin of this deployment (behind Vercel's proxy the request URL is already right). */
const originOf = (req: Request): string => {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
};

const unauthorized = (req: Request, description: string): Response =>
  withCors(
    Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: description }, id: null },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer error="invalid_token", error_description="${description}", resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource/mcp"`,
        },
      },
    ),
  );

/** OAuth client id → display name ("Claude Code", "Cursor"…), for attribution. */
const clientNames = new Map<string, string>();
async function agentNameFor(clientId: string): Promise<string> {
  const cached = clientNames.get(clientId);
  if (cached) return cached;
  try {
    const clerk = await clerkClient();
    const { data } = await clerk.oauthApplications.list({ limit: 100 });
    for (const app of data) if (app.clientId) clientNames.set(app.clientId, app.name);
  } catch {
    // Attribution is best-effort; never fail a tool call over it.
  }
  return clientNames.get(clientId) ?? "agent";
}

async function handle(req: Request): Promise<Response> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) return unauthorized(req, "Authorization required");

  const clerkAuth = await auth({ acceptsToken: "oauth_token" });
  const verified = verifyClerkToken(clerkAuth, token);
  if (!verified) return unauthorized(req, "Invalid or expired access token");

  return withCors(
    await handleRemoteRequest(req, {
      token,
      clientId: verified.clientId,
      scopes: verified.scopes,
      userId: verified.extra!.userId as string,
      agentName: await agentNameFor(verified.clientId),
    }),
  );
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
