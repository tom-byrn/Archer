/**
 * Static highlighting for `.arch` source: the editor's own tokenizer run line
 * by line, with the `tok-*` classes from globals.css standing in for the
 * editor's highlight style. For server-rendered code blocks (the docs
 * examples), where a CodeMirror instance would be overkill, and the mobile
 * app's code view, which maps the classes to its own colors. No CodeMirror.
 */

import { LineStream, archTokenizer } from "./archTokens";

/** Token name → class; mirrors `archerHighlightStyle` in components/CodeMirror.tsx. */
const CLASS: Record<string, string> = {
  keyword: "tok-kw",
  string: "tok-string",
  typeName: "tok-type",
  operator: "tok-arrow",
  number: "tok-num",
  comment: "tok-comment",
  meta: "tok-fence",
  content: "tok-payload",
  "string.special": "tok-version",
};

export interface HighlightToken {
  text: string;
  className?: string;
}

/** One array of tokens per line (no trailing newline). */
export function highlightArch(source: string): HighlightToken[][] {
  const state = archTokenizer.startState();
  return source
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const tokens: HighlightToken[] = [];
      const stream = new LineStream(line);
      while (!stream.eol()) {
        stream.start = stream.pos;
        const style = archTokenizer.token(stream, state);
        if (stream.pos === stream.start) stream.pos++; // CodeMirror's own guard
        const text = line.slice(stream.start, stream.pos);
        const className = style ? CLASS[style] : undefined;
        const last = tokens[tokens.length - 1];
        if (last && last.className === className) last.text += text;
        else tokens.push({ text, className });
      }
      return tokens;
    });
}
