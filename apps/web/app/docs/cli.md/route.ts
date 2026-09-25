import { markdownRoute } from "@/lib/llms";

/**
 * /docs/cli as markdown, for agents. middleware.ts also answers /docs/cli
 * itself with it when a request prefers text/markdown. Prerendered.
 */
export const dynamic = "force-static";

export const GET = markdownRoute("cli");
