import { DOC_PAGES, type DocPage, type DocPageInfo } from "@archer/mcp/docs";
import { pageMarkdown } from "./docs";
import { SITE_URL } from "./site";

// The docs for agents that come from the web: each docs page's markdown at
// its address plus `.md`, an index at /llms.txt (https://llmstxt.org) and
// everything in one file at /llms-full.txt. All static, and built from the
// same markdown the MCP server's get_docs returns.

/** What Archer is, for an agent that has never heard of it. */
const SUMMARY =
  "Archer is an architecture canvas that compiles to and from an agent-readable language: every diagram is one `.arch` text document. People design on the canvas; agents read and write the same documents through Archer's MCP server, or write `.arch` files next to the code they describe.";

/** The index's opening: the summary, then how an agent gets at everything. */
const INTRO = [
  "# Archer",
  `> ${SUMMARY}`,
  "Every page linked below is markdown. Each docs page is also at its address without `.md`, and that address answers requests that accept `text/markdown` with the same markdown.",
  [
    `- MCP server: \`${SITE_URL}/mcp\` (Streamable HTTP, OAuth sign-in with GitHub; no API keys). Its \`get_docs\` tool and \`archer://docs/<page>\` resources serve these same pages.`,
    "- CLI: `npx archerctl check` validates `.arch` files without an account, and `npx archerctl init` starts one.",
    "- To write Archer, read the language reference first, then the examples.",
  ].join("\n"),
].join("\n\n");

const pageLink = (p: DocPageInfo) => `[${p.title}](${SITE_URL}${p.path}.md)`;

/** /llms.txt: what Archer is, and the docs pages. */
export const llmsTxt = (): string =>
  [
    INTRO,
    "## Docs",
    DOC_PAGES.map((p) => `- ${pageLink(p)}: ${p.summary}`).join("\n"),
    "## Optional",
    `- [All the docs in one file](${SITE_URL}/llms-full.txt): every page above, one after another.`,
  ].join("\n\n") + "\n";

/** /llms-full.txt: the index's opening, then every docs page in full. */
export async function llmsFullTxt(): Promise<string> {
  const pages = await Promise.all(DOC_PAGES.map((p) => pageMarkdown(p.page)));
  const contents = DOC_PAGES.map((p, i) => `${i + 1}. ${pageLink(p)}`).join("\n");
  const head = `${INTRO}\n\nThis file holds every docs page in full, in this order:\n\n${contents}`;
  return [head, ...pages.map((md) => md.trimEnd())].join("\n\n---\n\n") + "\n";
}

/** A static route answering with a docs page's markdown. */
export const markdownRoute = (page: DocPage) => async () =>
  new Response(await pageMarkdown(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The page is the canonical copy, for search engines.
      Link: `<${SITE_URL}${DOC_PAGES.find((p) => p.page === page)!.path}>; rel="canonical"`,
    },
  });

/** A static route answering with plain text: /llms.txt and /llms-full.txt. */
export const textRoute = (text: () => string | Promise<string>) => async () =>
  new Response(await text(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
