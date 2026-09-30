import { describe, expect, it } from "vitest";
import {
  COLORS,
  COLOR_HEX,
  addComponent,
  compileForAgent,
  diffDocs,
  format,
  mergeDocs,
  parse,
  resolveColor,
  setComponentMeta,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.2\n';

describe("color field", () => {
  it("parses a palette name or a hex string beside shape and icon", () => {
    const { doc, diagnostics } = parse(
      HEADER +
        `component cart "Cart" {
  color green
  icon shopping_cart
  shape pill
  component line { color "#0EA5E9" }
}`,
    );
    expect(diagnostics).toEqual([]);
    const cart = doc.components[0]!;
    expect(cart.color).toBe("green");
    expect(cart.icon).toBe("shopping_cart");
    expect(cart.children[0]!.color).toBe("#0EA5E9");
  });

  it("formats color after icon, a name bare and a hex value quoted, and round-trips", () => {
    const original = parse(
      HEADER + 'component web "Web" {\n  desc "Front end"\n  color "#0ea5e9"\n  icon browser\n  shape pill\n}\ncomponent db { color "blue" }',
    ).doc;
    const once = format(original);
    expect(once).toContain('component web "Web" {\n  shape pill\n  icon browser\n  color "#0ea5e9"\n  desc "Front end"\n}');
    expect(once).toContain("component db {\n  color blue\n}");
    expect(format(parse(once).doc)).toBe(once);
  });

  it("wants a name or string after color, once", () => {
    for (const bad of ["color 3", "color }", "color @blue"]) {
      const { diagnostics } = parse(HEADER + `component web {\n  ${bad}\n}`);
      expect(diagnostics.some((d) => d.code === "E001" && /after 'color'/.test(d.message)), bad).toBe(true);
    }
    const { doc, diagnostics } = parse(HEADER + "component web {\n  color red\n  color blue\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E004"]);
    expect(diagnostics[0]!.message).toContain("more than one 'color'");
    expect(doc.components[0]!.color).toBe("blue");
  });

  it("recovers at a color line after a broken body item", () => {
    const { doc, diagnostics } = parse(HEADER + "component web {\n  desc 5 6\n  color red\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(doc.components[0]!.color).toBe("red");
  });

  it("W306: a color the language doesn't know, kept as written", () => {
    const doc = parse(
      HEADER + 'component a { color mauve }\ncomponent b { color "#12345" }\ncomponent c { color teal }\ncomponent d { color "#A1B2C3" }',
    ).doc;
    const diags = validate(doc);
    expect(diags.map((d) => [d.code, d.severity])).toEqual([
      ["W306", "warning"],
      ["W306", "warning"],
    ]);
    expect(diags[0]!.message).toContain("'mauve' on 'a'");
    expect(format(doc)).toContain("color mauve");
  });

  it("resolves palette names and hex values", () => {
    expect(resolveColor("blue")).toBe(COLOR_HEX.blue);
    expect(resolveColor("#A1B2C3")).toBe("#a1b2c3");
    expect(resolveColor("mauve")).toBeUndefined();
    expect(resolveColor(undefined)).toBeUndefined();
    for (const c of COLORS) expect(COLOR_HEX[c]).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(Object.values(COLOR_HEX)).size).toBe(COLORS.length);
  });

  it("setComponentMeta and addComponent set and clear it", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { color: "violet" });
    expect(d1.components[0]!.color).toBe("violet");
    expect(setComponentMeta(d0, ["web"], { color: "#ff0000" }).components[0]!.color).toBe("#ff0000");
    expect(format(setComponentMeta(d1, ["web"], { color: null }))).toBe(format(d0));
    expect(() => setComponentMeta(d0, ["web"], { color: "mauve" })).toThrow(/Invalid color/);
    expect(addComponent(d0, [], { color: "rose" }).doc.components[1]!.color).toBe("rose");
  });

  it("diffs and merges it like any other field", () => {
    const base = parse(HEADER + "component db\ncomponent web").doc;
    const ours = parse(HEADER + "component db { color blue }\ncomponent web").doc;
    const theirs = parse(HEADER + "component db\ncomponent web { color red }").doc;
    expect(diffDocs(base, ours).components).toEqual([{ path: "db", kind: "changed", fields: ["color"] }]);
    const merged = mergeDocs(base, ours, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.doc.components.map((c) => [c.id, c.color])).toEqual([
      ["db", "blue"],
      ["web", "red"],
    ]);
    const other = parse(HEADER + "component db { color green }\ncomponent web").doc;
    expect(mergeDocs(base, ours, other).conflicts).toEqual([
      { kind: "component", path: "db", reason: "changed color on both sides" },
    ]);
  });

  it("compileForAgent keeps the color line and documents it", () => {
    const out = compileForAgent(parse(HEADER + "component db { color blue }").doc);
    expect(out).toContain("  color blue");
    expect(out).toContain("`color` (blue,");
  });
});
