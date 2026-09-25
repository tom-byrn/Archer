import { llmsFullTxt, textRoute } from "@/lib/llms";

/** Every docs page's markdown in one file, for agents that want it all at once. */
export const dynamic = "force-static";

export const GET = textRoute(llmsFullTxt);
