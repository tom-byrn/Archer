import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  checkPayload,
  parse,
  type ArchDoc,
  type ComponentNode,
  type PayloadNode,
} from "@archer/lang";
import { EXAMPLES } from "@archer/mcp/examples";
import { Markdown, MarkdownTable, parseTable } from "../components/Markdown";
import { SAMPLES } from "../lib/samples";

// Markdown and table payloads read rendered in the inspector and on share
// links, from sources anyone with edit access wrote.
const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe("markdown payloads", () => {
  it("render headings, emphasis, lists, code and tables", () => {
    const out = html(
      [
        "# Title",
        "",
        "Some **bold**, *em* and `code`.",
        "",
        "- [x] done",
        "- [ ] to do",
        "",
        "3. three",
        "",
        "```",
        "a < b",
        "```",
        "",
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
      ].join("\n"),
    );
    expect(out).toContain(">Title</h1>");
    expect(out).toContain(">bold</strong>");
    expect(out).toContain("<em>em</em>");
    expect(out).toContain(">code</code>");
    expect(out).toContain('aria-label="Done"');
    expect(out).toContain('aria-label="Not done"');
    expect(out).toContain('<ol start="3"');
    expect(out).toContain("<code>a &lt; b</code>");
    expect(out).toContain(">a</th>");
    expect(out).toContain(">2</td>");
  });

  it("show HTML as text instead of rendering it", () => {
    const out = html('<script>alert(1)</script>\n\nHi <img src=x onerror="alert(1)"> <b>there</b>');
    expect(out).not.toMatch(/<(script|img|b)[\s>]/);
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;b&gt;there&lt;/b&gt;");
  });

  it("link only to the web or email, in a new tab", () => {
    const out = html(
      "[web](https://example.com) [mail](mailto:a@b.c) [js](javascript:alert(1)) [rel](./x) <https://auto.example>",
    );
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noreferrer"');
    expect(out).toContain('href="mailto:a@b.c"');
    expect(out).toContain('href="https://auto.example"');
    // The other two keep their text, unlinked.
    expect(out).toContain("</a> js rel <a");
    expect(out).not.toContain("javascript:");
  });

  it("show images as links to them, never loading them", () => {
    const out = html("![diagram](https://example.com/d.png) ![local](d.png)");
    expect(out).not.toContain("<img");
    expect(out).toContain('href="https://example.com/d.png"');
    expect(out).toContain(">diagram</a> local</p>");
  });

  it("decode character references, except in code", () => {
    const out = html("AT&amp;T &rarr; &#169; `&amp;`");
    expect(out).toContain("AT&amp;T → ©");
    expect(out).toContain(">&amp;amp;</code>");
  });

  it("hide comments and break lines at <br>", () => {
    const out = html("<!-- note -->\n\none<br>two");
    expect(out).not.toContain("note");
    expect(out).toContain("one<br/>two");
  });

  it("say when there's nothing to read", () => {
    expect(html("  \n")).toContain("Empty");
  });
});

describe("table payloads", () => {
  it("parse as the table check reads them", () => {
    const source = "  | a | b |\n\n  | --- | :-: |\n  | `x` | y |\n";
    expect(checkPayload("table", source)).toBeNull();
    const table = parseTable(source);
    expect(table?.header.map((c) => c.text)).toEqual(["a", "b"]);
    expect(table?.align).toEqual([null, "center"]);
    expect(table?.rows).toHaveLength(1);
    const out = renderToStaticMarkup(createElement(MarkdownTable, { token: table! }));
    expect(out).toContain(">x</code>");
    expect(out).toContain("text-center");
  });

  it("are null when the source holds more than a table", () => {
    expect(parseTable("text\n\n| a |\n| - |")).toBeNull();
    expect(parseTable("| a |\n| - |\n\n# heading")).toBeNull();
  });

  it("in the docs examples and samples render as tables", () => {
    const payloads = (doc: ArchDoc): PayloadNode[] => {
      const all = doc.connections.flatMap((c) => c.payloads);
      const walk = (nodes: ComponentNode[]) =>
        nodes.forEach((n) => {
          all.push(...n.payloads);
          walk(n.children);
        });
      walk(doc.components);
      return all;
    };
    const tables = [...EXAMPLES, ...SAMPLES].flatMap((e) =>
      payloads(parse(e.source).doc)
        .filter((p) => p.format === "table")
        .map((p) => [`${e.slug} ${p.name}`, p.content] as const),
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const [name, content] of tables) expect(parseTable(content), name).not.toBeNull();
  });
});
