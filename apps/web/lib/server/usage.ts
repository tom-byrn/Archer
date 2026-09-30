import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * Tool-call recording for the admin dashboard, used by the /mcp route. All of
 * it is best-effort: nothing here may fail or slow down an agent's request.
 */

interface JsonRpcCall {
  id: string | number | null;
  tool: string;
}

/** The `tools/call` requests in an MCP request body (a message or a batch). */
export async function toolCallsIn(req: Request): Promise<JsonRpcCall[]> {
  try {
    const body: unknown = await req.json();
    const messages = Array.isArray(body) ? body : [body];
    return messages.flatMap((m) => {
      if (!m || typeof m !== "object") return [];
      const { method, params, id } = m as { method?: unknown; params?: { name?: unknown }; id?: unknown };
      if (method !== "tools/call" || typeof params?.name !== "string") return [];
      return [{ id: typeof id === "string" || typeof id === "number" ? id : null, tool: params.name }];
    });
  } catch {
    return [];
  }
}

/**
 * Which of the calls' responses were errors: JSON-RPC errors or tool results
 * with `isError`. Reads a JSON body or an SSE stream of JSON messages.
 */
export function failedIds(status: number, text: string): Set<string | number | null> | "all" {
  if (status >= 400) return "all";
  const failed = new Set<string | number | null>();
  const chunks = text.trimStart().startsWith("{") || text.trimStart().startsWith("[")
    ? [text]
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5));
  for (const chunk of chunks) {
    try {
      const parsed: unknown = JSON.parse(chunk);
      for (const m of Array.isArray(parsed) ? parsed : [parsed]) {
        const msg = m as { id?: string | number | null; error?: unknown; result?: { isError?: boolean } };
        if (msg.error || msg.result?.isError) failed.add(msg.id ?? null);
      }
    } catch {
      // not JSON; ignore
    }
  }
  return failed;
}

let client: ConvexHttpClient | null = null;

export async function recordToolCalls({
  userId,
  agent,
  calls,
  ms,
  response,
}: {
  userId: string;
  agent: string;
  calls: JsonRpcCall[];
  ms: number;
  response: Response;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  const secret = process.env.ARCHER_SERVICE_SECRET;
  if (!url || !secret) return;
  try {
    const failed = failedIds(response.status, await response.text());
    client ??= new ConvexHttpClient(url);
    const apiKey = `svc_${secret}.${userId}`;
    await Promise.all(
      calls.map((c) =>
        client!.mutation(api.usage.recordToolCall, {
          apiKey,
          tool: c.tool,
          agent,
          ok: failed !== "all" && !failed.has(c.id),
          ms: Math.round(ms / calls.length),
        }),
      ),
    );
  } catch {
    // Usage is best-effort.
  }
}
