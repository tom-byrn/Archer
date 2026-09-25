import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked, Renderer } from "marked";
import { DOCS_ORIGIN, DOC_PAGES, docMarkdown, sitePart, type DocPage, type DocSources } from "@archer/mcp/docs";
import { createSlugger, type Slugger } from "@archer/mcp/markdown";
import { SITE_URL } from "./site";

// The docs pages render the repository's own docs/*.md files, so the page and
// the file can't disagree. Server-only: it reads from disk when the page is
// rendered (at build time; the pages are static). The same files, as
// markdown for agents, are each page's `.md` (see pageMarkdown).

export { createSlugger, type Slugger };

/** A page's file from the repository's docs/ folder, up to the site-end marker. */
export function readDoc(page: keyof DocSources): string {
  const file = DOC_PAGES.find((p) => p.page === page)!.file!;
  return sitePart(readFileSync(join(process.cwd(), "..", "..", "docs", file), "utf8"));
}

/** Every docs file the site publishes. */
export const readDocs = (): DocSources => ({ language: readDoc("language"), mcp: readDoc("mcp"), cli: readDoc("cli") });

/** A docs page as markdown for agents: what its `.md` address serves. */
export const pageMarkdown = (page: DocPage): Promise<string> =>
  docMarkdown(page, { origin: SITE_URL, sources: readDocs() });

/** Links between the docs files, and the pages that render them. */
const DOC_FILES = new Map(DOC_PAGES.flatMap((p) => (p.file ? [[p.file, p.path] as const] : [])));

/**
 * A link from a docs file as the site serves it: a link to another docs file
 * goes to its page, and the site's own URLs stay on this deployment.
 */
export function siteHref(href: string): string {
  const file = /^([\w-]+\.md)(#.*)?$/.exec(href);
  const page = file && DOC_FILES.get(file[1]!);
  if (page) return page + (file[2] ?? "");
  for (const origin of new Set([DOCS_ORIGIN, SITE_URL])) {
    if (href === origin) return "/";
    if (href.startsWith(`${origin}/`) || href.startsWith(`${origin}#`)) return href.slice(origin.length);
  }
  return href;
}

export interface TocEntry {
  id: string;
  text: string;
}

/**
 * Markdown to HTML for the `.spec` article: headings get ids (and link to
 * themselves), tables scroll sideways on their own, and links go through
 * `siteHref`. Returns the level-2 headings for the page's table of contents.
 * Pass one slugger to every part of a page so ids stay unique across them.
 */
export function renderDocs(markdown: string, slug: Slugger = createSlugger()): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens, this.parser.textRenderer);
        const id = slug(text);
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1 id="${id}">${inner}</h1>\n`;
        if (depth === 2) toc.push({ id, text });
        return `<h${depth} id="${id}"><a href="#${id}">${inner}</a></h${depth}>\n`;
      },
      table(token) {
        return `<div class="spec-table">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
    },
    walkTokens(token) {
      if (token.type === "link") token.href = siteHref(token.href);
    },
  });
  return { html: marked.parse(markdown, { async: false }), toc };
}

/** Inline markdown (a note, a sentence) with the same link handling. */
export function renderInline(markdown: string): string {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === "link") token.href = siteHref(token.href);
    },
  });
  return marked.parseInline(markdown, { async: false });
}
