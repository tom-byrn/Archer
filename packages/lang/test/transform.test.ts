import { describe, expect, it } from "vitest";
import {
  addComponent,
  addConnection,
  addPlane,
  canvasAt,
  format,
  layoutMap,
  moveComponent,
  parse,
  removeComponent,
  removeConnection,
  removeConnectionPayload,
  removePlane,
  renameComponent,
  renamePlane,
  reparentComponent,
  resizeComponent,
  setComponentMeta,
  setConnectionMeta,
  setConnectionPayload,
  setPayload,
  setPlane,
  setPlaneMeta,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.2\n';
const doc = (src: string) => parse(src).doc;

describe("transforms", () => {
  it("addComponent generates fresh ids and layout entries", () => {
    const d0 = doc(HEADER + "component postgres");
    const { doc: d1, path } = addComponent(d0, [], {
      type: "postgres",
      at: [4, 4],
    });
    expect(path).toEqual(["postgres_2"]);
    expect(layoutMap(d1).get("postgres_2")!.at).toEqual([4, 4]);
    expect(validate(d1)).toEqual([]);
    // Original untouched.
    expect(d0.components).toHaveLength(1);
  });

  it("addComponent onto a plane grows the plane", () => {
    const d0 = doc(
      HEADER + "plane p { component x }\nlayout { p: { at: [0,0], size: [6,5] } }",
    );
    const { doc: d1, path } = addComponent(d0, [], { id: "y", plane: "p", at: [10, 8] });
    expect(path).toEqual(["y"]);
    expect(d1.components[1]!.plane).toBe("p");
    const p = layoutMap(d1).get("p")!;
    expect(p.size![0]).toBeGreaterThanOrEqual(15);
    expect(p.size![1]).toBeGreaterThanOrEqual(12);
    expect(() => addComponent(d0, [], { plane: "ghost" })).toThrow(/No plane 'ghost'/);
    // A plane's id is taken in its scope.
    expect(addComponent(d0, [], { name: "P" }).path).toEqual(["p_2"]);
  });

  it("addComponent into a component nests it on its own canvas", () => {
    const d0 = doc(HEADER + "component c\nlayout { c: { at: [0,0], size: [4,3] } }");
    const { doc: d1, path } = addComponent(d0, ["c"], { id: "x", at: [-2, 7] });
    expect(path).toEqual(["c", "x"]);
    expect(layoutMap(d1).get("c.x")!.at).toEqual([-2, 7]);
    expect(layoutMap(d1).get("c")!.size).toEqual([4, 3]);
  });

  it("removeComponent drops the subtree, its connections, and layout", () => {
    const d0 = doc(
      HEADER +
        "component a\ncomponent p { component x }\na -> p.x\np.x -> a\nlayout { p.x: { at: [1,2] } }",
    );
    const d1 = removeComponent(d0, ["p"]);
    expect(d1.components.map((c) => c.id)).toEqual(["a"]);
    expect(d1.connections).toEqual([]);
    expect(d1.layout).toEqual([]);
    expect(validate(d1)).toEqual([]);
  });

  it("renameComponent rewrites connection and layout paths", () => {
    const d0 = doc(
      HEADER +
        "component b { component api }\ncomponent w\nw -> b.api\nlayout { b.api: { at: [1,2] } }",
    );
    const d1 = renameComponent(d0, ["b"], "backend");
    expect(d1.components[0]!.id).toBe("backend");
    expect(d1.connections[0]!.target).toEqual(["backend", "api"]);
    expect(layoutMap(d1).get("backend.api")).toBeDefined();
    expect(validate(d1)).toEqual([]);
    expect(() => renameComponent(d1, ["backend"], "w")).toThrow(/Duplicate/);
    expect(() => renameComponent(d1, ["backend"], "Bad-Id")).toThrow(/Invalid/);
  });

  it("setComponentMeta sets and clears fields", () => {
    const d0 = doc(HEADER + 'component a "Name" @t { desc "d" }');
    const d1 = setComponentMeta(d0, ["a"], { name: null, type: "postgres", desc: "x" });
    expect(d1.components[0]!.name).toBeUndefined();
    expect(d1.components[0]!.type).toBe("postgres");
    expect(d1.components[0]!.desc).toBe("x");
  });

  it("setPayload creates then updates; invalid names throw", () => {
    const d0 = doc(HEADER + "component a");
    const d1 = setPayload(d0, ["a"], "schema", "json", "{}");
    const d2 = setPayload(d1, ["a"], "schema", "yaml", "x: 1");
    expect(d2.components[0]!.payloads).toHaveLength(1);
    expect(d2.components[0]!.payloads[0]!.format).toBe("yaml");
    expect(() => setPayload(d0, ["a"], "Bad Name", "json", "{}")).toThrow(/Invalid/);
  });

  it("setConnectionPayload / removeConnectionPayload address by index", () => {
    const d0 = doc(HEADER + "component a\ncomponent b\na -> b @queue");
    const d1 = setConnectionPayload(d0, 0, "message", "json", '{"id": "uuid"}');
    expect(d1.connections[0]!.payloads).toHaveLength(1);
    const d2 = setConnectionPayload(d1, 0, "message", "yaml", "id: uuid");
    expect(d2.connections[0]!.payloads).toHaveLength(1);
    expect(d2.connections[0]!.payloads[0]!.format).toBe("yaml");
    expect(() => setConnectionPayload(d0, 0, "Bad", "json", "{}")).toThrow(/Invalid/);
    expect(() => setConnectionPayload(d0, 3, "m", "json", "{}")).toThrow(/No connection/);
    const d3 = removeConnectionPayload(d2, 0, "message");
    expect(d3.connections[0]!.payloads).toEqual([]);
    expect(d0.connections[0]!.payloads).toEqual([]); // inputs are never mutated
  });

  it("moveComponent writes layout and clamps what's on a plane to its interior", () => {
    const d0 = doc(HEADER + "plane p { component x }\ncomponent c { component y }");
    expect(layoutMap(moveComponent(d0, ["x"], [0, 0])).get("x")!.at).toEqual([1, 2]);
    // Top-level and nested components (each on its own canvas) may go negative.
    expect(layoutMap(moveComponent(d0, ["c"], [-5, -5])).get("c")!.at).toEqual([-5, -5]);
    expect(layoutMap(moveComponent(d0, ["c", "y"], [-5, -5])).get("c.y")!.at).toEqual([-5, -5]);
  });

  it("moveComponent grows the planes under it to fit", () => {
    const d0 = doc(
      HEADER +
        "plane p { plane q { component x } }\nlayout {\n  p: { at: [0,0], size: [8,7] }\n  q: { at: [1,2], size: [6,5] }\n}",
    );
    const d1 = moveComponent(d0, ["x"], [9, 9]);
    const map = layoutMap(d1);
    expect(map.get("q")!.size).toEqual([14, 13]);
    expect(map.get("p")!.size).toEqual([16, 16]);
  });

  it("resizeComponent resizes planes and grows the ones under them", () => {
    const d0 = doc(
      HEADER + "plane p { plane q }\nlayout {\n  p: { at: [0,0], size: [8,7] }\n  q: { at: [1,2], size: [6,4] }\n}",
    );
    const map = layoutMap(resizeComponent(d0, ["q"], [12, 6]));
    expect(map.get("q")!.size).toEqual([12, 6]);
    expect(map.get("p")!.size).toEqual([14, 9]);
  });

  it("addConnection validates endpoints and self-loops", () => {
    const d0 = doc(HEADER + "component a\ncomponent b { component c }");
    const d1 = addConnection(d0, ["a"], ["b", "c"], { type: "http", label: "x" });
    expect(d1.connections).toHaveLength(1);
    expect(validate(d1)).toEqual([]);
    expect(() => addConnection(d0, ["a"], ["ghost"])).toThrow(/does not exist/);
    expect(() => addConnection(d0, ["a"], ["a"])).toThrow(/itself/);
  });

  it("removeConnection and setConnectionMeta address by index", () => {
    const d0 = doc(HEADER + "component a\ncomponent b\na -> b\nb -> a");
    const d1 = setConnectionMeta(d0, 1, { arrow: "<->", type: "sql", label: "q" });
    expect(d1.connections[1]!.arrow).toBe("<->");
    const d2 = setConnectionMeta(d1, 1, { type: null });
    expect(d2.connections[1]!.type).toBeUndefined();
    const d3 = removeConnection(d2, 0);
    expect(d3.connections).toHaveLength(1);
  });

  it("reparentComponent moves subtrees and rewrites paths", () => {
    const d0 = doc(
      HEADER +
        "component p { component x { component y } }\ncomponent q\np.x.y -> q\nlayout { p.x: { at: [1,2] } }",
    );
    const d1 = reparentComponent(d0, ["p", "x"], ["q"] , [1, 2]);
    expect(d1.components[0]!.children).toEqual([]);
    expect(d1.components[1]!.children[0]!.id).toBe("x");
    expect(d1.connections[0]!.source).toEqual(["q", "x", "y"]);
    expect(validate(d1)).toEqual([]);
    expect(() => reparentComponent(d0, ["p"], ["p", "x"])).toThrow(/own subtree/);
  });

  it("reparent to root with an id collision renames", () => {
    const d0 = doc(HEADER + "component x\ncomponent p { component x }");
    const d1 = reparentComponent(d0, ["p", "x"], []);
    expect(d1.components.map((c) => c.id).sort()).toEqual(["p", "x", "x_2"]);
    expect(validate(d1)).toEqual([]);
  });

  it("reparentComponent can land on a plane of the new canvas", () => {
    const d0 = doc(HEADER + "component a\ncomponent c { plane p }\nplane q {\n  component b\n}");
    const d1 = reparentComponent(d0, ["b"], ["c"], [1, 2], "p");
    const c = d1.components.find((x) => x.id === "c")!;
    expect(c.children.map((x) => [x.id, x.plane])).toEqual([["b", "p"]]);
    // Off its old plane, and onto none unless one is named.
    const d2 = reparentComponent(d0, ["b"], ["a"]);
    expect(d2.components[0]!.children[0]!.plane).toBeUndefined();
    expect(() => reparentComponent(d0, ["b"], ["c"], undefined, "q")).toThrow(/No plane 'q'/);
  });

  it("every transform result formats and reparses cleanly", () => {
    let d = doc(HEADER + "component a");
    d = addComponent(d, [], { type: "aws.s3", at: [6, 0] }).doc;
    d = addConnection(d, ["a"], ["s3"]);
    d = setPayload(d, ["a"], "notes", "markdown", "hello");
    d = setConnectionPayload(d, 0, "objects", "table", "| key |\n| --- |\n| a/b |");
    d = moveComponent(d, ["a"], [0, 5]);
    const text = format(d);
    const re = parse(text);
    expect(re.diagnostics).toEqual([]);
    expect(format(re.doc)).toBe(text);
  });
});

describe("plane transforms", () => {
  const SHOP = `plane back "Back" @vercel {
  component api
  plane data "Data" {
    component db
  }
}
component web
web -> api
api -> db
layout {
  back: { at: [10, 0], size: [16, 12] }
  api: { at: [1, 2], size: [4, 3] }
  data: { at: [7, 2], size: [8, 7] }
  db: { at: [1, 2], size: [4, 3] }
  web: { at: [0, 0], size: [4, 3] }
}`;

  it("addPlane names it after its name, onto another plane when asked", () => {
    const { doc: d1, path } = addPlane(doc(HEADER + SHOP), [], { name: "Edge", plane: "back", at: [0, 0] });
    expect(path).toEqual(["edge"]);
    expect(d1.planes.find((p) => p.id === "edge")).toMatchObject({ name: "Edge", plane: "back" });
    // Clamped into back's interior, with an empty plane's room.
    expect(layoutMap(d1).get("edge")).toMatchObject({ at: [1, 2], size: [10, 6] });
    expect(() => addPlane(d1, [], { id: "web" })).toThrow(/Duplicate/);
    const inside = addPlane(d1, ["web"], {});
    expect(inside.path).toEqual(["web", "plane"]);
    expect(validate(inside.doc)).toEqual([]);
  });

  it("removePlane keeps what's on it where it is, or takes it along", () => {
    const d0 = doc(HEADER + SHOP);
    const kept = removePlane(d0, ["data"], { keepContents: true });
    expect(kept.planes.map((p) => p.id)).toEqual(["back"]);
    expect(kept.components.find((c) => c.id === "db")!.plane).toBe("back");
    // Same place on the canvas: data's corner plus db's spot on it.
    expect(layoutMap(kept).get("db")!.at).toEqual([8, 4]);
    expect(canvasAt(kept, ["db"])).toEqual(canvasAt(d0, ["db"]));
    expect(layoutMap(kept).has("data")).toBe(false);

    const gone = removePlane(d0, ["back"]);
    expect(gone.planes).toEqual([]);
    expect(gone.components.map((c) => c.id)).toEqual(["web"]);
    expect(gone.connections).toEqual([]);
    expect([...layoutMap(gone).keys()]).toEqual(["web"]);
    expect(validate(gone)).toEqual([]);
  });

  it("renamePlane moves what's on it along", () => {
    const d1 = renamePlane(doc(HEADER + SHOP), ["data"], "storage");
    expect(d1.components.find((c) => c.id === "db")!.plane).toBe("storage");
    expect(layoutMap(d1).get("storage")!.at).toEqual([7, 2]);
    expect(validate(d1)).toEqual([]);
    expect(() => renamePlane(d1, ["storage"], "api")).toThrow(/Duplicate/);
    expect(() => renamePlane(d1, ["storage"], "Nope")).toThrow(/Invalid/);
  });

  it("setPlaneMeta sets and clears a plane's name, type and description", () => {
    const d1 = setPlaneMeta(doc(HEADER + SHOP), ["back"], { name: null, type: "aws", desc: "All of it" });
    expect(d1.planes[0]).toMatchObject({ id: "back", type: "aws", desc: "All of it" });
    expect(d1.planes[0]!.name).toBeUndefined();
  });

  it("setPlane moves things between planes without changing paths or places", () => {
    const d0 = doc(HEADER + SHOP);
    const d1 = setPlane(d0, ["web"], "data");
    expect(d1.components.find((c) => c.id === "web")!.plane).toBe("data");
    // web sat left of data's corner, so it lands at the start of data's interior.
    expect(layoutMap(d1).get("web")!.at).toEqual([1, 2]);
    expect(d1.connections).toEqual(d0.connections);
    // Off every plane, keeping its place.
    const d2 = setPlane(d0, ["db"], null);
    expect(d2.components.find((c) => c.id === "db")!.plane).toBeUndefined();
    expect(canvasAt(d2, ["db"])).toEqual(canvasAt(d0, ["db"]));
    // A given spot is relative to the new plane.
    expect(layoutMap(setPlane(d0, ["web"], "back", [3, 8])).get("web")!.at).toEqual([3, 8]);
    // Planes move too, but never onto themselves.
    expect(setPlane(d0, ["data"], null).planes.find((p) => p.id === "data")!.plane).toBeUndefined();
    expect(() => setPlane(d0, ["back"], "data")).toThrow(/on itself/);
    expect(() => setPlane(d0, ["web"], "ghost")).toThrow(/No plane/);
  });

  it("addConnection refuses a plane as an end", () => {
    expect(() => addConnection(doc(HEADER + SHOP), ["web"], ["back"])).toThrow(/is a plane/);
  });
});

// The canvas draws documents with errors too, so a plane and a component
// sharing an id (E002) must not send anything into a loop.
describe("a plane and a component with one id", () => {
  const CLASH = doc(`${HEADER}
plane x "X" {
  component x "Also X"
  component y
}

layout {
  x: { at: [5, 5], size: [8, 6] }
}
`);

  it("still resolves positions and edits", () => {
    expect(validate(CLASH).map((d) => d.code)).toContain("E002");
    expect(canvasAt(CLASH, ["x"])).toHaveLength(2);
    expect(layoutMap(moveComponent(CLASH, ["y"], [2, 3])).get("y")?.at).toEqual([2, 3]);
    expect(resizeComponent(CLASH, ["x"], [9, 9])).toBeTruthy();
  });
});

