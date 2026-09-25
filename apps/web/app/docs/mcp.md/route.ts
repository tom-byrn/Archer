import { markdownRoute } from "@/lib/llms";

/**
 * /docs/mcp as markdown, for agents. middleware.ts also answers /docs/mcp
 * itself with it when a request prefers text/markdown. Prerendered.
 */
export const dynamic = "force-static";

export const GET = markdownRoute("mcp");
