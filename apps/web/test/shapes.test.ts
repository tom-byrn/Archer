import { describe, expect, it } from "vitest";
import { SHAPES, parse, autoLayout } from "@archer/lang";
import { labelLayout, shapeGeometry, type Rect } from "../lib/shapes";
import { renderArchSvg } from "../lib/svg";
import { toFlow } from "../lib/toFlow";

/** Every point a path visits (endpoints and control points), from the commands shapes.ts writes. */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVAQCZ])([^MLHVAQCZ]*)/g)) {
    const n = (args!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (cmd === "H") x = n[0]!;
    else if (cmd === "V") y = n[0]!;
    else if (cmd === "A") [x, y] = [n[5]!, n[6]!];
    else if (cmd === "Q") {
      out.push([n[0]!, n[1]!]);
      [x, y] = [n[2]!, n[3]!];
    } else if (cmd === "C") {
      out.push([n[0]!, n[1]!], [n[2]!, n[3]!]);
      [x, y] = [n[4]!, n[5]!];
    } else if (cmd === "M" || cmd === "L") [x, y] = [n[0]!, n[1]!];
    out.push([x, y]);
  }
  return out;
}

const inside = ([px, py]: [number, number], w: number, h: number) =>
  px >= -0.01 && py >= -0.01 && px <= w + 0.01 && py <= h + 0.01;

const SIZES: [number, number][] = [
  [160, 120],
  [120, 80],
  [80, 80],
  [400, 120],
  [160, 400],
  [40, 30],
];

describe("shape geometry", () => {
  it.each([...SHAPES])("draws %s inside its box at every size", (shape) => {
    for (const [w, h] of SIZES) {
      const g = shapeGeometry(shape, w, h);
      expect(g.parts.length, `${shape} ${w}×${h}`).toBeGreaterThan(0);
      for (const d of [...g.parts, g.details, g.dots])
        for (const p of points(d)) expect(inside(p, w, h), `${shape} ${w}×${h}: ${p}`).toBe(true);
    }
  });

  it.each([...SHAPES])("gives %s a label area inside its box and anchors on its sides", (shape) => {
    for (const [w, h] of SIZES.slice(0, 5)) {
      const { content: c, anchors: a } = shapeGeometry(shape, w, h);
      expect(c.w, `${shape} ${w}×${h}`).toBeGreaterThan(20);
      expect(c.h, `${shape} ${w}×${h}`).toBeGreaterThan(10);
      expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= h, `${shape} ${w}×${h}`).toBe(true);
      // An edge ends in the outer part of the box, never past its middle.
      for (const [side, v] of Object.entries(a))
        expect(v >= 0 && v < (side === "l" || side === "r" ? w : h) / 4, `${shape} ${side}`).toBe(true);
    }
  });

  it("pulls the edge in where the outline doesn't reach the box: a folder's top, a bucket's sides", () => {
    const folder = shapeGeometry("folder", 160, 120).anchors;
    expect(folder.t).toBeGreaterThan(5);
    expect(folder.l).toBe(1);
    const bucket = shapeGeometry("bucket", 160, 120).anchors;
    expect(bucket.l).toBeGreaterThan(4);
    expect(bucket.l).toBe(bucket.r);
    expect(shapeGeometry("cylinder", 160, 120).anchors).toEqual({ t: 1, r: 1, b: 1, l: 1 });
  });

  it("ends edges on the part of a shape that's there at each side's middle", () => {
    const at = (shape: (typeof SHAPES)[number]) => shapeGeometry(shape, 160, 120).anchors;
    // Into a chevron's notch, onto its point.
    expect(at("chevron").l).toBeGreaterThan(20);
    expect(at("chevron").r).toBe(1);
    // A laptop's lid and an archive box are narrower than their base and lid.
    for (const shape of ["laptop", "archive", "building", "parallelogram", "funnel", "bell"] as const) {
      expect(at(shape).l, shape).toBeGreaterThan(4);
      expect(at(shape).l, shape).toBeCloseTo(at(shape).r, 5);
    }
    // A module's tabs leave its left side clear at mid-height; a chip's pins leave every middle clear.
    expect(at("module").l).toBeGreaterThan(4);
    expect(new Set(Object.values(at("chip"))).size).toBe(1);
    expect(at("chip").t).toBeGreaterThan(4);
    // A speech bubble's tail and a memory module's contacts are off to the side of the bottom middle.
    expect(at("chat").b).toBeGreaterThan(4);
    expect(at("memory").b).toBeGreaterThan(4);
    // A brain's hemispheres meet in a notch, top and bottom.
    expect(at("brain").t).toBeGreaterThan(4);
    expect(at("brain").b).toBeGreaterThan(4);
    // Knobs, crowns and peaks reach the box.
    for (const shape of ["puzzle", "clock", "building", "lock", "gauge", "cube"] as const) expect(at(shape).t, shape).toBe(1);
    expect(at("puzzle").r).toBe(1);
  });
});

describe("labelLayout", () => {
  const rect = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

  it("stacks glyph, name and tag when there's room", () => {
    expect(labelLayout(rect(140, 90), true, true)).toEqual({ glyph: "above", lines: 2, sub: true });
  });

  it("gives things up in order as the room shrinks", () => {
    expect(labelLayout(rect(140, 60), true, true)).toEqual({ glyph: "above", lines: 1, sub: true });
    expect(labelLayout(rect(140, 40), true, true)).toEqual({ glyph: "inline", lines: 1, sub: true });
    expect(labelLayout(rect(140, 18), true, true)).toEqual({ glyph: "inline", lines: 1, sub: false });
    expect(labelLayout(rect(50, 18), true, true)).toEqual({ glyph: "none", lines: 1, sub: false });
  });

  it("shows an untyped shape's name alone", () => {
    expect(labelLayout(rect(140, 90), false, false)).toEqual({ glyph: "none", lines: 2, sub: false });
    expect(labelLayout(rect(140, 90), false, true)).toEqual({ glyph: "none", lines: 2, sub: true });
  });
});

describe("shapes in the renderers", () => {
  const SRC = `arch "S" v0.1

component api "API" @service

component files "Files" {
  shape folder
}

component ring "Ring" @service {
  shape circle
  component inside "Inside"
}

api -> files

layout {
  api: { at: [0, 0], size: [4, 3] }
  files: { at: [0, 6], size: [4, 3] }
  ring: { at: [8, 0], size: [8, 6], display: plane }
  ring.inside: { at: [1, 2], size: [4, 3] }
}
`;

  it("carries the shape onto canvas nodes, but never onto a plane", () => {
    const { nodes } = toFlow(autoLayout(parse(SRC).doc));
    const shape = (id: string) => nodes.find((n) => n.id === id)?.data.shape;
    expect(shape("files")).toBe("folder");
    expect(shape("api")).toBeUndefined();
    expect(shape("ring")).toBeUndefined();
    const collapsed = SRC.replace("display: plane", "display: icon");
    expect(toFlow(autoLayout(parse(collapsed).doc)).nodes.find((n) => n.id === "ring")?.data.shape).toBe("circle");
  });

  it("tints a shape by its type, but not by a type it can't resolve", () => {
    const outline = (src: string) =>
      /<path d="[^"]+" fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})" stroke-linejoin="round"\/>/.exec(
        renderArchSvg(`arch "T" v0.1\n\n${src}\n`, { showTitle: false }),
      )!.slice(1);
    expect(outline("component a { shape cloud }")).toEqual(["#ffffff", "#d2ccc3"]);
    expect(outline("component a @nope.thing { shape cloud }")).toEqual(["#ffffff", "#d2ccc3"]);
    const [fill, stroke] = outline("component a @postgres { shape cylinder }");
    expect(fill).not.toBe("#ffffff");
    expect(stroke).not.toBe("#d2ccc3");
  });

  it("wraps a long name onto two lines when the shape has room", () => {
    const svg = renderArchSvg(
      `arch "T" v0.1\n\ncomponent h "A very long component name that wraps" @service {\n  shape circle\n}\n\nlayout {\n  h: { at: [0, 0], size: [5, 4] }\n}\n`,
      { showTitle: false },
    );
    const names = [...svg.matchAll(/font-size="13" font-weight="600" fill="[^"]+">([^<]+)</g)].map((m) => m[1]!);
    expect(names).toHaveLength(2);
    // Broken at a space; the second line picks up where the first stopped, truncated.
    expect("A very long component name that wraps".startsWith(`${names[0]} `)).toBe(true);
    const rest = "A very long component name that wraps".slice(names[0]!.length + 1);
    expect(names[1]!.endsWith("…")).toBe(true);
    expect(rest.startsWith(names[1]!.slice(0, -1))).toBe(true);
  });

  it("draws the outline and ends edges on it in the SVG", () => {
    const svg = renderArchSvg(SRC, { showTitle: false });
    const folder = shapeGeometry("folder", 160, 120);
    expect(svg).toContain(`d="${folder.parts[0]}"`);
    // api sits over files: the edge runs down and stops on the folder's top edge,
    // below the tab, not at the top of its box (40px padding + 6 rows).
    const edge = /<path d="([^"]+)" fill="none" stroke="[^"]+" stroke-width="1.5" marker-end/.exec(svg)![1]!;
    const end = Number(/V(-?[\d.]+)$/.exec(edge)![1]);
    expect(end).toBeCloseTo(40 + 6 * 40 + folder.anchors.t, 5);
  });
});
