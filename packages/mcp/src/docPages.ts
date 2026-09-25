/**
 * The docs site's pages, as agents get them. docs.ts builds each page as one
 * markdown document: on the web at the page's path plus `.md` (and at the
 * path itself, for requests that accept text/markdown), all together in
 * /llms-full.txt, and over MCP through get_docs and archer://docs/<page>.
 * This module imports nothing, so the web app's middleware can read it too.
 */

export type DocPage = "language" | "examples" | "mcp" | "cli";

export interface DocPageInfo {
  page: DocPage;
  /** Where the site shows it. Its markdown is this plus `.md`. */
  path: string;
  /** The file in the repository's docs/ folder it publishes. The examples come from examples.ts. */
  file?: string;
  title: string;
  /** What it covers, in a sentence: for llms.txt, get_docs and the resource list. */
  summary: string;
}

export const DOC_PAGES: readonly DocPageInfo[] = [
  {
    page: "language",
    path: "/language",
    file: "language-spec.md",
    title: "Language reference",
    summary:
      "The `.arch` language: file structure, components and nesting, payloads, types, connections, the `layout` block, the validation codes and the grammar.",
  },
  {
    page: "examples",
    path: "/language/examples",
    title: "Examples",
    summary:
      "Complete documents that validate clean, from the basics up to a whole product, each with its source and its diagram.",
  },
  {
    page: "mcp",
    path: "/docs/mcp",
    file: "mcp.md",
    title: "MCP server",
    summary:
      "Connecting an agent to the hosted MCP server, sign-in and workspaces, and every tool with an example call and its result.",
  },
  {
    page: "cli",
    path: "/docs/cli",
    file: "cli.md",
    title: "CLI",
    summary:
      "The `archer` command (npm: archerctl): check and format `.arch` files in CI, keep a file in sync with a project, and run the MCP server over stdio.",
  },
];

/** The site publishes a docs file up to this marker; what follows is for contributors. */
export const SITE_END = "<!-- site:end";

/** The part of a docs file that the site publishes. */
export function sitePart(text: string): string {
  const end = text.indexOf(SITE_END);
  return end === -1 ? text : text.slice(0, end);
}
