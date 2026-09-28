import { describe, expect, it } from "vitest";
import { normalizeLayout, parse, validate } from "../src/index";

const doc = (src: string) => parse(src).doc;
const codes = (src: string, opts?: Parameters<typeof validate>[1]) =>
  validate(doc(src), opts).map((d) => d.code);

const HEADER = 'arch "X" v0.2\n';

describe("validate", () => {
  it("accepts a valid document", () => {
    expect(
      codes(HEADER + "component a\ncomponent b { component c }\na -> b.c"),
    ).toEqual([]);
  });

  it("E002: duplicate ids in the same scope", () => {
    expect(codes(HEADER + "component a\ncomponent a")).toContain("E002");
    // Same id in different scopes is fine.
    expect(
      codes(HEADER + "component a { component x }\ncomponent b { component x }"),
    ).toEqual([]);
  });

  it("E003: duplicate payload names on one component", () => {
    const src =
      HEADER + 'component a {\n  s json ```\n{}\n```\n  s json ```\n{}\n```\n}';
    expect(codes(src)).toContain("E003");
  });

  it("E003 / E201 apply to connection payloads too", () => {
    const dup =
      HEADER +
      "component a\ncomponent b\na -> b {\n  m json ```\n{}\n```\n  m json ```\n{}\n```\n}";
    const d = validate(doc(dup));
    expect(d.map((x) => x.code)).toEqual(["E003"]);
    expect(d[0]!.message).toContain("connection a -> b");
    const bad = HEADER + "component a\ncomponent b\na -> b @queue {\n  m json ```\n{oops\n```\n}";
    expect(codes(bad)).toEqual(["E201"]);
    const ok = HEADER + "component a\ncomponent b\na -> b @queue {\n  m yaml ```\nid: uuid\n```\n}";
    expect(codes(ok)).toEqual([]);
  });

  it("E101: unresolved connection endpoints, both ends", () => {
    const diags = validate(doc(HEADER + "component a\na -> ghost\nghost2 -> a"));
    const e101 = diags.filter((d) => d.code === "E101");
    expect(e101).toHaveLength(2);
    expect(e101[0]!.message).toContain("ghost");
  });

  it("E101: nested paths resolve exactly", () => {
    const src = HEADER + "component b { component api }\nb.api -> b\nb.missing -> b";
    const diags = validate(doc(src)).filter((d) => d.code === "E101");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("b.missing");
  });

  it("E201: invalid json payload", () => {
    const src = HEADER + "component a {\n  s json ```\n{nope}\n```\n}";
    expect(codes(src)).toContain("E201");
  });

  it("E201: invalid yaml payload", () => {
    const src = HEADER + 'component a {\n  s yaml ```\nkey: [unclosed\n```\n}';
    expect(codes(src)).toContain("E201");
  });

  it("E201: invalid table payload; valid table passes", () => {
    const bad = HEADER + "component a {\n  t table ```\nnot a table\n```\n}";
    expect(codes(bad)).toContain("E201");
    const good =
      HEADER +
      "component a {\n  t table ```\n| a | b |\n| - | - |\n| 1 | 2 |\n```\n}";
    expect(codes(good)).toEqual([]);
  });

  it("markdown payloads are never validated", () => {
    const src = HEADER + "component a {\n  notes markdown ```\n{nope} | broken\n```\n}";
    expect(codes(src)).toEqual([]);
  });

  it("W301: unknown types only when a catalog is provided", () => {
    const src = HEADER + "component a @aws.s3\ncomponent b @madeup";
    expect(codes(src)).toEqual([]);
    const withCatalog = codes(src, { knownTypes: new Set(["aws.s3"]) });
    expect(withCatalog).toEqual(["W301"]);
  });

  it("W301: unknown connection types", () => {
    const src = HEADER + "component a\ncomponent b\na -> b @telepathy";
    const out = codes(src, {
      knownTypes: new Set(["aws.s3"]),
      knownConnectionTypes: new Set(["http"]),
    });
    expect(out).toEqual(["W301"]);
  });

  it("W302: duplicate connections", () => {
    const src = HEADER + 'component a\ncomponent b\na -> b @http\na -> b @http';
    expect(codes(src)).toContain("W302");
    // Different label => not a duplicate.
    const src2 = HEADER + 'component a\ncomponent b\na -> b : "x"\na -> b : "y"';
    expect(codes(src2)).toEqual([]);
  });

  it("W303: layout entries for unknown components; normalizeLayout drops them", () => {
    const src = HEADER + "component a\nlayout {\n  a: { at: [0, 0] }\n  ghost: { at: [1, 1] }\n}";
    expect(codes(src)).toContain("W303");
    const normalized = normalizeLayout(doc(src));
    expect(normalized.layout.map((l) => l.path.join("."))).toEqual(["a"]);
  });

  it("normalizeLayout: duplicate entries collapse, last wins", () => {
    const src =
      HEADER + "component a\nlayout {\n  a: { at: [0, 0] }\n  a: { at: [5, 5] }\n}";
    const normalized = normalizeLayout(doc(src));
    expect(normalized.layout).toHaveLength(1);
    expect(normalized.layout[0]!.at).toEqual([5, 5]);
  });
});

describe("validate: planes", () => {
  it("accepts components on planes, connected across them by their own paths", () => {
    expect(
      codes(HEADER + "plane front {\n  component web\n}\nplane back {\n  component api { component x }\n}\nweb -> api.x"),
    ).toEqual([]);
  });

  it("E002: a plane shares its scope's ids with the components in it", () => {
    const clash = validate(doc(HEADER + "plane api\ncomponent api"));
    expect(clash.map((d) => d.code)).toEqual(["E002"]);
    expect(clash[0]!.message).toMatch(/component and a plane/);
    // Across planes of one scope too: planes don't add a level.
    expect(codes(HEADER + "plane p {\n  component x\n}\nplane q {\n  component x\n}")).toEqual(["E002"]);
    expect(codes(HEADER + "plane p\nplane p")).toEqual(["E002"]);
    // A component's inside is its own scope.
    expect(codes(HEADER + "plane p\ncomponent a { plane p\ncomponent p_2 }")).toEqual([]);
  });

  it("E101: a connection can't end on a plane", () => {
    const d = validate(doc(HEADER + "plane back {\n  component api\n}\ncomponent web\nweb -> back"));
    expect(d.map((x) => x.code)).toEqual(["E101"]);
    expect(d[0]!.message).toMatch(/'back' is a plane/);
  });

  it("E101: points out a path written through a plane", () => {
    const d = validate(doc(HEADER + "plane back {\n  component api { component x }\n}\ncomponent web\nweb -> back.api.x"));
    expect(d.map((x) => x.code)).toEqual(["E101"]);
    expect(d[0]!.message).toMatch(/did you mean 'api.x'/);
  });

  it("W301 on a plane's unknown type", () => {
    const d = validate(doc(HEADER + "plane p @nope\nplane q @aws"), { knownTypes: new Set(["aws"]) });
    expect(d.map((x) => x.code)).toEqual(["W301"]);
    expect(d[0]!.message).toMatch(/plane 'p'/);
  });

  it("W303 knows planes' layout entries, top-level and inside components", () => {
    const src =
      HEADER + "plane p\ncomponent c { plane q }\nlayout {\n  p: { at: [0, 0] }\n  c.q: { at: [1, 1] }\n  c.r: { at: [1, 1] }\n}";
    expect(codes(src)).toEqual(["W303"]);
    expect(normalizeLayout(doc(src)).layout.map((l) => l.path.join("."))).toEqual(["p", "c.q"]);
  });
});
