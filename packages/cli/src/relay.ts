import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isJSONRPCRequest, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { LoginRequired, signedIn, storedAuth } from "./auth";
import { MCP_URL } from "./config";

/**
 * `archer mcp`: a stdio MCP server for clients that only launch local
 * servers. Every message is relayed to the hosted server with the CLI's
 * sign-in, so the tools are exactly the hosted ones and nothing runs here.
 * Resolves once stdin closes.
 */
export async function relay(log: (line: string) => void): Promise<void> {
  const local = new StdioServerTransport();
  const remote = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: storedAuth() });
  const handshakes = new Set<string | number>();

  const answerWithError = (message: JSONRPCMessage, error: string) => {
    if (isJSONRPCRequest(message))
      void local.send({ jsonrpc: "2.0", id: message.id, error: { code: -32001, message: error } });
  };

  local.onmessage = (message) => {
    if (!signedIn()) {
      answerWithError(message, new LoginRequired().message);
      return;
    }
    if (isJSONRPCRequest(message) && message.method === "initialize") handshakes.add(message.id);
    remote.send(message).catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e);
      log(`archer mcp: ${error}`);
      answerWithError(message, error);
    });
  };

  remote.onmessage = (message) => {
    // Later requests carry the protocol version the handshake settled on.
    if ("result" in message && handshakes.delete(message.id)) {
      const version = (message.result as { protocolVersion?: unknown }).protocolVersion;
      if (typeof version === "string") remote.setProtocolVersion(version);
    }
    void local.send(message);
  };
  remote.onerror = (e) => log(`archer mcp: ${e.message}`);

  await remote.start();
  await local.start();
  log(`archer mcp: relaying stdio to ${MCP_URL}${signedIn() ? "" : " — not signed in yet, run: archer login"}`);

  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
  });
  await Promise.allSettled([remote.close(), local.close()]);
}
