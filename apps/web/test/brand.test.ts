import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, validate } from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import {
  BRAND_CODE_SAMPLE,
  COLOR_GROUPS,
  colorUtility,
  groupedColors,
  isColor,
  parseBrandTokens,
  radii,
  textSizes,
} from "../lib/brand";

// The brand page (/branding) reads its values from globals.css; these keep
// the parser and the page's grouping in step with the stylesheet.
const tokens = parseBrandTokens(
  readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"),
);

describe("brand tokens", () => {
  it("reads both themes from globals.css", () => {
    expect(tokens.light.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens.dark.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens.dark.accent).not.toBe(tokens.light.accent);
  });

  it("describes only tokens that exist, as colors in both themes", () => {
    for (const { token } of COLOR_GROUPS.flatMap((g) => g.tokens)) {
      expect(isColor(tokens.light[token]), `--${token} (light)`).toBe(true);
      expect(isColor(tokens.dark[token]), `--${token} (dark)`).toBe(true);
    }
  });

  it("describes every color token", () => {
    expect(groupedColors(tokens).map((g) => g.title)).not.toContain("Other");
  });

  it("finds the Tailwind names, radii and text scale", () => {
    expect(colorUtility(tokens.theme, "surface-2")).toBe("surface-2");
    expect(colorUtility(tokens.theme, "code-bg")).toBeUndefined();
    expect(radii(tokens.theme).map((r) => r.name)).toEqual(["xs", "sm", "md", "lg", "xl"]);
    const sizes = textSizes(tokens.theme);
    expect(sizes.map((s) => s.name)).toContain("base");
    for (const s of sizes) expect(s.lineHeight, `text-${s.name}`).toMatch(/px$/);
  });

  it("has a code sample that validates clean", () => {
    const { doc, diagnostics } = parse(BRAND_CODE_SAMPLE);
    const all = [
      ...diagnostics,
      ...validate(doc, { knownTypes: knownTypes(), knownConnectionTypes: knownConnectionTypes() }),
    ];
    expect(all.map((d) => `${d.code} ${d.message}`)).toEqual([]);
  });
});
