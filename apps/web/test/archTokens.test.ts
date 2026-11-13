import { describe, expect, it } from "vitest";
import { StringStream } from "@codemirror/language";
import { EXAMPLES } from "@archer/mcp/examples";
import { SAMPLES } from "../lib/samples";
import { LineStream, archTokenizer, type TokenStream } from "../lib/archTokens";

// The static highlighter (and the mobile app's code view) runs the tokenizer
// on a LineStream; the editor runs it on CodeMirror's StringStream. Both must
// split every line into the same tokens.
const tokens = (source: string, stream: (line: string) => TokenStream) => {
  const state = archTokenizer.startState();
  return source.split("\n").map((line) => {
    const s = stream(line);
    const out: [string, string | null][] = [];
    while (!s.eol()) {
      s.start = s.pos;
      const style = archTokenizer.token(s, state);
      if (s.pos === s.start) s.pos++;
      out.push([line.slice(s.start, s.pos), style]);
    }
    return out;
  });
};

describe("LineStream", () => {
  const sources = [
    ...EXAMPLES.map((e) => e.source),
    ...SAMPLES.map((s) => s.source),
    'arch "Edge" v0.2\n# comment\ncomponent a "A" @x.y { desc """one\ntwo""" }\na <-> b : "l"\nschema json ```{ "a": 1 }```\n',
  ];

  it("tokenizes like CodeMirror's StringStream", () => {
    for (const source of sources)
      expect(tokens(source, (l) => new LineStream(l))).toEqual(
        tokens(source, (l) => new StringStream(l, 2, 2)),
      );
  });
});
