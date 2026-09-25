import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked, Renderer } from "marked";
import { SITE_URL } from "./site";

// The docs pages under /docs render the repository's own docs/*.md files, so
// the page and the file can't disagree. Server-only: it reads from disk when
// the page is rendered (at build time; the pages are static).

export type DocName = "mcp" | "cli";

/** The site renders a docs file up to this marker; what follows is for contributors. */
const SITE_END = "<!-- site:end";

/** A file from the repository's docs/ folder, up to the site-end marker. */
export function readDoc(name: DocName): string {
  const text = readFileSync(join(process.cwd(), "..", "..", "docs", `${name}.md`), "utf8");
  const end = text.indexOf(SITE_END);
  return end === -1 ? text : text.slice(0, end);
}

/** The origin the docs files use for links to the site (they're read on GitHub and npm too). */
const DOCS_ORIGIN = "https://archer.tombyrne.dev";

/** Links between the docs files, and the pages that render them. */
const DOC_PAGES: Record<string, string> = {
  "mcp.md": "/docs/mcp",
  "cli.md": "/docs/cli",
  "language-spec.md": "/language",
};

/**
 * A link from a docs file as the site serves it: a link to another docs file
 * goes to its page, and the site's own URLs stay on this deployment.
 */
export function siteHref(href: string): string {
  const file = /^([\w-]+\.md)(#.*)?$/.exec(href);
  if (file && DOC_PAGES[file[1]!]) return DOC_PAGES[file[1]!]! + (file[2] ?? "");
  for (const origin of new Set([DOCS_ORIGIN, SITE_URL])) {
    if (href === origin) return "/";
    if (href.startsWith(`${origin}/`) || href.startsWith(`${origin}#`)) return href.slice(origin.length);
  }
  return href;
}

export type Slugger = (text: string) => string;

/**
 * Heading ids the way GitHub makes them (github-slugger): lowercase, drop
 * punctuation and symbols, spaces to hyphens, and number repeats. So a link
 * like `cli.md#archer-push` works on GitHub and on the site alike.
 */
export function createSlugger(): Slugger {
  const seen = new Map<string, number>();
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
      .replace(/ /g, "-");
    let slug = base;
    while (seen.has(slug)) {
      const n = seen.get(base)! + 1;
      seen.set(base, n);
      slug = `${base}-${n}`;
    }
    seen.set(slug, 0);
    return slug;
  };
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
