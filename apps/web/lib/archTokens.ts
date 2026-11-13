/**
 * The `.arch` tokenizer, without CodeMirror: the editor's language
 * (`lib/archLanguage.ts`) and the static highlighter (`lib/highlightArch.ts`,
 * also used by the mobile app) both run it, so every code view colors the
 * same text the same way.
 */

/**
 * The part of CodeMirror's `StringStream` the tokenizer uses: the editor
 * passes its own stream, static highlighting a `LineStream`.
 */
export interface TokenStream {
  pos: number;
  start: number;
  string: string;
  sol(): boolean;
  eol(): boolean;
  peek(): string | undefined;
  next(): string | void;
  eatSpace(): boolean;
  skipToEnd(): void;
  match(pattern: string | RegExp, consume?: boolean, caseInsensitive?: boolean): boolean | RegExpMatchArray | null;
}

export interface ArchState {
  /** Inside a backtick fence of this length (0 = not in a fence). */
  fence: number;
  /** Inside a `"""` multi-line string. */
  triple: boolean;
}

const KEYWORDS = new Set(["arch", "component", "plane", "desc", "src", "shape", "icon", "color", "layout"]);
const TYPE_RE = /^@[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*/;
const ARROW_RE = /^(?:<->|->|--)/;
const VERSION_RE = /^v\d+\.\d+\b/;
const NUMBER_RE = /^-?\d+\b/;
const WORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function token(stream: TokenStream, state: ArchState): string | null {
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
function tokenWithInlineFence(stream: TokenStream, state: ArchState): string | null {
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

/** The tokenizer's start state, its copy and its step, for `StreamParser`s and static highlighting. */
export const archTokenizer = {
  startState: (): ArchState => ({ fence: 0, triple: false }),
  copyState: (s: ArchState): ArchState => ({ ...s }),
  token: tokenWithInlineFence,
};

/** One line of source as a `TokenStream`, with `StringStream`'s semantics. */
export class LineStream implements TokenStream {
  pos = 0;
  start = 0;
  constructor(readonly string: string) {}
  sol(): boolean {
    return this.pos === 0;
  }
  eol(): boolean {
    return this.pos >= this.string.length;
  }
  peek(): string | undefined {
    return this.string.charAt(this.pos) || undefined;
  }
  next(): string | void {
    if (this.pos < this.string.length) return this.string.charAt(this.pos++);
  }
  eatSpace(): boolean {
    const start = this.pos;
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
    return this.pos > start;
  }
  skipToEnd(): void {
    this.pos = this.string.length;
  }
  match(pattern: string | RegExp, consume = true, caseInsensitive = false): boolean | RegExpMatchArray | null {
    if (typeof pattern === "string") {
      const cased = (s: string) => (caseInsensitive ? s.toLowerCase() : s);
      if (cased(this.string.substr(this.pos, pattern.length)) !== cased(pattern)) return null;
      if (consume) this.pos += pattern.length;
      return true;
    }
    const m = this.string.slice(this.pos).match(pattern);
    if (m && m.index! > 0) return null;
    if (m && consume) this.pos += m[0].length;
    return m;
  }
}
