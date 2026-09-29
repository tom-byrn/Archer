import { describe, expect, it } from "vitest";
import {
  addComponent,
  compileForAgent,
  diffDocs,
  format,
  mergeDocs,
  parse,
  setComponentMeta,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.2\n';
const FENCE = "```";

describe("icon field", () => {
  it("parses icon beside shape, desc, src and payloads", () => {
    const { doc, diagnostics } = parse(
      HEADER +
        `component cart "Cart" {
  desc "What you're buying."
  icon shopping_cart
  shape pill
  schema json ${FENCE}
  {}
  ${FENCE}
  component line { icon receipt }
}`,
    );
    expect(diagnostics).toEqual([]);
    const cart = doc.components[0]!;
    expect(cart.icon).toBe("shopping_cart");
    expect(cart.shape).toBe("pill");
    expect(cart.payloads.map((p) => p.name)).toEqual(["schema"]);
    expect(cart.children[0]!.icon).toBe("receipt");
  });

  it("formats icon after shape and round-trips", () => {
    const original = parse(HEADER + 'component web "Web" {\n  desc "Front end"\n  icon browser\n  shape pill\n}').doc;
    const once = format(original);
    expect(once).toContain('component web "Web" {\n  shape pill\n  icon browser\n  desc "Front end"\n}');
    expect(format(parse(once).doc)).toBe(once);
    expect(format(parse(HEADER + "component a @service { icon gear }").doc)).toContain(
      "component a @service {\n  icon gear\n}",
    );
  });

  it("wants a name after icon, once", () => {
    for (const bad of ['icon "gear"', "icon 3", "icon }"]) {
      const { diagnostics } = parse(HEADER + `component web {\n  ${bad}\n}`);
      expect(diagnostics.some((d) => d.code === "E001" && /after 'icon'/.test(d.message)), bad).toBe(true);
    }
    const { doc, diagnostics } = parse(HEADER + "component web {\n  icon gear\n  icon bug\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E004"]);
    expect(diagnostics[0]!.message).toContain("more than one 'icon'");
    expect(doc.components[0]!.icon).toBe("bug");
  });

  it("recovers at an icon line after a broken body item", () => {
    const { doc, diagnostics } = parse(HEADER + "component web {\n  desc 5 6\n  icon gear\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(doc.components[0]!.icon).toBe("gear");
  });

  it("W305: an icon the tools don't know, only when they say which they know", () => {
    const doc = parse(HEADER + "component a { icon blob }\ncomponent b { icon gear }").doc;
    expect(validate(doc)).toEqual([]);
    const diags = validate(doc, { knownIcons: new Set(["gear"]) });
    expect(diags.map((d) => [d.code, d.severity])).toEqual([["W305", "warning"]]);
    expect(diags[0]!.message).toContain("'blob' on 'a'");
    // Kept as written, so a newer icon survives an older tool.
    expect(format(doc)).toContain("icon blob");
  });

  it("setComponentMeta and addComponent set and clear it", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { icon: "globe" });
    expect(d1.components[0]!.icon).toBe("globe");
    expect(format(setComponentMeta(d1, ["web"], { icon: null }))).toBe(format(d0));
    expect(() => setComponentMeta(d0, ["web"], { icon: "Big Globe" })).toThrow(/Invalid icon/);
    expect(addComponent(d0, [], { icon: "bug" }).doc.components[1]!.icon).toBe("bug");
  });

  it("diffs and merges it like any other field", () => {
    const base = parse(HEADER + "component db\ncomponent web").doc;
    const ours = parse(HEADER + "component db { icon database }\ncomponent web").doc;
    const theirs = parse(HEADER + "component db\ncomponent web { icon browser }").doc;
    expect(diffDocs(base, ours).components).toEqual([{ path: "db", kind: "changed", fields: ["icon"] }]);
    const merged = mergeDocs(base, ours, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.doc.components.map((c) => [c.id, c.icon])).toEqual([
      ["db", "database"],
      ["web", "browser"],
    ]);
    const other = parse(HEADER + "component db { icon vault }\ncomponent web").doc;
    expect(mergeDocs(base, ours, other).conflicts).toEqual([
      { kind: "component", path: "db", reason: "changed icon on both sides" },
    ]);
  });

  it("compileForAgent keeps the icon line and documents it", () => {
    const out = compileForAgent(parse(HEADER + "component db { icon database }").doc);
    expect(out).toContain("  icon database");
    expect(out).toContain("`icon` (database,");
  });
});
