import { DOC_PAGES, type DocPage } from "./docPages";
import { EXAMPLES } from "./examples";
import { createSlugger, fenced, headings, mapLinks } from "./markdown";

export { DOC_PAGES, sitePart, type DocPage, type DocPageInfo } from "./docPages";

/**
 * Archer's docs for agents: each page of the docs site as one markdown
 * document, the same text on the web (the page's address plus `.md`, and
 * /llms-full.txt) and over MCP (get_docs, archer://docs/<page>). The language
 * reference, the MCP server and the CLI are the docs/ files the site renders;
 * the examples and the MCP server's tool reference are built from the same
 * data as their pages. Links are absolute, and links between the docs go to
 * the other pages' markdown.
 */

/** The docs files, as the site publishes them (see sitePart): the MCP server's bundled copies, or the site's own read of docs/. */
export type DocSources = Record<"language" | "mcp" | "cli", string>;

/** The origin the docs files link to: they are read on GitHub and npm too. */
export const DOCS_ORIGIN = "https://archer.tombyrne.dev";

/** Where docs/mcp.md puts the generated tool reference. Between the markers is what GitHub shows instead. */
export const TOOL_REFERENCE_SLOT = /<!-- tools:start -->[\s\S]*?<!-- tools:end -->/;

const pageInfo = (page: DocPage) => DOC_PAGES.find((p) => p.page === page)!;

/**
 * A link in the docs, for an agent reading them as markdown on `origin`: a
 * link to another docs file or to a docs page goes to that page's markdown,
 * other links into the site move to `origin`, and in-page and outside links
 * stay as they are.
 */
export function agentHref(href: string, origin: string): string {
  const file = /^([\w-]+\.md)(#.*)?$/.exec(href);
  if (file) {
    const page = DOC_PAGES.find((p) => p.file === file[1]);
    return page ? `${origin}${page.path}.md${file[2] ?? ""}` : href;
  }
  for (const base of new Set([DOCS_ORIGIN, origin])) {
    if (href !== base && !href.startsWith(`${base}/`) && !href.startsWith(`${base}#`)) continue;
    const rest = href.slice(base.length);
    const hash = rest.includes("#") ? rest.slice(rest.indexOf("#")) : "";
    const path = rest.slice(0, rest.length - hash.length) || "/";
    const page = DOC_PAGES.find((p) => p.path === path);
    return `${origin}${page ? `${page.path}.md` : path}${hash}`;
  }
  return href;
}

/** /language/examples as markdown: every example with its source. */
function examplesMarkdown(origin: string): string {
  const title = "Archer examples";
  const slug = createSlugger();
  slug(title);
  const base = `${origin}${pageInfo("examples").path}`;
  return [
    `# ${title}`,
    "Each example is a complete `.arch` document that validates clean, in the canonical form the app saves. A document without a `layout` block is how agents write Archer: the app lays it out on its own. One that ends in a `layout` block was arranged by hand on the canvas; that block is presentation, so leave it out of documents you write.",
    "Every example has a diagram, drawn by the same renderer as the app's share images, and a sandbox that opens it in the editor with no account (nothing there is saved). Over MCP, `list_examples` and `get_example` return the same examples.",
    EXAMPLES.map((e, i) => `${i + 1}. [${e.title}](#${slug(e.title)}): ${e.features.join(", ")}`).join("\n"),
    ...EXAMPLES.flatMap((e) => [
      `## ${e.title}`,
      e.summary,
      [
        `- Shows: ${e.features.join(", ")}`,
        `- Diagram: [light](${base}/${e.slug}/light.svg), [dark](${base}/${e.slug}/dark.svg)`,
        `- Sandbox: ${origin}/sandbox/${e.slug}`,
      ].join("\n"),
      fenced(e.source, "arch"),
    ]),
  ].join("\n\n");
}

/** docs/mcp.md with the tool reference, generated from the server, where the file marks it. */
async function mcpMarkdown(file: string): Promise<string> {
  const [before, after] = file.split(TOOL_REFERENCE_SLOT);
  if (after === undefined) throw new Error("docs/mcp.md has lost its <!-- tools:start --> … <!-- tools:end --> markers.");
  // Loaded when needed: the reference describes the server, and the server serves these docs.
  const [{ describeServer }, { buildReference, referenceMarkdown }] = await Promise.all([
    import("./reference"),
    import("./toolReference"),
  ]);
  // Number the file's headings first, so the reference's ids are the ones GitHub gives them after those.
  const slug = createSlugger();
  for (const heading of headings(before!)) slug(heading);
  const reference = referenceMarkdown(buildReference(await describeServer(), slug));
  return `${before!.trimEnd()}\n\n${reference}\n\n${after.trimStart()}`;
}

/** A docs page as markdown, with its links for `origin`: what `<origin><path>.md` serves and get_docs returns. */
export async function docMarkdown(
  page: DocPage,
  { origin, sources }: { origin: string; sources: DocSources },
): Promise<string> {
  const at = origin.replace(/\/$/, "");
  const markdown =
    page === "examples" ? examplesMarkdown(at) : page === "mcp" ? await mcpMarkdown(sources.mcp) : sources[page];
  return `${mapLinks(markdown, (href) => agentHref(href, at)).trimEnd()}\n`;
}
