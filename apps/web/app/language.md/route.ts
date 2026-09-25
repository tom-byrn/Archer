import { markdownRoute } from "@/lib/llms";

/**
 * /language as markdown, for agents. middleware.ts also answers /language
 * itself with it when a request prefers text/markdown. Prerendered.
 */
export const dynamic = "force-static";

export const GET = markdownRoute("language");
