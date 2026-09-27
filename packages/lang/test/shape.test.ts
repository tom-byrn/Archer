import { describe, expect, it } from "vitest";
import {
  SHAPES,
  SHAPE_INFO,
  addComponent,
  compileForAgent,
  diffDocs,
  format,
  mergeDocs,
  parse,
  setComponentMeta,
  shapeOf,
  validate,
} from "../src/index";

const stripSpans = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, v) => (key === "span" ? undefined : v)));

const HEADER = 'arch "X" v0.2\n';
const FENCE = "```";

describe("shape field", () => {
  it("parses shape alongside desc, src, payloads and children", () => {
    const { doc, diagnostics } = parse(
      HEADER +
        `component db "Orders" @postgres {
  desc "Every order."
  shape cylinder
  src "services/orders"
  schema json ${FENCE}
  {}
  ${FENCE}
  component archive {
    shape bucket
  }
}`,
    );
    expect(diagnostics).toEqual([]);
    const db = doc.components[0]!;
    expect(db.shape).toBe("cylinder");
    expect(db.desc).toBe("Every order.");
    expect(db.src).toBe("services/orders");
    expect(db.payloads.map((p) => p.name)).toEqual(["schema"]);
    expect(db.children[0]!.shape).toBe("bucket");
  });

  it("formats shape first in the body and round-trips", () => {
    const original = parse(
      HEADER + `component web "Web" {\n  src "apps/web"\n  desc "Front end"\n  shape browser\n}`,
    ).doc;
    const once = format(original);
    expect(once).toContain('component web "Web" {\n  shape browser\n  desc "Front end"\n  src "apps/web"\n}');
    const reparsed = parse(once).doc;
    expect(stripSpans(reparsed.components)).toEqual(stripSpans(original.components));
    expect(format(reparsed)).toBe(once);
  });

  it("gives a component with only a shape a body", () => {
    const out = format(parse(HEADER + "component agent @agent { shape robot }").doc);
    expect(out).toContain("component agent @agent {\n  shape robot\n}");
  });

  it("wants a name after shape", () => {
    for (const bad of ['shape "cloud"', "shape 3", "shape }"]) {
      const { diagnostics } = parse(HEADER + `component web {\n  ${bad}\n}`);
      expect(diagnostics.some((d) => d.code === "E001" && /after 'shape'/.test(d.message)), bad).toBe(true);
    }
  });

  it("flags a second shape as E004 (last one wins)", () => {
    const { doc, diagnostics } = parse(HEADER + "component web {\n  shape cloud\n  shape server\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E004"]);
    expect(diagnostics[0]!.message).toContain("more than one 'shape'");
    expect(doc.components[0]!.shape).toBe("server");
  });

  it("reserves shape: a payload can't be named shape", () => {
    const src = `${HEADER}\ncomponent api {\n  shape json ${FENCE}\n  { "id": "uuid" }\n  ${FENCE}\n}\n`;
    expect(parse(src).diagnostics.map((d) => d.code)).toContain("E001");
  });

  it("tells a shape from a payload that follows it", () => {
    const { doc, diagnostics } = parse(
      `${HEADER}component db {\n  shape cylinder\n  schema json ${FENCE}\n  {}\n  ${FENCE}\n}`,
    );
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.shape).toBe("cylinder");
    expect(doc.components[0]!.payloads.map((p) => p.name)).toEqual(["schema"]);
  });

  it("leaves a component called shape alone", () => {
    const { doc, diagnostics } = parse(
      HEADER + "component shape { shape hexagon }\ncomponent db\nshape -> db",
    );
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.id).toBe("shape");
    expect(doc.components[0]!.shape).toBe("hexagon");
    expect(validate(doc).map((d) => d.code)).toEqual([]);
  });

  it("recovers at a shape line after a broken body item", () => {
    const { doc, diagnostics } = parse(HEADER + "component web {\n  desc 5 6\n  shape cloud\n}");
    expect(diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(doc.components[0]!.shape).toBe("cloud");
  });

  it("W304: a shape the language doesn't know draws as a box", () => {
    const doc = parse(HEADER + "component a { shape blob }\ncomponent b { shape cloud }").doc;
    const diags = validate(doc);
    expect(diags.map((d) => d.code)).toEqual(["W304"]);
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("'blob' on 'a'");
    expect(diags[0]!.message).toContain("cylinder");
    expect(shapeOf(doc.components[0]!)).toBe("box");
    expect(shapeOf(doc.components[1]!)).toBe("cloud");
    // Kept as written, so a newer shape survives an older tool.
    expect(format(doc)).toContain("shape blob");
  });

  it("knows every shape it lists", () => {
    const src = HEADER + SHAPES.map((s, i) => `component c${i} { shape ${s} }`).join("\n");
    const { doc, diagnostics } = parse(src);
    expect([...diagnostics, ...validate(doc)]).toEqual([]);
    expect(Object.keys(SHAPE_INFO).sort()).toEqual([...SHAPES].sort());
    expect(SHAPES[0]).toBe("box");
  });

  it("setComponentMeta sets and clears shape", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { shape: "cloud" });
    expect(d1.components[0]!.shape).toBe("cloud");
    expect(d0.components[0]!.shape).toBeUndefined();
    const d2 = setComponentMeta(d1, ["web"], { shape: null });
    expect(d2.components[0]!.shape).toBeUndefined();
    expect(format(d2)).toBe(format(d0));
    expect(() => setComponentMeta(d0, ["web"], { shape: "Big Cloud" })).toThrow(/Invalid shape/);
  });

  it("addComponent takes a shape and names the component after it", () => {
    const d0 = parse(HEADER + "component cloud").doc;
    const { doc, path } = addComponent(d0, [], { shape: "cloud", at: [6, 0] });
    expect(path).toEqual(["cloud_2"]);
    expect(doc.components[1]!.shape).toBe("cloud");
    const typed = addComponent(d0, [], { type: "postgres", shape: "cylinder" });
    expect(typed.path).toEqual(["postgres"]);
    expect(() => addComponent(d0, [], { shape: "no way" })).toThrow(/Invalid shape/);
  });

  it("diffs a changed shape", () => {
    const a = parse(HEADER + "component db @postgres").doc;
    const b = parse(HEADER + "component db @postgres { shape cylinder }").doc;
    expect(diffDocs(a, b).components).toEqual([{ path: "db", kind: "changed", fields: ["shape"] }]);
    expect(diffDocs(b, b).components).toEqual([]);
  });

  it("merges shapes like any other field", () => {
    const base = parse(HEADER + "component db\ncomponent web").doc;
    const ours = parse(HEADER + "component db { shape cylinder }\ncomponent web").doc;
    const theirs = parse(HEADER + 'component db\ncomponent web { desc "Front end" }').doc;
    const merged = mergeDocs(base, ours, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.doc.components.map((c) => [c.id, c.shape, c.desc])).toEqual([
      ["db", "cylinder", undefined],
      ["web", undefined, "Front end"],
    ]);

    const other = parse(HEADER + "component db { shape queue }\ncomponent web").doc;
    const clash = mergeDocs(base, ours, other);
    expect(clash.conflicts).toEqual([
      { kind: "component", path: "db", reason: "changed shape on both sides" },
    ]);
    expect(clash.doc.components[0]!.shape).toBe("cylinder");

    // Removed on one side after a shape change on the other: a conflict, not a silent loss.
    const gone = parse(HEADER + "component web").doc;
    expect(mergeDocs(base, ours, gone).conflicts.map((c) => c.path)).toEqual(["db"]);
  });

  it("compileForAgent keeps the shape line and documents it", () => {
    const out = compileForAgent(parse(HEADER + "component db { shape cylinder }").doc);
    expect(out).toContain("  shape cylinder");
    expect(out).toContain("`shape` (cylinder, cloud, person, robot, …) is how the canvas draws");
  });
});
