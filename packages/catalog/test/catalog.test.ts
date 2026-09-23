import { describe, expect, it } from "vitest";
import { CATALOG, GLYPHS } from "../src/index";

// Consumers never fail loudly on a bad entry: lookupType's Map keeps the last
// duplicate tag, unknown glyphs render as GLYPHS.box, and displayColor only
// brightens #rrggbb for dark mode. These catch such entries here instead.
describe("catalog", () => {
  it("gives every type a unique tag", () => {
    const tags = CATALOG.map((t) => t.tag);
    expect(tags.filter((tag, i) => tags.indexOf(tag) !== i)).toEqual([]);
  });

  it("points every type at a glyph in GLYPHS", () => {
    expect(Object.hasOwn(GLYPHS, "box")).toBe(true);
    const missing = CATALOG.filter((t) => !Object.hasOwn(GLYPHS, t.glyph));
    expect(missing.map((t) => `${t.tag}: ${t.glyph}`)).toEqual([]);
  });

  it("uses #rrggbb accent colors", () => {
    const bad = CATALOG.filter((t) => !/^#[0-9a-f]{6}$/i.test(t.color));
    expect(bad.map((t) => `${t.tag}: ${t.color}`)).toEqual([]);
  });
});
