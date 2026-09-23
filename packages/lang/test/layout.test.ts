import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  autoLayout,
  componentPaths,
  format,
  layoutMap,
  parse,
  setDisplay,
  validate,
} from "../src/index";
import type { ArchDoc, ComponentNode, LayoutEntry } from "../src/index";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const HEADER = 'arch "X" v0.1\n';

interface Box {
  at: [number, number];
  size: [number, number];
}

const rects = (entries: LayoutEntry[]) =>
  entries.map((e) => ({ path: e.path.join("."), at: e.at!, size: e.size! }));

const overlap = (a: Box, b: Box) =>
  a.at[0] < b.at[0] + b.size[0] &&
  b.at[0] < a.at[0] + a.size[0] &&
  a.at[1] < b.at[1] + b.size[1] &&
  b.at[1] < a.at[1] + a.size[1];

const laidOut = (src: string) => autoLayout(parse(src).doc);

/** Absolute top-left of a component (sum of `at` along its path). */
function abs(doc: ArchDoc, path: string): [number, number] {
  const map = layoutMap(doc);
  const segs = path.split(".");
  let x = 0;
  let y = 0;
  for (let i = 1; i <= segs.length; i++) {
    const e = map.get(segs.slice(0, i).join("."))!;
    x += e.at![0];
    y += e.at![1];
  }
  return [x, y];
}

/** Every scope's children: no two overlap, and each sits inside its plane. */
function expectTidy(doc: ArchDoc) {
  const map = layoutMap(doc);
  const walk = (items: ComponentNode[], prefix: string) => {
    const kids = items.map((c) => {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const e = map.get(path)!;
      expect(e?.at, path).toBeDefined();
      expect(e?.size, path).toBeDefined();
      return { path, at: e.at!, size: e.size! };
    });
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++)
        expect(overlap(kids[i]!, kids[j]!), `${kids[i]!.path} vs ${kids[j]!.path}`).toBe(false);
    if (prefix !== "") {
      const plane = map.get(prefix)!;
      if (plane.display !== "icon")
        for (const k of kids) {
          expect(k.at[0], k.path).toBeGreaterThanOrEqual(1);
          expect(k.at[1], k.path).toBeGreaterThanOrEqual(2);
          expect(k.at[0] + k.size[0], k.path).toBeLessThanOrEqual(plane.size![0] - 1);
          expect(k.at[1] + k.size[1], k.path).toBeLessThanOrEqual(plane.size![1] - 1);
        }
    }
    for (const c of items) walk(c.children, prefix === "" ? c.id : `${prefix}.${c.id}`);
  };
  walk(doc.components, "");
}

/** Row of a box's middle, in half cells (so odd and even heights compare). */
const middle = (doc: ArchDoc, path: string) => {
  const e = layoutMap(doc).get(path)!;
  return 2 * abs(doc, path)[1] + e.size![1];
};

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
    const src = fixture("streaming.arch");
    expect(format(laidOut(src))).toBe(format(laidOut(src)));
  });

  it("does not depend on the order connections are written in", () => {
    const doc = parse(fixture("streaming.arch")).doc;
    const shuffled = { ...doc, connections: [...doc.connections].reverse() };
    expect(format(autoLayout(shuffled))).toBe(format(autoLayout(doc)));
  });

  it("never moves existing entries", () => {
    const out = autoLayout(parse(fixture("acme.arch")).doc);
    const map = layoutMap(out);
    expect(map.get("web")!.at).toEqual([0, 3]);
    expect(map.get("backend")!.at).toEqual([6, 0]);
    expect(map.get("backend.db")!.display).toBe("icon");
  });

  it("keeps every scope free of overlaps and inside its plane", () => {
    expectTidy(laidOut(fixture("streaming.arch")));
    expectTidy(laidOut(fixture("acme.arch").replace(/layout \{[\s\S]*\}\n/, "")));
  });

  it("places connection targets in later columns", () => {
    const map = layoutMap(laidOut(HEADER + "component a\ncomponent b\ncomponent c\na -> b\nb -> c"));
    expect(map.get("a")!.at![0]).toBeLessThan(map.get("b")!.at![0]);
    expect(map.get("b")!.at![0]).toBeLessThan(map.get("c")!.at![0]);
  });

  it("keeps a chain on one row", () => {
    const out = laidOut(
      HEADER + "component a\ncomponent b\ncomponent c\ncomponent d\na -> b\nb -> c\nc -> d",
    );
    const rows = ["a", "b", "c", "d"].map((p) => layoutMap(out).get(p)!.at![1]);
    expect(new Set(rows).size).toBe(1);
  });

  it("lines a box up with one of its neighbours", () => {
    // a fans out to three targets: it sits level with the middle one.
    const out = laidOut(
      HEADER + "component a\ncomponent x\ncomponent y\ncomponent z\na -> x\na -> y\na -> z",
    );
    expect(middle(out, "a")).toBe(middle(out, "y"));
  });

  it("orders columns to avoid crossings", () => {
    // Declaration order alone would cross a->d and b->c.
    const out = laidOut(
      HEADER + "component a\ncomponent b\ncomponent c\ncomponent d\na -> d\nb -> c",
    );
    const y = (p: string) => middle(out, p);
    expect(Math.sign(y("a") - y("b"))).toBe(Math.sign(y("d") - y("c")));
  });

  it("runs a connection that skips columns along a clear row", () => {
    // a -> d skips b's and c's columns: a straight row that b and c keep clear.
    const out = laidOut(
      HEADER +
        "component a\ncomponent b\ncomponent c\ncomponent d\na -> b\nb -> c\nc -> d\na -> d",
    );
    const lane = middle(out, "a");
    expect(middle(out, "d")).toBe(lane);
    for (const p of ["b", "c"]) {
      const top = 2 * abs(out, p)[1];
      const inside = lane > top && lane < top + 2 * layoutMap(out).get(p)!.size![1];
      expect(inside, p).toBe(false);
    }
  });

  it("survives connection cycles", () => {
    const map = layoutMap(laidOut(HEADER + "component a\ncomponent b\na -> b\nb -> a"));
    expect(map.get("a")!.at).toBeDefined();
    expect(map.get("b")!.at).toBeDefined();
  });

  it("sizes planes to contain their children", () => {
    const map = layoutMap(laidOut(HEADER + "component p { component x\ncomponent y }\np.x -> p.y"));
    const p = map.get("p")!;
    for (const id of ["p.x", "p.y"]) {
      const child = map.get(id)!;
      expect(child.at![0] + child.size![0]).toBeLessThanOrEqual(p.size![0]);
      expect(child.at![1] + child.size![1]).toBeLessThanOrEqual(p.size![1]);
    }
    expect(map.get("p.x")!.at![0]).toBeLessThan(map.get("p.y")!.at![0]);
  });

  it("pulls a plane's children toward the side their connections leave from", () => {
    // Inside p, `out` talks to something on the right and `in` is fed from
    // the left, so the plane runs right-to-left inside: `in` on the left.
    const out = laidOut(
      HEADER +
        "component left\ncomponent p { component out\ncomponent in }\ncomponent right\n" +
        "left -> p.in\np.out -> right\np.out -> p.in",
    );
    expect(abs(out, "p.in")[0]).toBeLessThan(abs(out, "p.out")[0]);
    expect(abs(out, "left")[0]).toBeLessThan(abs(out, "p")[0]);
    expect(abs(out, "p")[0]).toBeLessThan(abs(out, "right")[0]);
  });

  it("widens a column gap to fit the label drawn in it", () => {
    const gap = (src: string) => {
      const map = layoutMap(laidOut(src));
      return map.get("b")!.at![0] - (map.get("a")!.at![0] + map.get("a")!.size![0]);
    };
    const plain = gap(HEADER + "component a\ncomponent b\na -> b");
    const labelled = gap(
      HEADER + 'component a\ncomponent b\na -> b @http : "a rather long label for this edge"',
    );
    expect(labelled).toBeGreaterThan(plain);
  });

  it("collapsed (display: icon) containers keep leaf size", () => {
    const map = layoutMap(
      laidOut(HEADER + "component p { component x }\nlayout { p: { at: [0, 0], display: icon } }"),
    );
    expect(map.get("p")!.size).toEqual([4, 3]);
    // Children still get laid out for when the plane is expanded.
    expect(map.get("p.x")!.at).toBeDefined();
  });

  it("avoids fixed entries when placing new nodes", () => {
    const out = laidOut(HEADER + "component a\ncomponent b\nlayout { a: { at: [0, 0], size: [4, 3] } }");
    const [a, b] = [layoutMap(out).get("a")!, layoutMap(out).get("b")!];
    expect(overlap({ at: a.at!, size: a.size! }, { at: b.at!, size: b.size! })).toBe(false);
  });

  it("wraps sibling-heavy scopes into multiple columns", () => {
    const src =
      HEADER +
      "component p { component a\ncomponent b\ncomponent c\ncomponent d\ncomponent e\ncomponent f }";
    const map = layoutMap(laidOut(src));
    const xs = new Set(["a", "b", "c", "d", "e", "f"].map((id) => map.get(`p.${id}`)!.at![0]));
    expect(xs.size).toBeGreaterThan(1); // not one endless column
    const p = map.get("p")!;
    expect(p.size![1]).toBeLessThan(25); // plane stays roughly rectangular
    const rs = rects(["a", "b", "c", "d", "e", "f"].map((id) => map.get(`p.${id}`)!));
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!)).toBe(false);
  });

  it("output validates cleanly and formats idempotently", () => {
    const out = laidOut(fixture("streaming.arch"));
    expect(validate(out)).toEqual([]);
    const once = format(out);
    expect(format(parse(once).doc)).toBe(once);
  });

  it("reset re-arranges everything but keeps collapsed containers collapsed", () => {
    const doc = parse(fixture("acme.arch")).doc;
    const out = autoLayout(doc, { reset: true });
    const map = layoutMap(out);
    expect(map.get("backend.db")!.display).toBe("icon");
    expect(map.get("web")!.at).not.toEqual([0, 3]);
    expect(map.get("web")!.at![0]).toBeLessThan(map.get("backend")!.at![0]);
    expectTidy(out);
  });

  it("stays tidy on large random documents", () => {
    let seed = 5;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let round = 0; round < 3; round++) {
      let src = HEADER;
      const paths: string[] = [];
      for (let p = 0; p < 5; p++) {
        src += `component p${p} {\n`;
        for (let i = 0; i < 6; i++) {
          if (i === 5 && p % 2 === 0) {
            src += `  component q${i} { component x\ncomponent y }\n`;
            paths.push(`p${p}.q${i}.x`, `p${p}.q${i}.y`);
          } else {
            src += `  component c${i}\n`;
            paths.push(`p${p}.c${i}`);
          }
        }
        src += "}\n";
      }
      for (let i = 0; i < 8; i++) {
        src += `component r${i}\n`;
        paths.push(`r${i}`);
      }
      for (let e = 0; e < 70; e++) {
        const a = paths[Math.floor(rand() * paths.length)]!;
        const b = paths[Math.floor(rand() * paths.length)]!;
        if (a !== b) src += `${a} ${["->", "<->", "--"][e % 3]} ${b}\n`;
      }
      const out = laidOut(src);
      expectTidy(out);
      // (Random connections may repeat — W302 — which is not layout's concern.)
      expect(validate(out).filter((d) => d.code !== "W302")).toEqual([]);
    }
  });
});

describe("autoLayout (existing positions)", () => {
  it("places a new component next to what it connects to", () => {
    const src =
      HEADER +
      "component a\ncomponent b\ncomponent c\na -> b\nb -> c\n" +
      "layout {\n  a: { at: [0, 0], size: [4, 3] }\n  b: { at: [7, 0], size: [4, 3] }\n}";
    const map = layoutMap(laidOut(src));
    expect(map.get("a")!.at).toEqual([0, 0]);
    expect(map.get("b")!.at).toEqual([7, 0]);
    // c is fed by b: to its right, on its row.
    expect(map.get("c")!.at![0]).toBeGreaterThan(7 + 4);
    expect(map.get("c")!.at![1]).toBe(0);
  });

  it("puts a new child inside its plane and grows the plane to fit", () => {
    const src =
      HEADER +
      "component p { component x\ncomponent y }\ncomponent q\np.x -> p.y\n" +
      "layout {\n  p: { at: [0, 0], size: [6, 6] }\n  p.x: { at: [1, 2], size: [4, 3] }\n  q: { at: [8, 0], size: [4, 3] }\n}";
    const out = laidOut(src);
    const map = layoutMap(out);
    expect(map.get("p.x")!.at).toEqual([1, 2]);
    expect(map.get("p.y")!.at![0]).toBeGreaterThan(1 + 4); // right of x, inside p
    expectTidy(out);
    // q was in the way of the grown plane: nudged aside rather than overlapped.
    expect(map.get("q")!.at![0]).toBeGreaterThanOrEqual(map.get("p")!.size![0] + 1);
  });

  it("re-fits a collapsed plane when it is expanded", () => {
    const src =
      HEADER +
      "component p { component x\ncomponent y }\ncomponent q\np.x -> p.y\np -> q\n" +
      "layout {\n  p: { at: [0, 0], size: [4, 3], display: icon }\n  p.x: { at: [1, 2], size: [4, 3] }\n" +
      "  p.y: { at: [8, 2], size: [4, 3] }\n  q: { at: [7, 0], size: [4, 3] }\n}";
    const expanded = autoLayout(setDisplay(parse(src).doc, ["p"], "plane"));
    const map = layoutMap(expanded);
    expect(map.get("p")!.display).toBe("plane");
    expect(map.get("p")!.size).toEqual([13, 6]);
    expectTidy(expanded);
  });

  it("lays out a new plane's interior and places it as a unit", () => {
    const src =
      HEADER +
      "component a\ncomponent p { component x\ncomponent y }\na -> p.x\np.x -> p.y\n" +
      "layout {\n  a: { at: [0, 0], size: [4, 3] }\n}";
    const out = laidOut(src);
    const map = layoutMap(out);
    expect(map.get("a")!.at).toEqual([0, 0]);
    expect(map.get("p")!.at![0]).toBeGreaterThan(4);
    expect(map.get("p.x")!.at![0]).toBeLessThan(map.get("p.y")!.at![0]);
    expectTidy(out);
  });
});
