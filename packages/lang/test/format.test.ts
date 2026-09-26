import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileForAgent, format, parse } from "../src/index";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

/** Deep-copy an AST value with all spans removed, for structural comparison. */
const stripSpans = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, v) => (key === "span" ? undefined : v)),
  );

describe("format", () => {
  it("is idempotent: format(parse(format(x))) === format(x)", () => {
    const once = format(parse(fixture("acme.arch")).doc);
    const twice = format(parse(once).doc);
    expect(twice).toBe(once);
  });

  it("round-trips the AST: parse(format(doc)) is structurally equal to doc (modulo ordering)", () => {
    const original = parse(fixture("acme.arch")).doc;
    const reparsed = parse(format(original)).doc;
    // Canonical form sorts connections/layout, so compare sorted projections.
    expect(stripSpans(reparsed.components)).toEqual(stripSpans(original.components));
    const key = (c: { source: string[]; target: string[] }) =>
      `${c.source.join(".")}>${c.target.join(".")}`;
    expect(reparsed.connections.map(key).sort()).toEqual(
      original.connections.map(key).sort(),
    );
    expect(stripSpans(reparsed.connections)).toEqual(
      stripSpans(
        [...original.connections].sort((a, b) => (key(a) < key(b) ? -1 : 1)),
      ),
    );
    expect(reparsed.layout).toHaveLength(original.layout.length);
    expect(reparsed.title).toBe(original.title);
  });

  it("reparse produces zero diagnostics", () => {
    const once = format(parse(fixture("acme.arch")).doc);
    expect(parse(once).diagnostics).toEqual([]);
  });

  it("formats a minimal component inline (no braces)", () => {
    const out = format(parse('arch "X" v0.1\ncomponent a "A" @t.x').doc);
    expect(out).toBe('arch "X" v0.1\n\ncomponent a "A" @t.x\n');
  });

  it("escapes quotes and newlines in strings", () => {
    const doc = parse('arch "X" v0.1\ncomponent a').doc;
    doc.title = 'He said "hi"\nbye';
    const out = format(doc);
    expect(out.startsWith('arch "He said \\"hi\\"\\nbye" v0.1')).toBe(true);
    expect(parse(out).doc.title).toBe('He said "hi"\nbye');
  });

  it("multiline descriptions become triple-quoted and round-trip", () => {
    const doc = parse('arch "X" v0.1\ncomponent a').doc;
    doc.components[0]!.desc = "line one\n  indented two";
    const out = format(doc);
    expect(out).toContain('desc """');
    expect(parse(out).doc.components[0]!.desc).toBe("line one\n  indented two");
  });

  it("connection payloads format as a body, sort with their line, and round-trip", () => {
    const src =
      'arch "X" v0.1\ncomponent a\ncomponent b\ncomponent c\n' +
      "b -> c\n" +
      'a -> b @queue : "orders" {\n  message json ```\n  {"id": "uuid"}\n  ```\n}\n' +
      "a -> c\n";
    const out = format(parse(src).doc);
    expect(out).toBe(
      'arch "X" v0.1\n\ncomponent a\n\ncomponent b\n\ncomponent c\n\n' +
        'a -> b @queue : "orders" {\n  message json ```\n  {"id": "uuid"}\n  ```\n}\n\n' +
        "a -> c\nb -> c\n",
    );
    expect(format(parse(out).doc)).toBe(out);
    expect(parse(out).diagnostics).toEqual([]);
    expect(parse(out).doc.connections[0]!.payloads[0]!.content).toBe('{"id": "uuid"}');
  });

  it("payload content containing ``` gets a longer fence and round-trips", () => {
    const doc = parse('arch "X" v0.1\ncomponent a').doc;
    doc.components[0]!.payloads.push({
      kind: "payload",
      name: "notes",
      format: "markdown",
      content: "use ``` fences",
      span: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
    });
    const out = format(doc);
    const reparsed = parse(out);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.doc.components[0]!.payloads[0]!.content).toBe("use ``` fences");
  });

  it("sorts connections deterministically", () => {
    const src =
      'arch "X" v0.1\ncomponent w\ncomponent a\nw -> a\na -> w\nw -> a @http';
    const out = format(parse(src).doc);
    const lines = out.trim().split("\n");
    expect(lines.slice(-3)).toEqual(["a -> w", "w -> a", "w -> a @http"]);
  });
});

describe("compileForAgent", () => {
  it("keeps the layout block and prepends the preamble", () => {
    const doc = parse(fixture("acme.arch")).doc;
    const out = compileForAgent(doc);
    expect(out).toContain("Archer architecture document");
    expect(out).toContain('arch "Acme SaaS" v0.1');
    // Positions the author set come through unchanged.
    const layout = format(doc).slice(format(doc).indexOf("layout {"));
    expect(layout).toContain("at: [");
    expect(out.endsWith(layout)).toBe(true);
  });

  it("output parses cleanly (preamble is all comments)", () => {
    const out = compileForAgent(parse(fixture("acme.arch")).doc);
    const { doc, diagnostics } = parse(out);
    expect(diagnostics).toEqual([]);
    expect(doc.components).toHaveLength(5);
  });

  it("places every component, even one the source never positioned", () => {
    const out = compileForAgent(
      parse('arch "X" v0.1\ncomponent api {\n  component db\n}\ncomponent web\nweb -> api.db').doc,
    );
    const placed = parse(out).doc.layout.map((e) => e.path.join("."));
    expect(placed.sort()).toEqual(["api", "api.db", "web"]);
  });
});
