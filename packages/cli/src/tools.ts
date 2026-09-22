import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

/** A hosted tool answered with an error. `data` is its parsed JSON body, when it has one. */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly data: unknown,
  ) {
    super(message);
  }
}

/**
 * Call a tool on the hosted server and parse its JSON result. The shapes the
 * CLI reads are declared in @archer/mcp/contract and checked on the server.
 */
export async function callTool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const content = Array.isArray(res.content) ? (res.content as { type: string; text?: string }[]) : [];
  const text = content.find((c) => c.type === "text")?.text ?? "";
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain-text result
  }
  if (res.isError) {
    const message =
      typeof data === "object" && data !== null && typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : text;
    throw new ToolError(message || `${name} failed`, data);
  }
  return data as T;
}
