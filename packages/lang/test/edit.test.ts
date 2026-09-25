import { describe, expect, it } from "vitest";
import {
  autoLayout,
  duplicateComponents,
  extractFragment,
  format,
  groupComponents,
  insertFragment,
  layoutMap,
  parse,
  relayoutComponents,
  setConnectionEndpoints,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.1\n';
const doc = (src: string) => parse(HEADER + src).doc;
const at = (d: ReturnType<typeof doc>, path: string) => layoutMap(d).get(path)?.at;
const size = (d: ReturnType<typeof doc>, path: string) => layoutMap(d).get(path)?.size;
const conns = (d: ReturnType<typeof doc>) =>
  d.connections.map((c) => `${c.source.join(".")} ${c.arrow} ${c.target.join(".")}`).sort();

const SAMPLE = `component web
component api
component p {
  component db
  component cache
}
web -> api @http
api -> p.db @sql
api -> p.cache
layout {
  web: { at: [0, 0] }
  api: { at: [6, 0] }
  p: { at: [12, 0], size: [14, 7] }
  p.db: { at: [1, 2] }
  p.cache: { at: [7, 2] }
}`;

describe("setConnectionEndpoints", () => {
  it("re-points a connection and keeps its type, label and payloads", () => {
    const d0 = doc(SAMPLE);
    const i = d0.connections.findIndex((c) => c.target.join(".") === "p.db");
    const d1 = setConnectionEndpoints(d0, i, ["web"], ["p", "cache"]);
    expect(d1.connections[i]!.source).toEqual(["web"]);
    expect(d1.connections[i]!.target).toEqual(["p", "cache"]);
    expect(d1.connections[i]!.type).toBe("sql");
    expect(d0.connections[i]!.source).toEqual(["api"]);
  });

  it("rejects dangling endpoints and self-loops", () => {
    const d0 = doc(SAMPLE);
    expect(() => setConnectionEndpoints(d0, 0, ["nope"], ["api"])).toThrow(/does not exist/);
    expect(() => setConnectionEndpoints(d0, 0, ["api"], ["api"])).toThrow(/itself/);
    expect(() => setConnectionEndpoints(d0, 99, ["web"], ["api"])).toThrow(/No connection/);
  });
});

describe("extractFragment", () => {
  it("copies subtrees with their internal connections only, anchored at [0, 0]", () => {
    const frag = extractFragment(doc(SAMPLE), [["api"], ["p"]]);
    expect(frag.components.map((c) => c.id)).toEqual(["api", "p"]);
    expect(frag.components[1]!.children.map((c) => c.id)).toEqual(["db", "cache"]);
    // web -> api leaves the selection, so it stays behind.
    expect(conns(frag)).toEqual(["api -> p.cache", "api -> p.db"]);
    expect(at(frag, "api")).toEqual([0, 0]);
    expect(at(frag, "p")).toEqual([6, 0]);
    expect(size(frag, "p")).toEqual([14, 7]);
    expect(at(frag, "p.db")).toEqual([1, 2]);
    expect(validate(frag)).toEqual([]);
  });

  it("round-trips through text as a valid document", () => {
    const text = format(extractFragment(doc(SAMPLE), [["p"]]));
    const back = parse(text);
    expect(back.diagnostics).toEqual([]);
    expect(back.doc.components.map((c) => c.id)).toEqual(["p"]);
  });

  it("ignores paths inside another selected path and ones that don't exist", () => {
    const frag = extractFragment(doc(SAMPLE), [["p"], ["p", "db"], ["ghost"]]);
    expect(frag.components.map((c) => c.id)).toEqual(["p"]);
  });

  it("brings children of different parents to one level, renaming clashes", () => {
    const d0 = doc(`component a { component x }
component b { component x }
a.x -> b.x
layout {
  a: { at: [0, 0], size: [6, 6] }
  a.x: { at: [1, 2] }
  b: { at: [10, 0], size: [6, 6] }
  b.x: { at: [1, 2] }
}`);
    const frag = extractFragment(d0, [["a", "x"], ["b", "x"]]);
    expect(frag.components.map((c) => c.id)).toEqual(["x", "x_2"]);
    expect(conns(frag)).toEqual(["x -> x_2"]);
    // Absolute positions (0+1, 10+1) keep their spacing.
    expect(at(frag, "x")).toEqual([0, 0]);
    expect(at(frag, "x_2")).toEqual([10, 0]);
  });
});

describe("insertFragment", () => {
  it("pastes at a position with fresh ids, remapped connections and layout", () => {
    const d0 = doc(SAMPLE);
    const frag = extractFragment(d0, [["api"], ["p"]]);
    const { doc: d1, paths } = insertFragment(d0, frag, [], [0, 10]);
    expect(paths).toEqual([["api_2"], ["p_2"]]);
    expect(conns(d1)).toContain("api_2 -> p_2.db");
    expect(conns(d1)).toContain("api_2 -> p_2.cache");
    expect(at(d1, "api_2")).toEqual([0, 10]);
    expect(at(d1, "p_2")).toEqual([6, 10]);
    expect(at(d1, "p_2.db")).toEqual([1, 2]);
    // Originals are untouched.
    expect(at(d1, "api")).toEqual([6, 0]);
    expect(validate(d1)).toEqual([]);
  });

  it("pastes into a plane, keeping clear of its title row and growing it", () => {
    const d0 = doc(SAMPLE);
    const frag = extractFragment(d0, [["web"]]);
    const { doc: d1, paths } = insertFragment(d0, frag, ["p"], [0, 0]);
    expect(paths).toEqual([["p", "web"]]);
    expect(at(d1, "p.web")).toEqual([1, 2]);
    const { doc: d2 } = insertFragment(d0, frag, ["p"], [20, 2]);
    expect(size(d2, "p")![0]).toBeGreaterThanOrEqual(25);
  });

  it("accepts foreign text without a layout and drops dangling connections", () => {
    const foreign = parse(`${HEADER}component q\ncomponent r\nq -> r\nq -> elsewhere`).doc;
    const { doc: d1, paths } = insertFragment(doc(SAMPLE), foreign, [], [30, 0]);
    expect(paths).toEqual([["q"], ["r"]]);
    expect(conns(d1)).toContain("q -> r");
    expect(conns(d1).some((c) => c.includes("elsewhere"))).toBe(false);
    expect(at(d1, "q")).toEqual([30, 0]);
  });
});

describe("groupComponents", () => {
  it("wraps siblings in a container sized around them, in place", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, path } = groupComponents(d0, [["web"], ["api"]]);
    expect(path).toEqual(["group"]);
    // The group takes the first member's slot in document order.
    expect(d1.components.map((c) => c.id)).toEqual(["group", "p"]);
    expect(d1.components[0]!.name).toBe("Group");
    expect(d1.components[0]!.children.map((c) => c.id)).toEqual(["web", "api"]);
    expect(conns(d1)).toEqual(["group.api -> p.cache", "group.api -> p.db", "group.web -> group.api"]);
    // Children keep their absolute position: group at [-1,-2] + child [1,2] = [0,0].
    expect(at(d1, "group")).toEqual([-1, -2]);
    expect(at(d1, "group.web")).toEqual([1, 2]);
    expect(at(d1, "group.api")).toEqual([7, 2]);
    expect(size(d1, "group")).toEqual([12, 6]);
    expect(validate(d1)).toEqual([]);
  });

  it("groups across parents into the common ancestor", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, path } = groupComponents(d0, [["api"], ["p", "db"]], { name: "Core" });
    expect(path).toEqual(["core"]);
    expect(d1.components.find((c) => c.id === "core")!.children.map((c) => c.id)).toEqual([
      "api",
      "db",
    ]);
    expect(conns(d1)).toContain("core.api -> core.db");
    expect(validate(d1)).toEqual([]);
  });

  it("refuses an empty selection", () => {
    expect(() => groupComponents(doc(SAMPLE), [["ghost"]])).toThrow(/Nothing/);
  });
});

describe("relayoutComponents", () => {
  const MESSY = `component a
component b
component c
component far
a -> b
b -> c
layout {
  a: { at: [40, 40] }
  b: { at: [3, 30] }
  c: { at: [20, 1] }
  far: { at: [100, 100] }
}`;

  it("arranges a selection among itself, keeping its top-left and the rest in place", () => {
    // a, b and c aren't the whole level, so they anchor at their old top-left [3, 1].
    const d1 = relayoutComponents(doc(MESSY), [["a"], ["b"], ["c"]]);
    const [ax, ay] = at(d1, "a")!;
    const [bx] = at(d1, "b")!;
    const [cx] = at(d1, "c")!;
    expect([ax, ay]).toEqual([3, 1]);
    expect(ax < bx && bx < cx).toBe(true);
    expect(at(d1, "far")).toEqual([100, 100]);
  });

  it("starts a whole level at the origin", () => {
    const d1 = relayoutComponents(doc(MESSY), [["a"], ["b"], ["c"], ["far"]]);
    const ats = ["a", "b", "c", "far"].map((p) => at(d1, p)!);
    expect(Math.min(...ats.map((a) => a[0]))).toBe(0);
    expect(Math.min(...ats.map((a) => a[1]))).toBe(0);
  });

  it("re-lays a plane's children from its origin and fits the plane to them", () => {
    const d0 = doc(`component p {
  component x
  component y
}
layout {
  p: { at: [0, 0], size: [40, 40] }
  p.x: { at: [30, 30] }
  p.y: { at: [5, 20] }
}`);
    const d1 = relayoutComponents(d0, [["p", "x"], ["p", "y"]]);
    expect(at(d1, "p.x")).toEqual([1, 2]);
    expect(size(d1, "p")![0]).toBeLessThan(40);
    const fresh = autoLayout(parse(`${HEADER}component p {\n  component x\n  component y\n}`).doc);
    expect(size(d1, "p")).toEqual(size(fresh, "p"));
  });

  it("keeps collapsed containers collapsed", () => {
    const d0 = doc(`component p {
  component x
}
layout {
  p: { at: [9, 9], display: icon }
}`);
    const d1 = relayoutComponents(d0, [["p"]]);
    expect(layoutMap(d1).get("p")!.display).toBe("icon");
  });
});

describe("duplicateComponents", () => {
  it("copies next to the originals, shifted a cell, with internal connections", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, paths } = duplicateComponents(d0, [["p", "db"], ["p", "cache"]]);
    expect(paths).toEqual([["p", "db_2"], ["p", "cache_2"]]);
    expect(at(d1, "p.db_2")).toEqual([2, 3]);
    expect(at(d1, "p.cache_2")).toEqual([8, 3]);
    // api -> p.db leaves the selection, so the copies aren't wired to api.
    expect(conns(d1).filter((c) => c.includes("_2"))).toEqual([]);
    expect(validate(d1)).toEqual([]);
  });

  it("numbers copies of copies on from the original's number", () => {
    const d0 = doc(SAMPLE);
    const once = duplicateComponents(d0, [["web"]]);
    const twice = duplicateComponents(once.doc, once.paths);
    expect(once.paths).toEqual([["web_2"]]);
    expect(twice.paths).toEqual([["web_3"]]);
  });

  it("copies a container with its insides", () => {
    const { doc: d1, paths } = duplicateComponents(doc(SAMPLE), [["p"]]);
    expect(paths).toEqual([["p_2"]]);
    expect(at(d1, "p_2")).toEqual([13, 1]);
    expect(at(d1, "p_2.db")).toEqual([1, 2]);
  });
});
