/**
 * CodeMirror language support for `.arch` source, plus helpers that map
 * Archer diagnostics / component spans onto editor positions.
 *
 * The tokenizer is shared with `lib/highlightArch.ts` (static code blocks).
 */

import {
  StreamLanguage,
  LanguageSupport,
  type StreamParser,
  type StringStream,
} from "@codemirror/language";
import type { Diagnostic as CmDiagnostic } from "@codemirror/lint";
import type { Text } from "@codemirror/state";
import type { ArchDoc, ComponentNode, Diagnostic } from "@archer/lang";

interface ArchState {
  /** Inside a backtick fence of this length (0 = not in a fence). */
  fence: number;
  /** Inside a `"""` multi-line string. */
  triple: boolean;
}

const KEYWORDS = new Set(["arch", "component", "desc", "layout"]);
const TYPE_RE = /^@[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*/;
const ARROW_RE = /^(?:<->|->|--)/;
const VERSION_RE = /^v\d+\.\d+\b/;
const NUMBER_RE = /^-?\d+\b/;
const WORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function token(stream: StringStream, state: ArchState): string | null {
  // Fenced payload body: everything is content until a closing run of equal or greater length.
  if (state.fence > 0) {
    if (stream.sol()) {
      const m = stream.match(new RegExp(`^\\s*\`{${state.fence},}\\s*$`));
      if (m) {
        state.fence = 0;
        return "meta";
      }
    }
    stream.skipToEnd();
    return "content";
  }

  if (state.triple) {
    const rest = stream.string.slice(stream.pos);
    const close = rest.indexOf('"""');
    if (close >= 0) {
      stream.pos += close + 3;
      state.triple = false;
    } else {
      stream.skipToEnd();
    }
    return "string";
  }

  if (stream.eatSpace()) return null;

  if (stream.peek() === "#") {
    stream.skipToEnd();
    return "comment";
  }

  if (stream.match('"""')) {
    const rest = stream.string.slice(stream.pos);
    const close = rest.indexOf('"""');
    if (close >= 0) stream.pos += close + 3;
    else {
      stream.skipToEnd();
      state.triple = true;
    }
    return "string";
  }

  if (stream.peek() === '"') {
    stream.next();
    let escaped = false;
    while (!stream.eol()) {
      const ch = stream.next();
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') break;
    }
    return "string";
  }

  const fence = stream.match(/^`{3,}/) as RegExpMatchArray | null;
  if (fence) {
    // Opener. The rest of the line (content, and a same-line closer if any)
    // is handled by `tokenWithInlineFence`.
    state.fence = fence[0].length;
    return "meta";
  }

  if (stream.match(TYPE_RE)) return "typeName";
  if (stream.match(ARROW_RE)) return "operator";
  if (stream.match(VERSION_RE)) return "string.special";
  if (stream.match(NUMBER_RE)) return "number";

  const word = stream.match(WORD_RE) as RegExpMatchArray | null;
  if (word) return KEYWORDS.has(word[0]) ? "keyword" : null;

  stream.next();
  return null;
}

/**
 * Mid-line fence handling: after an opener, the remainder of that line is
 * content unless it holds a closer of equal or greater length.
 */
function tokenWithInlineFence(stream: StringStream, state: ArchState): string | null {
  if (state.fence > 0 && !stream.sol()) {
    const rest = stream.string.slice(stream.pos);
    const closeMatch = new RegExp(`\`{${state.fence},}`).exec(rest);
    if (closeMatch) {
      if (closeMatch.index === 0) {
        stream.pos += closeMatch[0].length;
        state.fence = 0;
        return "meta";
      }
      stream.pos += closeMatch.index;
      return "content";
    }
    stream.skipToEnd();
    return "content";
  }
  return token(stream, state);
}

/** The tokenizer on its own, so static renderers (`lib/highlightArch.ts`) match the editor. */
export const archStreamParser: StreamParser<ArchState> = {
  name: "arch",
  startState: () => ({ fence: 0, triple: false }),
  copyState: (s) => ({ ...s }),
  token: tokenWithInlineFence,
  languageData: {
    commentTokens: { line: "#" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
};

export const archStreamLanguage = StreamLanguage.define<ArchState>(archStreamParser);

export function archLanguage(): LanguageSupport {
  return new LanguageSupport(archStreamLanguage);
}

/* ------------------------------------------------------------ diagnostics */

/** Map Archer diagnostics to CodeMirror lint diagnostics for `doc`. */
export function archerLinter(diagnostics: Diagnostic[], doc: Text): CmDiagnostic[] {
  const len = doc.length;
  const out: CmDiagnostic[] = [];
  for (const d of diagnostics) {
    let from = Math.min(d.span?.start.offset ?? 0, len);
    let to = Math.min(d.span?.end.offset ?? from, len);
    if (to <= from) {
      const line = doc.lineAt(from);
      to = Math.max(from + 1, line.to);
      to = Math.min(to, len);
      if (to <= from) {
        from = Math.max(0, from - 1);
        to = Math.max(from + 1, Math.min(len, from + 1));
      }
    }
    if (to <= from) continue;
    out.push({
      from,
      to,
      severity: d.severity === "error" ? "error" : "warning",
      message: `${d.code}: ${d.message}`,
    });
  }
  return out;
}

/* --------------------------------------------------------------- spans */

/** Find a component by dotted path. */
export function componentAtPath(doc: ArchDoc, path: string): ComponentNode | undefined {
  const segs = path.split(".");
  let items = doc.components;
  let node: ComponentNode | undefined;
  for (const seg of segs) {
    node = items.find((c) => c.id === seg);
    if (!node) return undefined;
    items = node.children;
  }
  return node;
}

/** Dotted path of the deepest component whose span contains `offset`. */
export function componentPathAtOffset(doc: ArchDoc, offset: number): string | null {
  let best: string | null = null;
  const walk = (items: ComponentNode[], prefix: string) => {
    for (const c of items) {
      const { start, end } = c.span;
      if (offset >= start.offset && offset <= end.offset) {
        best = prefix === "" ? c.id : `${prefix}.${c.id}`;
        walk(c.children, best);
        return;
      }
    }
  };
  walk(doc.components, "");
  return best;
}
