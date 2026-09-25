import { DOC_PAGES } from "@archer/mcp/docPages";

// Content negotiation for agents: a request that prefers markdown gets a
// docs page's markdown at the page's own address (middleware.ts rewrites it to
// the `.md` route). Browsers never ask for markdown, so they get the page.
// Edge-safe: the middleware imports this.

/** Addresses with a markdown twin: each docs page, and the landing page's summary for agents. */
const TWINS = new Map<string, string>([
  ...DOC_PAGES.map((p) => [p.path, `${p.path}.md`] as const),
  ["/", "/llms.txt"],
  ["/welcome", "/llms.txt"],
]);

/** Where the markdown for `pathname` is, if it has one. */
export const markdownTwin = (pathname: string): string | null => TWINS.get(pathname) ?? null;

/**
 * Whether an Accept header prefers markdown to HTML: it names text/markdown,
 * and ranks it at least as high as HTML, whether HTML is named or covered by
 * a wildcard.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const quality = new Map<string, number>();
  for (const range of accept.toLowerCase().split(",")) {
    const [type = "", ...params] = range.split(";").map((s) => s.trim());
    const q = params.find((p) => p.startsWith("q="));
    const value = q === undefined ? 1 : Number(q.slice(2));
    if (type !== "" && Number.isFinite(value)) quality.set(type, Math.max(value, quality.get(type) ?? 0));
  }
  const markdown = quality.get("text/markdown") ?? 0;
  const html = quality.get("text/html") ?? quality.get("text/*") ?? quality.get("*/*") ?? 0;
  return markdown > 0 && markdown >= html;
}
