/**
 * CodeMirror language support for `.arch` source, plus helpers that map
 * Archer diagnostics and the spans of components and planes onto editor
 * positions.
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
import { findItem, type ArchDoc, type Diagnostic, type ItemNode, type Scope } from "@archer/lang";

interface ArchState {
  /** Inside a backtick fence of this length (0 = not in a fence). */
  fence: number;
  /** Inside a `"""` multi-line string. */
  triple: boolean;
}

const KEYWORDS = new Set(["arch", "component", "plane", "desc", "src", "shape", "icon", "layout"]);
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

/** Find a component or plane by dotted path. */
export const itemAtPath = (doc: ArchDoc, path: string): ItemNode | undefined =>
  findItem(doc, path.split("."));

/**
 * Dotted path of the innermost component or plane whose span contains
 * `offset`: a component on a plane wins over the plane, a plane inside a
 * plane over the outer one.
 */
export function itemPathAtOffset(doc: ArchDoc, offset: number): string | null {
  const within = (x: ItemNode) => offset >= x.span.start.offset && offset <= x.span.end.offset;
  const size = (x: ItemNode) => x.span.end.offset - x.span.start.offset;
  let best: string | null = null;
  let scope: Scope = doc;
  let prefix = "";
  for (;;) {
    const c = scope.components.find(within);
    if (c) {
      best = prefix === "" ? c.id : `${prefix}.${c.id}`;
      prefix = best;
      scope = { components: c.children, planes: c.planes };
      continue;
    }
    const inner = scope.planes.filter(within).sort((a, b) => size(a) - size(b))[0];
    if (inner) best = prefix === "" ? inner.id : `${prefix}.${inner.id}`;
    return best;
  }
}
