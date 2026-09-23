import { describe, expect, it } from "vitest";
import { format, parse, validate } from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { EXAMPLES } from "../lib/examples";
import { highlightArch } from "../lib/highlightArch";
import { renderArchSvg } from "../lib/svg";

// The docs promise that each example is exactly what the app would save and
// draw: these keep that true as the language and catalog change.
describe("docs examples", () => {
  it.each(EXAMPLES.map((e) => [e.slug, e] as const))("%s is clean, canonical and renders", (_, e) => {
    const { doc, diagnostics } = parse(e.source);
    const all = [
      ...diagnostics,
      ...validate(doc, { knownTypes: knownTypes(), knownConnectionTypes: knownConnectionTypes() }),
    ];
    expect(all.map((d) => `${d.code} ${d.message}`)).toEqual([]);
    expect(format(doc)).toBe(e.source);
    expect(doc.title).toBe(e.title);
    expect(renderArchSvg(e.source)).not.toContain("Invalid document");
  });

  it("have unique, URL-safe slugs", () => {
    const slugs = EXAMPLES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("highlight without changing the text", () => {
    for (const e of EXAMPLES) {
      const text = highlightArch(e.source)
        .map((line) => line.map((t) => t.text).join(""))
        .join("\n");
      expect(text + "\n").toBe(e.source);
    }
  });
});
