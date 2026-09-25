/**
 * Shared harness for the scripts (and the tests in ../test): connects an MCP
 * client to the tools in-process, the way the hosted /mcp route serves them —
 * every message carries the auth info the route attaches after verifying an
 * OAuth token. Tools reach Convex with the service credential, so
 * ARCHER_SERVICE_SECRET and CONVEX_URL must match the target deployment.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/** Exit 2 with the usage line unless every variable is set. */
export function requireEnv(names: string[], usage: string): void {
  const missing = names.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
  if (missing.length > 0) {
    console.error(`needs: ${missing.join(", ")}\nusage: ${usage}`);
    process.exit(2);
  }
}

export async function connectInProcess(opts: { userId: string; agentName: string }) {
  // Imported late: backend.ts reads CONVEX_URL at import time.
  const { createArcherServer } = await import("../src/server");
  const server = createArcherServer("script");

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  let authenticated = true;
  const deliver = serverTransport.onmessage!;
  serverTransport.onmessage = (message, extra) =>
    deliver.call(serverTransport, message, {
      ...extra,
      authInfo: {
        token: "t",
        clientId: "script",
        scopes: [],
        extra: authenticated ? { userId: opts.userId, agentName: opts.agentName } : {},
      },
    });

  const client = new Client({ name: opts.agentName, version: "0.0.0" });
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const content = (res.content as { text?: string }[])[0]?.text ?? "";
    let json: any = null;
    try {
      json = JSON.parse(content);
    } catch {
      // plain text result
    }
    return { isError: res.isError === true, text: content, json };
  };

  return {
    client,
    call,
    /** From now on, messages arrive without a verified user. */
    dropAuth: () => {
      authenticated = false;
    },
  };
}

export function checks() {
  let failures = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (!cond) {
      failures++;
      if (detail !== undefined) console.log("      ", JSON.stringify(detail).slice(0, 400));
    }
  };
  return { check, failures: () => failures };
}
