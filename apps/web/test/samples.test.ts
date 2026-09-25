import { describe, expect, it } from "vitest";
import { format, parse, validate } from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { SAMPLES } from "@archer/mcp/samples";
import { renderArchSvg } from "../lib/svg";

// "From sample" saves these verbatim as new documents. A sample must open
// without warnings, and be canonical: the editor reformats the whole source
// on the first canvas edit, and that revision should show only the edit.
describe("samples", () => {
  it.each(SAMPLES.map((s) => [s.slug, s] as const))("%s is clean, canonical and renders", (_, s) => {
    const { doc, diagnostics } = parse(s.source);
    const all = [
      ...diagnostics,
      ...validate(doc, { knownTypes: knownTypes(), knownConnectionTypes: knownConnectionTypes() }),
    ];
    expect(all.map((d) => `${d.code} ${d.message}`)).toEqual([]);
    expect(format(doc)).toBe(s.source);
    expect(doc.title).toBe(s.title);
    expect(renderArchSvg(s.source)).not.toContain("Invalid document");
  });

  // The gallery's cards clamp descriptions to two lines; longer ones get cut off.
  it("have descriptions that fit a card", () => {
    for (const s of SAMPLES) expect(s.description.length, s.slug).toBeLessThanOrEqual(75);
  });

  it("have unique, URL-safe slugs", () => {
    const slugs = SAMPLES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
