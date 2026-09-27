import { describe, expect, it } from "vitest";
import {
  autoLayout,
  canvasAt,
  componentToPlane,
  duplicateComponents,
  extractFragment,
  findComponent,
  format,
  groupInPlane,
  insertFragment,
  layoutMap,
  nestInComponent,
  parse,
  relayoutComponents,
  setConnectionEndpoints,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.2\n';
const doc = (src: string) => parse(HEADER + src).doc;
const at = (d: ReturnType<typeof doc>, path: string) => layoutMap(d).get(path)?.at;
const size = (d: ReturnType<typeof doc>, path: string) => layoutMap(d).get(path)?.size;
const planeOf = (d: ReturnType<typeof doc>, path: string) =>
  findComponent(d, path.split("."))?.plane;
const conns = (d: ReturnType<typeof doc>) =>
  d.connections.map((c) => `${c.source.join(".")} ${c.arrow} ${c.target.join(".")}`).sort();

/** Two components and a plane with two more on it. */
const SAMPLE = `component web
component api
plane p {
  component db
  component cache
}
web -> api @http
api -> db @sql
api -> cache
layout {
  web: { at: [0, 0] }
  api: { at: [6, 0] }
  p: { at: [12, 0], size: [14, 7] }
  db: { at: [1, 2] }
  cache: { at: [7, 2] }
}`;

/** A component with two nested in it. */
const NESTED = `component web
component api {
  component db
  component cache
}
web -> api.db @sql
api.db -> api.cache
layout {
  web: { at: [0, 0] }
  api: { at: [6, 0] }
  api.db: { at: [0, 0] }
  api.cache: { at: [6, 0] }
}`;

describe("setConnectionEndpoints", () => {
  it("re-points a connection and keeps its type, label and payloads", () => {
    const d0 = doc(SAMPLE);
    const i = d0.connections.findIndex((c) => c.target.join(".") === "db");
    const d1 = setConnectionEndpoints(d0, i, ["web"], ["cache"]);
    expect(d1.connections[i]!.source).toEqual(["web"]);
    expect(d1.connections[i]!.target).toEqual(["cache"]);
    expect(d1.connections[i]!.type).toBe("sql");
    expect(d0.connections[i]!.source).toEqual(["api"]);
  });

  it("rejects dangling endpoints, planes and self-loops", () => {
    const d0 = doc(SAMPLE);
    expect(() => setConnectionEndpoints(d0, 0, ["nope"], ["api"])).toThrow(/does not exist/);
    expect(() => setConnectionEndpoints(d0, 0, ["web"], ["p"])).toThrow(/is a plane/);
    expect(() => setConnectionEndpoints(d0, 0, ["api"], ["api"])).toThrow(/itself/);
    expect(() => setConnectionEndpoints(d0, 99, ["web"], ["api"])).toThrow(/No connection/);
  });
});

describe("extractFragment", () => {
  it("copies components and planes with what's on them, internal connections only, anchored at [0, 0]", () => {
    const frag = extractFragment(doc(SAMPLE), [["api"], ["p"]]);
    expect(frag.components.map((c) => [c.id, c.plane])).toEqual([
      ["api", undefined],
      ["db", "p"],
      ["cache", "p"],
    ]);
    expect(frag.planes.map((p) => p.id)).toEqual(["p"]);
    // web -> api leaves the selection, so it stays behind.
    expect(conns(frag)).toEqual(["api -> cache", "api -> db"]);
    expect(at(frag, "api")).toEqual([0, 0]);
    expect(at(frag, "p")).toEqual([6, 0]);
    expect(size(frag, "p")).toEqual([14, 7]);
    expect(at(frag, "db")).toEqual([1, 2]);
    expect(validate(frag)).toEqual([]);
  });

  it("round-trips through text as a valid document", () => {
    const text = format(extractFragment(doc(SAMPLE), [["p"]]));
    const back = parse(text);
    expect(back.diagnostics).toEqual([]);
    expect(back.doc.planes.map((p) => p.id)).toEqual(["p"]);
    expect(back.doc.components.map((c) => c.id)).toEqual(["db", "cache"]);
  });

  it("ignores what's on a chosen plane or in a chosen component, and paths that don't exist", () => {
    const frag = extractFragment(doc(SAMPLE), [["p"], ["db"], ["ghost"]]);
    expect(frag.planes.map((p) => p.id)).toEqual(["p"]);
    expect(frag.components.map((c) => c.id)).toEqual(["db", "cache"]);
    const nested = extractFragment(doc(NESTED), [["api"], ["api", "db"]]);
    expect(nested.components.map((c) => c.id)).toEqual(["api"]);
    expect(nested.components[0]!.children.map((c) => c.id)).toEqual(["db", "cache"]);
    expect(conns(nested)).toEqual(["api.db -> api.cache"]);
  });

  it("takes things off their planes, where they are on the canvas", () => {
    const frag = extractFragment(doc(SAMPLE), [["web"], ["cache"]]);
    expect(frag.planes).toEqual([]);
    expect(frag.components.map((c) => [c.id, c.plane])).toEqual([
      ["web", undefined],
      ["cache", undefined],
    ]);
    // cache sits at p's corner [12, 0] plus [7, 2].
    expect(at(frag, "cache")).toEqual([19, 2]);
  });

  it("brings components from different canvases to one level, renaming clashes", () => {
    const d0 = doc(`component a { component x }
component b { component x }
a.x -> b.x`);
    const frag = extractFragment(d0, [["a", "x"], ["b", "x"]]);
    expect(frag.components.map((c) => c.id)).toEqual(["x", "x_2"]);
    expect(conns(frag)).toEqual(["x -> x_2"]);
  });
});

describe("insertFragment", () => {
  it("pastes at a position with fresh ids, remapped connections and layout", () => {
    const d0 = doc(SAMPLE);
    const frag = extractFragment(d0, [["api"], ["p"]]);
    const { doc: d1, paths } = insertFragment(d0, frag, [], [0, 10]);
    expect(paths).toEqual([["api_2"], ["p_2"]]);
    expect(conns(d1)).toContain("api_2 -> db_2");
    expect(conns(d1)).toContain("api_2 -> cache_2");
    expect(planeOf(d1, "db_2")).toBe("p_2");
    expect(at(d1, "api_2")).toEqual([0, 10]);
    expect(at(d1, "p_2")).toEqual([6, 10]);
    expect(at(d1, "db_2")).toEqual([1, 2]);
    // Originals are untouched.
    expect(at(d1, "api")).toEqual([6, 0]);
    expect(planeOf(d1, "db")).toBe("p");
    expect(validate(d1)).toEqual([]);
  });

  it("pastes onto a plane, keeping clear of its title row and growing it", () => {
    const d0 = doc(SAMPLE);
    const frag = extractFragment(d0, [["web"]]);
    const { doc: d1, paths } = insertFragment(d0, frag, [], [0, 0], "p");
    expect(paths).toEqual([["web_2"]]);
    expect(planeOf(d1, "web_2")).toBe("p");
    expect(at(d1, "web_2")).toEqual([1, 2]);
    const { doc: d2 } = insertFragment(d0, frag, [], [20, 2], "p");
    expect(size(d2, "p")![0]).toBeGreaterThanOrEqual(25);
    expect(() => insertFragment(d0, frag, [], [0, 0], "ghost")).toThrow(/No plane/);
  });

  it("pastes into a component's inside", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, paths } = insertFragment(d0, extractFragment(d0, [["web"]]), ["api"], [0, 0]);
    expect(paths).toEqual([["api", "web"]]);
    expect(at(d1, "api.web")).toEqual([0, 0]);
    expect(validate(d1)).toEqual([]);
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

describe("groupInPlane", () => {
  it("puts things on a plane sized around them, in place, paths and connections untouched", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, path } = groupInPlane(d0, [["web"], ["api"]]);
    expect(path).toEqual(["group"]);
    expect(d1.planes.find((p) => p.id === "group")!.name).toBe("Group");
    expect(planeOf(d1, "web")).toBe("group");
    expect(planeOf(d1, "api")).toBe("group");
    expect(conns(d1)).toEqual(conns(d0));
    // Everything keeps its place: group at [-1,-2] + [1,2] = [0,0].
    expect(at(d1, "group")).toEqual([-1, -2]);
    expect(at(d1, "web")).toEqual([1, 2]);
    expect(at(d1, "api")).toEqual([7, 2]);
    expect(size(d1, "group")).toEqual([12, 6]);
    expect(validate(d1)).toEqual([]);
  });

  it("puts the new plane on the plane its members share", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, path } = groupInPlane(d0, [["db"], ["cache"]], { name: "Stores" });
    expect(path).toEqual(["stores"]);
    expect(d1.planes.find((p) => p.id === "stores")!.plane).toBe("p");
    expect(planeOf(d1, "db")).toBe("stores");
    // The new plane can't reach above p's interior, so its members move down
    // to clear its title row, keeping their arrangement.
    expect(at(d1, "stores")).toEqual([1, 2]);
    expect(at(d1, "db")).toEqual([1, 2]);
    expect(at(d1, "cache")).toEqual([7, 2]);
    const shift = (p: string) => [0, 1].map((i) => canvasAt(d1, [p])[i]! - canvasAt(autoLayout(d0), [p])[i]!);
    expect(shift("db")).toEqual(shift("cache"));
    expect(validate(d1)).toEqual([]);
  });

  it("groups planes too", () => {
    const { doc: d1 } = groupInPlane(doc(SAMPLE), [["p"], ["api"]]);
    expect(d1.planes.find((p) => p.id === "p")!.plane).toBe("group");
    expect(format(d1)).toContain('plane group "Group" {\n  component api\n  plane p {');
  });

  it("refuses an empty selection, and one spread over canvases", () => {
    expect(() => groupInPlane(doc(SAMPLE), [["ghost"]])).toThrow(/Nothing/);
    expect(() => groupInPlane(doc(NESTED), [["web"], ["api", "db"]])).toThrow(/one canvas/);
  });
});

describe("nestInComponent", () => {
  it("nests components in a new one that takes their place", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, path } = nestInComponent(d0, [["web"], ["api"]]);
    expect(path).toEqual(["group"]);
    // The group takes the first member's slot in document order.
    expect(d1.components.map((c) => c.id)).toEqual(["group", "db", "cache"]);
    expect(d1.components[0]!.children.map((c) => c.id)).toEqual(["web", "api"]);
    expect(conns(d1)).toEqual(["group.api -> cache", "group.api -> db", "group.web -> group.api"]);
    expect(at(d1, "group")).toEqual([0, 0]);
    // Inside, they keep their arrangement, from the corner.
    expect(at(d1, "group.web")).toEqual([0, 0]);
    expect(at(d1, "group.api")).toEqual([6, 0]);
    expect(validate(d1)).toEqual([]);
  });

  it("puts the new component on the plane its members share", () => {
    const { doc: d1, path } = nestInComponent(doc(SAMPLE), [["db"], ["cache"]], { name: "Stores" });
    expect(path).toEqual(["stores"]);
    expect(planeOf(d1, "stores")).toBe("p");
    expect(at(d1, "stores")).toEqual([1, 2]);
    expect(planeOf(d1, "stores.db")).toBeUndefined();
    expect(validate(d1)).toEqual([]);
  });

  it("refuses planes", () => {
    expect(() => nestInComponent(doc(SAMPLE), [["p"], ["web"]])).toThrow(/Planes stay/);
  });
});

describe("componentToPlane", () => {
  it("turns a component into a plane, what was in it now on the plane with shorter paths", () => {
    const d0 = doc(NESTED.replace("web -> api.db @sql", "web -> api.db @sql\nweb -> api.cache"));
    const { doc: d1, path } = componentToPlane(d0, ["api"]);
    expect(path).toEqual(["api"]);
    expect(d1.planes.map((p) => p.id)).toEqual(["api"]);
    expect(d1.components.map((c) => [c.id, c.plane])).toEqual([
      ["web", undefined],
      ["db", "api"],
      ["cache", "api"],
    ]);
    expect(conns(d1)).toEqual(["db -> cache", "web -> cache", "web -> db"]);
    // Where the component was; its contents from the plane's inner corner.
    expect(at(d1, "api")).toEqual([6, 0]);
    expect(at(d1, "db")).toEqual([1, 2]);
    expect(at(d1, "cache")).toEqual([7, 2]);
    expect(validate(d1)).toEqual([]);
  });

  it("renames what would clash on the new level, and keeps the planes inside", () => {
    const d0 = doc(`component db
component api {
  component db
  plane jobs {
    component worker
  }
}
api.db -> db`);
    const { doc: d1 } = componentToPlane(d0, ["api"]);
    expect(d1.components.map((c) => [c.id, c.plane])).toEqual([
      ["db", undefined],
      ["db_2", "api"],
      ["worker", "jobs"],
    ]);
    expect(d1.planes.map((p) => [p.id, p.plane])).toEqual([
      ["api", undefined],
      ["jobs", "api"],
    ]);
    expect(conns(d1)).toEqual(["db_2 -> db"]);
    expect(validate(d1)).toEqual([]);
  });

  it("refuses a component with connections, payloads or a src of its own", () => {
    expect(() => componentToPlane(doc(`component a\ncomponent b { component c }\na -> b`), ["b"])).toThrow(
      /connections of its own/,
    );
    expect(() => componentToPlane(doc(`component b {\n  src "x"\n}`), ["b"])).toThrow(/src/);
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

  it("re-lays what's on a plane from its origin and fits the plane to it", () => {
    const d0 = doc(`plane p {
  component x
  component y
}
layout {
  p: { at: [0, 0], size: [40, 40] }
  x: { at: [30, 30] }
  y: { at: [5, 20] }
}`);
    const d1 = relayoutComponents(d0, [["x"], ["y"]]);
    expect(at(d1, "x")).toEqual([1, 2]);
    expect(size(d1, "p")![0]).toBeLessThan(40);
    const fresh = autoLayout(parse(`${HEADER}plane p {\n  component x\n  component y\n}`).doc);
    expect(size(d1, "p")).toEqual(size(fresh, "p"));
  });

  it("re-lays a plane with what's on it, and a component's inside with it", () => {
    const d0 = doc(`plane p {
  component x
}
component c {
  component y
  component z
}
c.y -> c.z
layout {
  p: { at: [0, 0], size: [30, 30] }
  x: { at: [20, 20] }
  c: { at: [40, 0] }
  c.y: { at: [50, 50] }
  c.z: { at: [0, 0] }
}`);
    const d1 = relayoutComponents(d0, [["p"], ["c"]]);
    expect(at(d1, "x")).toEqual([1, 2]);
    const fresh = autoLayout(parse(`${HEADER}plane p {\n  component x\n}`).doc);
    expect(size(d1, "p")).toEqual(size(fresh, "p"));
    expect(at(d1, "c.y")).toEqual([0, 0]);
    expect(at(d1, "c.y")![0]).toBeLessThan(at(d1, "c.z")![0]);
  });
});

describe("duplicateComponents", () => {
  it("copies next to the originals on their plane, shifted a cell, with internal connections", () => {
    const d0 = doc(SAMPLE);
    const { doc: d1, paths } = duplicateComponents(d0, [["db"], ["cache"]]);
    expect(paths).toEqual([["db_2"], ["cache_2"]]);
    expect(planeOf(d1, "db_2")).toBe("p");
    expect(at(d1, "db_2")).toEqual([2, 3]);
    expect(at(d1, "cache_2")).toEqual([8, 3]);
    // api -> db leaves the selection, so the copies aren't wired to api.
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

  it("copies a plane with everything on it", () => {
    const { doc: d1, paths } = duplicateComponents(doc(SAMPLE), [["p"]]);
    expect(paths).toEqual([["p_2"]]);
    expect(at(d1, "p_2")).toEqual([13, 1]);
    expect(planeOf(d1, "db_2")).toBe("p_2");
    expect(at(d1, "db_2")).toEqual([1, 2]);
    expect(validate(d1)).toEqual([]);
  });

  it("copies a component with its inside", () => {
    const { doc: d1, paths } = duplicateComponents(doc(NESTED), [["api"]]);
    expect(paths).toEqual([["api_2"]]);
    expect(conns(d1)).toContain("api_2.db -> api_2.cache");
    expect(at(d1, "api_2.cache")).toEqual([6, 0]);
  });
});
