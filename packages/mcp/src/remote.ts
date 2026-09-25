import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ArcherHost } from "./host";
import { registerArcherTools } from "./server";

/** What the hosting route has verified about the caller (OAuth). */
export interface RemoteAuth {
  /** The bearer token that was verified. */
  token: string;
  /** OAuth client id of the connecting agent. */
  clientId: string;
  scopes: string[];
  /** Verified user id (Clerk `user_…`). */
  userId: string;
  /** Display name of the connecting client, for attribution in history. */
  agentName?: string;
}

export const REMOTE_SERVER_VERSION = "1.8.0";

/**
 * Serve one MCP Streamable-HTTP request, statelessly: a fresh server and
 * transport per request, nothing retained between calls. The caller (the web
 * app's /mcp route) is responsible for authenticating the request first; this
 * function trusts `auth`. `host` lends the tools what lives in the app
 * (GitHub, image rendering, the user's email: see host.ts); without it those
 * tools answer that they aren't available.
 *
 * Lives in this package so the app never imports the MCP SDK itself — two
 * copies of the SDK (one per zod peer) do not interoperate.
 */
export async function handleRemoteRequest(req: Request, auth: RemoteAuth, host?: ArcherHost): Promise<Response> {
  const server = new McpServer({ name: "archer", version: REMOTE_SERVER_VERSION });
  registerArcherTools(server, host);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req, {
      authInfo: {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
        extra: { userId: auth.userId, agentName: auth.agentName ?? "agent" },
      },
    });
  } finally {
    void server.close().catch(() => {});
  }
}
