import { describe, expect, it } from "vitest";
import { format, parse } from "@archer/lang";
import { CANVAS_BUDGET, analyzeSource, colorHints, prepareSource, readabilityHints, typeTags } from "../src/analysis";
import { EXAMPLES } from "../src/examples";
import { GUIDE } from "../src/guide";

// Write results nudge agents to nest when a canvas gets too crowded to read
// (the guide's "Keep every canvas readable"). These pin down what counts.

const hints = (source: string) => readabilityHints(parse(source).doc);

/** `n` untyped components, optionally on a plane or inside a component. */
const components = (n: number, indent = "") =>
  Array.from({ length: n }, (_, i) => `${indent}component c${i} "C${i}"`).join("\n");

describe("readability hints", () => {
  it("are quiet up to the budget", () => {
    const n = CANVAS_BUDGET.components;
    expect(hints(`arch "x" v0.2\n${components(n)}\n`)).toEqual([]);
  });

  it("name the top level when it holds too many components", () => {
    const out = hints(`arch "x" v0.2\n${components(CANVAS_BUDGET.components + 1)}\n`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^The top level shows 13 components and 0 lines/);
    expect(out[0]).toMatch(/Keep every canvas readable/);
  });

  it("count components on planes, which share the canvas", () => {
    const source = `arch "x" v0.2\nplane a "A" {\n${components(7, "  ")}\n}\nplane b "B" {\n${components(7, "  ").replace(/c(\d)/g, "d$1")}\n}\n`;
    expect(hints(source)).toHaveLength(1);
  });

  it("check the inside of each component on its own", () => {
    const source = `arch "x" v0.2\ncomponent core "Core" {\n${components(13, "  ")}\n}\ncomponent web "Web"\nweb -> core.c0\n`;
    const out = hints(source);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^The inside of core shows 13 components/);
  });

  it("count lines per pair of boxes, as the canvas draws them", () => {
    // Five parts of `a` talk to parts of `b`: one line between the two boxes on the top level.
    const parts = (id: string) => `component ${id} "${id}" {\n${components(5, "  ")}\n}`;
    const edges = Array.from({ length: 5 }, (_, i) => `a.c${i} -> b.c${(i + 1) % 5}`).join("\n");
    expect(hints(`arch "x" v0.2\n${parts("a")}\n${parts("b")}\n${edges}\n`)).toEqual([]);

    // A full mesh of 7 components draws 21 lines, over budget though the components aren't.
    const mesh = Array.from({ length: 7 }, (_, i) =>
      Array.from({ length: 7 }, (_, j) => (i < j ? `c${i} -> c${j}` : "")).filter(Boolean),
    ).flat();
    const out = hints(`arch "x" v0.2\n${components(7)}\n${mesh.join("\n")}\n`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/7 components and 21 lines/);
  });

  it("come back from a write with the rest of the result", () => {
    const r = prepareSource(`arch "x" v0.2\n${components(20)}\n`, new Set());
    expect(r.ok && r.hints).toHaveLength(1);
  });

  it("stay quiet for the guide's own example, which validates clean and canonical", () => {
    const block = /\n((?: {4}.*\n|\n)*? {4}arch "Signing Platform"[\s\S]*?)\n(?! {4}|\n)/.exec(GUIDE);
    const source = block![1]!.replace(/^ {4}/gm, "").trim() + "\n";
    const a = analyzeSource(source, typeTags());
    expect([...a.errors, ...a.warnings].map((d) => d.message)).toEqual([]);
    expect(format(a.doc)).toBe(source);
    expect(readabilityHints(a.doc)).toEqual([]);
    expect(colorHints(a.doc)).toEqual([]);
  });

  it.each(EXAMPLES.map((e) => [e.slug, e.source] as const))("stay quiet for the worked example %s", (_, source) => {
    expect(hints(source)).toEqual([]);
    expect(colorHints(parse(source).doc)).toEqual([]);
  });
});

describe("color hints", () => {
  const colors = (source: string) => colorHints(parse(source).doc);
  const doc = (...bodies: string[]) =>
    `arch "x" v0.2\n` + bodies.map((b, i) => `component c${i} "C${i}"${b}`).join("\n") + "\n";

  it("speak up when most components would be drawn grey", () => {
    const out = colors(doc("", " @service", " @worker", " @queue", " @postgres"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^4 of 5 components are drawn grey/);
    expect(out[0]).toMatch(/"Colors" in get_guide/);
  });

  it("count nested components too", () => {
    expect(colors(`arch "x" v0.2\ncomponent a "A" {\n  component b "B"\n  component c "C"\n  component d "D"\n}\n`)).toHaveLength(1);
  });

  it("are quiet once components have colors, or colored types", () => {
    expect(colors(doc(" {\n  color sky\n}", " {\n  color blue\n}", " {\n  color teal\n}", "", ""))).toEqual([]);
    expect(colors(doc(" @postgres", " @stripe", " @aws.s3", " @kafka", ""))).toEqual([]);
    expect(colors(doc(" @custom.billing", " @custom.billing", " @custom.billing", " @custom.billing"))).toEqual([]);
  });

  it("leave small documents alone", () => {
    expect(colors(doc("", "", ""))).toEqual([]);
  });
});
