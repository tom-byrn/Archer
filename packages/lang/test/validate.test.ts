import { describe, expect, it } from "vitest";
import { normalizeLayout, parse, validate } from "../src/index.js";

const doc = (src: string) => parse(src).doc;
const codes = (src: string, opts?: Parameters<typeof validate>[1]) =>
  validate(doc(src), opts).map((d) => d.code);

const HEADER = 'arch "X" v0.1\n';

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
