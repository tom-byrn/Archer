import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG, GLYPHS } from "../src/index";
import { ICON_ALIASES, ICON_GROUPS, ICON_KEYWORDS, ICON_NAMES, canonicalIcon, iconMarkup } from "../src/icons";
import { LOGOS } from "../src/logos";
import { buildGlyphs, iconsModule } from "../scripts/glyphs";
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

  it("generates src/icons.ts from Phosphor (edit scripts/glyphs.ts, then `pnpm --filter @archer/catalog glyphs`)", () => {
    expect(readFileSync(new URL("../src/icons.ts", import.meta.url), "utf8")).toBe(iconsModule());
  });

  it("offers every icon name in the picker, once, as a name the language can write", () => {
    const picked = ICON_GROUPS.flatMap((g) => g.icons);
    expect(picked.filter((name, i) => picked.indexOf(name) !== i)).toEqual([]);
    expect(new Set([...picked, ...Object.keys(ICON_ALIASES)])).toEqual(ICON_NAMES);
    expect(picked.filter((name) => !/^[a-z][a-z0-9_]*$/.test(name))).toEqual([]);
    expect(picked.filter((name) => !iconMarkup(name) || !ICON_KEYWORDS[name])).toEqual([]);
    // Every glyph is an icon too, so a type's glyph can be picked by name.
    expect(Object.keys(GLYPHS).filter((key) => !ICON_NAMES.has(key))).toEqual([]);
  });

  it("takes Phosphor's own name for an icon that goes by a glyph key", () => {
    expect(canonicalIcon("hard_drives")).toBe("server");
    expect(iconMarkup("hard_drives")).toBe(GLYPHS.server);
    expect(iconMarkup("tree_structure")).toBe(GLYPHS.gateway);
    // A name another icon already has stays that icon's: plain `shield` is the glyph.
    expect(ICON_ALIASES.shield).toBeUndefined();
    const picked = new Set(ICON_GROUPS.flatMap((g) => g.icons));
    for (const [alias, name] of Object.entries(ICON_ALIASES)) {
      expect(picked.has(alias), alias).toBe(false);
      expect(Object.hasOwn(GLYPHS, name), alias).toBe(true);
    }
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
