import type { Diagnostic, Pos, Span } from "./types";

export type TokenType =
  | "ident"
  | "string"
  | "triple-string"
  | "version"
  | "number"
  | "fence"
  | "at"
  | "dot"
  | "colon"
  | "comma"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "arrow"
  | "eof";

export interface Token {
  type: TokenType;
  /** For ident/string/version/fence: the (unquoted, dedented) value. For arrow: "->" | "<->" | "--". */
  value: string;
  span: Span;
}

const isIdentStart = (c: string) => c >= "a" && c <= "z";
const isIdentChar = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_";
const isDigit = (c: string) => c >= "0" && c <= "9";

/** Remove common leading whitespace, and one leading/trailing blank line. */
export function dedent(raw: string): string {
  let lines = raw.split("\n");
  if (lines.length > 0 && lines[0]!.trim() === "") lines = lines.slice(1);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "")
    lines = lines.slice(0, -1);
  let indent: number | null = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = /^[ \t]*/.exec(line)![0].length;
    indent = indent === null ? m : Math.min(indent, m);
  }
  const cut = indent ?? 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

export function lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0;
  let line = 1;
  let col = 1;

  const pos = (): Pos => ({ line, col, offset });
  const peek = (ahead = 0) => source[offset + ahead] ?? "";
  const advance = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (source[offset] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      offset++;
    }
  };
  const push = (type: TokenType, value: string, start: Pos) =>
    tokens.push({ type, value, span: { start, end: pos() } });

  while (offset < source.length) {
    const c = peek();

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance();
      continue;
    }
    if (c === "#") {
      while (offset < source.length && peek() !== "\n") advance();
      continue;
    }

    const start = pos();

    // Fences: 3+ backticks, content runs to the next run of the same length.
    if (c === "`" && peek(1) === "`" && peek(2) === "`") {
      let len = 0;
      while (peek(len) === "`") len++;
      advance(len);
      const fenceMark = "`".repeat(len);
      const close = source.indexOf(fenceMark, offset);
      if (close === -1) {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: "Unterminated payload fence.",
          span: { start, end: pos() },
        });
        advance(source.length - offset);
        push("fence", "", start);
        break;
      }
      const raw = source.slice(offset, close);
      advance(close - offset + len);
      push("fence", dedent(raw), start);
      continue;
    }

    // Strings.
    if (c === '"') {
      const triple = peek(1) === '"' && peek(2) === '"';
      if (triple) {
        advance(3);
        const close = source.indexOf('"""', offset);
        if (close === -1) {
          diagnostics.push({
            code: "E001",
            severity: "error",
            message: "Unterminated triple-quoted string.",
            span: { start, end: pos() },
          });
          advance(source.length - offset);
          push("triple-string", "", start);
          break;
        }
        const raw = source.slice(offset, close);
        advance(close - offset + 3);
        push("triple-string", dedent(raw), start);
        continue;
      }
      advance(1);
      let value = "";
      let closed = false;
      while (offset < source.length) {
        const ch = peek();
        if (ch === "\n") break;
        if (ch === "\\") {
          const next = peek(1);
          if (next === '"' || next === "\\") {
            value += next;
            advance(2);
            continue;
          }
          if (next === "n") {
            value += "\n";
            advance(2);
            continue;
          }
          value += ch;
          advance(1);
          continue;
        }
        if (ch === '"') {
          advance(1);
          closed = true;
          break;
        }
        value += ch;
        advance(1);
      }
      if (!closed) {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: "Unterminated string.",
          span: { start, end: pos() },
        });
      }
      push("string", value, start);
      continue;
    }

    // Arrows before numbers so `--` and `->` win over `-5`.
    if (c === "<" && peek(1) === "-" && peek(2) === ">") {
      advance(3);
      push("arrow", "<->", start);
      continue;
    }
    if (c === "-" && peek(1) === ">") {
      advance(2);
      push("arrow", "->", start);
      continue;
    }
    if (c === "-" && peek(1) === "-") {
      advance(2);
      push("arrow", "--", start);
      continue;
    }
    if (c === "-" && isDigit(peek(1))) {
      advance(1);
      let num = "-";
      while (isDigit(peek())) {
        num += peek();
        advance();
      }
      push("number", num, start);
      continue;
    }
    if (isDigit(c)) {
      let num = "";
      while (isDigit(peek())) {
        num += peek();
        advance();
      }
      push("number", num, start);
      continue;
    }

    // Version literal (`v0.1`) before identifiers.
    if (c === "v" && isDigit(peek(1))) {
      const m = /^v(\d+\.\d+)/.exec(source.slice(offset));
      if (m) {
        advance(m[0].length);
        push("version", m[1]!, start);
        continue;
      }
    }

    if (isIdentStart(c)) {
      let id = "";
      while (isIdentChar(peek())) {
        id += peek();
        advance();
      }
      push("ident", id, start);
      continue;
    }

    const single: Record<string, TokenType> = {
      "@": "at",
      ".": "dot",
      ":": "colon",
      ",": "comma",
      "{": "lbrace",
      "}": "rbrace",
      "[": "lbracket",
      "]": "rbracket",
    };
    const t = single[c];
    if (t) {
      advance(1);
      push(t, c, start);
      continue;
    }

    diagnostics.push({
      code: "E001",
      severity: "error",
      message: `Unexpected character ${JSON.stringify(c)}.`,
      span: { start, end: { ...start, col: start.col + 1, offset: start.offset + 1 } },
    });
    advance(1);
  }

  const end = pos();
  tokens.push({ type: "eof", value: "", span: { start: end, end } });
  return { tokens, diagnostics };
}
