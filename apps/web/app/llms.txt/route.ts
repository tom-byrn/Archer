import { llmsTxt, textRoute } from "@/lib/llms";

/** The index for agents (https://llmstxt.org): what Archer is, and the docs pages' markdown. */
export const dynamic = "force-static";

export const GET = textRoute(llmsTxt);
