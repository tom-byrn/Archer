import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  autoLayout,
  componentPaths,
  format,
  layoutMap,
  parse,
  validate,
} from "../src/index";
import type { LayoutEntry } from "../src/index";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const HEADER = 'arch "X" v0.1\n';

const rects = (entries: LayoutEntry[]) =>
  entries.map((e) => ({ path: e.path.join("."), at: e.at!, size: e.size! }));

const overlap = (
  a: { at: [number, number]; size: [number, number] },
  b: { at: [number, number]; size: [number, number] },
) =>
  a.at[0] < b.at[0] + b.size[0] &&
  b.at[0] < a.at[0] + a.size[0] &&
  a.at[1] < b.at[1] + b.size[1] &&
  b.at[1] < a.at[1] + a.size[1];

describe("autoLayout", () => {
  it("gives every component an at and size", () => {
    const src = HEADER + "component a\ncomponent b { component c { component d } }";
    const out = autoLayout(parse(src).doc);
    const map = layoutMap(out);
    for (const p of componentPaths(out)) {
      expect(map.get(p)?.at, p).toBeDefined();
      expect(map.get(p)?.size, p).toBeDefined();
    }
  });

  it("is deterministic", () => {
    const src = fixture("acme.arch").replace(/layout \{[\s\S]*\}\n/, "");
    const a = format(autoLayout(parse(src).doc));
    const b = format(autoLayout(parse(src).doc));
    expect(a).toBe(b);
  });

  it("never moves existing entries", () => {
    const out = autoLayout(parse(fixture("acme.arch")).doc);
    const map = layoutMap(out);
    expect(map.get("web")!.at).toEqual([0, 3]);
    expect(map.get("backend")!.at).toEqual([6, 0]);
    expect(map.get("backend.db")!.display).toBe("icon");
  });

  it("does not overlap siblings within a scope", () => {
    const src =
      HEADER +
      "component a\ncomponent b\ncomponent c\ncomponent d\na -> b\na -> c\nb -> d\nc -> d";
    const out = autoLayout(parse(src).doc);
    const top = rects(out.layout.filter((e) => e.path.length === 1));
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++)
        expect(overlap(top[i]!, top[j]!), `${top[i]!.path} vs ${top[j]!.path}`).toBe(
          false,
        );
  });

  it("places connection targets in later columns", () => {
    const src = HEADER + "component a\ncomponent b\ncomponent c\na -> b\nb -> c";
    const map = layoutMap(autoLayout(parse(src).doc));
    expect(map.get("a")!.at![0]).toBeLessThan(map.get("b")!.at![0]);
    expect(map.get("b")!.at![0]).toBeLessThan(map.get("c")!.at![0]);
  });

  it("survives connection cycles", () => {
    const src = HEADER + "component a\ncomponent b\na -> b\nb -> a";
    const map = layoutMap(autoLayout(parse(src).doc));
    expect(map.get("a")!.at).toBeDefined();
    expect(map.get("b")!.at).toBeDefined();
  });

  it("sizes planes to contain their children", () => {
    const src = HEADER + "component p { component x\ncomponent y\nx -> y }";
    const map = layoutMap(autoLayout(parse(src).doc));
    const p = map.get("p")!;
    for (const id of ["p.x", "p.y"]) {
      const child = map.get(id)!;
      expect(child.at![0] + child.size![0]).toBeLessThanOrEqual(p.size![0]);
      expect(child.at![1] + child.size![1]).toBeLessThanOrEqual(p.size![1]);
    }
  });

  it("collapsed (display: icon) containers keep leaf size", () => {
    const src =
      HEADER +
      "component p { component x }\nlayout { p: { at: [0, 0], display: icon } }";
    const map = layoutMap(autoLayout(parse(src).doc));
    expect(map.get("p")!.size).toEqual([4, 3]);
    // Children still get laid out for when the plane is expanded.
    expect(map.get("p.x")!.at).toBeDefined();
  });

  it("avoids fixed entries when placing new nodes", () => {
    const src =
      HEADER + "component a\ncomponent b\nlayout { a: { at: [0, 0], size: [4, 3] } }";
    const out = autoLayout(parse(src).doc);
    const [a, b] = [layoutMap(out).get("a")!, layoutMap(out).get("b")!];
    expect(
      overlap(
        { at: a.at!, size: a.size! },
        { at: b.at!, size: b.size! },
      ),
    ).toBe(false);
  });

  it("wraps sibling-heavy scopes into multiple columns", () => {
    const src =
      HEADER +
      "component p { component a\ncomponent b\ncomponent c\ncomponent d\ncomponent e\ncomponent f }";
    const map = layoutMap(autoLayout(parse(src).doc));
    const xs = new Set(
      ["a", "b", "c", "d", "e", "f"].map((id) => map.get(`p.${id}`)!.at![0]),
    );
    expect(xs.size).toBeGreaterThan(1); // not one endless column
    const p = map.get("p")!;
    expect(p.size![1]).toBeLessThan(25); // plane stays roughly rectangular
    // Still no overlaps.
    const rs = rects(["a", "b", "c", "d", "e", "f"].map((id) => map.get(`p.${id}`)!));
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++)
        expect(overlap(rs[i]!, rs[j]!)).toBe(false);
  });

  it("output validates cleanly and formats idempotently", () => {
    const src = fixture("acme.arch").replace(/layout \{[\s\S]*\}\n/, "");
    const out = autoLayout(parse(src).doc);
    expect(validate(out)).toEqual([]);
    const once = format(out);
    expect(format(parse(once).doc)).toBe(once);
  });
});
