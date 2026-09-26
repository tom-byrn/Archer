import { describe, expect, it } from "vitest";
import { CATALOG, GLYPHS } from "../src/index";
import { LOGOS } from "../src/logos";
import { buildGlyphs } from "../scripts/glyphs";
import { NO_LOGO, NO_LOGO_NAMESPACES, VENDOR_NAMESPACES, buildLogos } from "../scripts/logos";

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

  it("draws every glyph from Phosphor (edit scripts/glyphs.ts, then `pnpm --filter @archer/catalog glyphs`)", () => {
    expect(GLYPHS).toEqual(buildGlyphs());
  });

  it("uses #rrggbb accent colors", () => {
    const bad = CATALOG.filter((t) => !/^#[0-9a-f]{6}$/i.test(t.color));
    expect(bad.map((t) => `${t.tag}: ${t.color}`)).toEqual([]);
  });
});

describe("logos", () => {
  it("draws every logo from its source (edit scripts/logos.ts, then `pnpm --filter @archer/catalog logos`)", () => {
    expect(LOGOS).toEqual(buildLogos());
  });

  it("points types only at logos that exist, and uses every logo", () => {
    const missing = CATALOG.filter((t) => t.logo !== undefined && !Object.hasOwn(LOGOS, t.logo));
    expect(missing.map((t) => `${t.tag}: ${t.logo}`)).toEqual([]);
    const used = new Set(CATALOG.map((t) => t.logo));
    expect(Object.keys(LOGOS).filter((key) => !used.has(key))).toEqual([]);
  });

  // A new vendor type needs a decision: a logo (see scripts/logos.ts for which
  // sources qualify) or a reason in NO_LOGO. Vendor-neutral types never get one.
  it("gives every vendor type a logo or a reason it has none", () => {
    const reason = (t: (typeof CATALOG)[number]) => NO_LOGO[t.tag] ?? NO_LOGO_NAMESPACES[t.namespace];
    const vendor = CATALOG.filter((t) => VENDOR_NAMESPACES.includes(t.namespace));
    expect(vendor.filter((t) => (t.logo === undefined) === (reason(t) === undefined)).map((t) => t.tag)).toEqual([]);
    const neutral = CATALOG.filter((t) => !VENDOR_NAMESPACES.includes(t.namespace) && t.logo !== undefined);
    expect(neutral.map((t) => t.tag)).toEqual([]);
    const tags = new Set(CATALOG.map((t) => t.tag));
    expect(Object.keys(NO_LOGO).filter((tag) => !tags.has(tag))).toEqual([]);
  });

  it("paints one-colour logos in a #rrggbb brand color", () => {
    const bad = Object.entries(LOGOS).filter(([, l]) => (l.kind === "mono") !== /^#[0-9a-f]{6}$/.test(l.color ?? ""));
    expect(bad.map(([key]) => key)).toEqual([]);
  });
});
