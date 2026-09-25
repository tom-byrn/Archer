/**
 * Small markdown helpers for the docs, shared by the site (which renders the
 * docs as HTML) and docs.ts (which serves them to agents as markdown).
 */

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

interface Segment {
  code: boolean;
  text: string;
}

/**
 * Markdown cut into fenced code blocks and the text between them. Fences
 * follow CommonMark: up to three spaces of indent, closed by a run of the same
 * character at least as long, so an indented fence inside a block (as in the
 * language reference's payload examples) stays code.
 */
function segments(markdown: string): Segment[] {
  const out: Segment[] = [];
  let open: string | null = null;
  let text = "";
  const flush = (code: boolean) => {
    if (text !== "") out.push({ code, text });
    text = "";
  };
  for (const line of markdown.split(/(?<=\n)/)) {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r?\n$/, ""));
    if (open === null) {
      // A backtick fence's info string can't contain a backtick.
      if (fence && !(fence[1]![0] === "`" && fence[2]!.includes("`"))) {
        flush(false);
        open = fence[1]!;
      }
      text += line;
    } else {
      text += line;
      if (fence && fence[1]![0] === open[0] && fence[1]!.length >= open.length && fence[2]!.trim() === "") {
        flush(true);
        open = null;
      }
    }
  }
  flush(open !== null);
  return out;
}

/** Every inline link's target outside code, passed through `map`. */
export function mapLinks(markdown: string, map: (href: string) => string): string {
  return segments(markdown)
    .map(({ code, text }) =>
      code
        ? text
        : // A code span (left alone) or a link's `](target)`.
          text.replace(/(`+)(?:(?!\n\n)[\s\S])*?\1|\]\(([^()\s]+)\)/g, (match, _ticks, href?: string) =>
            href === undefined ? match : `](${map(href)})`,
          ),
    )
    .join("");
}

/** The text of each ATX heading outside code, in order. */
export function headings(markdown: string): string[] {
  return segments(markdown).flatMap(({ code, text }) =>
    code ? [] : [...text.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm)].map((m) => m[1]!),
  );
}

/** A fenced code block, its fence longer than any run of backticks in the code. */
export function fenced(code: string, lang = ""): string {
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${code.replace(/\n$/, "")}\n${fence}`;
}
