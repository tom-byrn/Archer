import { describe, expect, it } from "vitest";
import {
  addComponent,
  addConnection,
  autoLayout,
  format,
  layoutMap,
  moveComponent,
  parse,
  removeComponent,
  removeConnection,
  removeConnectionPayload,
  renameComponent,
  reparentComponent,
  setComponentMeta,
  setConnectionMeta,
  setConnectionPayload,
  setDisplay,
  setPayload,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.1\n';
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

  it("addComponent with a size but no position lets auto-layout place it at that size", () => {
    const d0 = doc(HEADER + "component a\nlayout { a: { at: [0, 0] } }");
    const { doc: d1 } = addComponent(d0, [], { type: "block", size: [6, 4] });
    expect(layoutMap(d1).get("block")).toMatchObject({ size: [6, 4] });
    expect(layoutMap(d1).get("block")!.at).toBeUndefined();
    // Survives the canonical round trip, then gets a place and keeps its size.
    const laid = autoLayout(parse(format(d1)).doc);
    expect(layoutMap(laid).get("block")).toMatchObject({ size: [6, 4] });
    expect(layoutMap(laid).get("block")!.at).toBeDefined();
    expect(layoutMap(laid).get("a")!.at).toEqual([0, 0]);
  });

  it("addComponent into a parent grows the parent plane", () => {
    const d0 = doc(
      HEADER + "component p { component x }\nlayout { p: { at: [0,0], size: [6,5] } }",
    );
    const { doc: d1 } = addComponent(d0, ["p"], { id: "y", at: [10, 8] });
    const p = layoutMap(d1).get("p")!;
    expect(p.size![0]).toBeGreaterThanOrEqual(15);
    expect(p.size![1]).toBeGreaterThanOrEqual(12);
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

  it("moveComponent writes layout and clamps children to the plane interior", () => {
    const d0 = doc(HEADER + "component p { component x }");
    const d1 = moveComponent(d0, ["p", "x"], [0, 0]);
    expect(layoutMap(d1).get("p.x")!.at).toEqual([1, 2]);
    const d2 = moveComponent(d0, ["x_root"] as string[], [-5, -5]);
    // Root components may go negative (x_root doesn't exist as component but layout entry is created).
    expect(layoutMap(d2).get("x_root")!.at).toEqual([-5, -5]);
  });

  it("moveComponent grows ancestor planes to fit", () => {
    const d0 = doc(
      HEADER + "component p { component x }\nlayout { p: { at: [0,0], size: [6,5] } }",
    );
    const d1 = moveComponent(d0, ["p", "x"], [9, 9]);
    const p = layoutMap(d1).get("p")!;
    expect(p.size![0]).toBeGreaterThanOrEqual(14);
    expect(p.size![1]).toBeGreaterThanOrEqual(13);
  });

  it("setDisplay icon forces leaf size", () => {
    const d0 = doc(
      HEADER + "component p { component x }\nlayout { p: { at: [0,0], size: [10,9] } }",
    );
    const d1 = setDisplay(d0, ["p"], "icon");
    expect(layoutMap(d1).get("p")!.display).toBe("icon");
    expect(layoutMap(d1).get("p")!.size).toEqual([4, 3]);
  });

  it("setDisplay plane re-fits a collapsed container around its children", () => {
    const d0 = doc(
      HEADER +
        "component p {\n  component x\n  component y\n}\nlayout { p: { at: [0,0], size: [4,3], display: icon } }",
    );
    const d1 = autoLayout(setDisplay(autoLayout(d0), ["p"], "plane"));
    const map = layoutMap(d1);
    for (const child of ["p.x", "p.y"]) {
      const c = map.get(child)!;
      expect(c.at![0] + c.size![0]).toBeLessThan(map.get("p")!.size![0]);
      expect(c.at![1] + c.size![1]).toBeLessThan(map.get("p")!.size![1]);
    }
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
