import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLORS, SHAPES, SHAPE_GROUPS, SHAPE_INFO, isShape } from "@archer/lang";
import { LANGUAGE_SPEC } from "../src/languageSpec";

// The spec agents read (the guide resource, `archer spec`) is a copy of
// docs/language-spec.md, and the shapes and colors it lists are the ones the
// language knows.

const SPEC = readFileSync(new URL("../../../docs/language-spec.md", import.meta.url), "utf8");

describe("language spec", () => {
  it("is docs/language-spec.md, as written", () => {
    expect(LANGUAGE_SPEC).toBe(SPEC);
  });

  it("lists every shape in §3.3, group by group, with what it stands for", () => {
    const section = SPEC.slice(SPEC.indexOf("### 3.3 Shapes"), SPEC.indexOf("## 4."));
    const rows = [...section.matchAll(/^\| *([^|`]*?) *\| *`([a-z0-9_]+)` *\| *(.+?) *\|$/gm)].map(
      ([, group, shape, use]) => ({ group: group!, shape: shape!, use: use! }),
    );
    expect(rows.map((r) => r.shape)).toEqual([...SHAPES]);
    let group = "";
    for (const row of rows) {
      if (row.group !== "") group = row.group;
      const shape = row.shape;
      if (!isShape(shape)) throw new Error(`not a shape: ${shape}`);
      expect(row.use, shape).toBe(SHAPE_INFO[shape].use);
      expect(group, shape).toBe(SHAPE_GROUPS.find((g) => g.id === SHAPE_INFO[shape].group)?.name);
    }
  });

  it("lists every color in §3.3, in picker order", () => {
    const section = SPEC.slice(SPEC.indexOf("#### Colors"), SPEC.indexOf("### 3.4"));
    const list = section.slice(section.indexOf("- The palette"), section.indexOf("- A color replaces"));
    expect([...list.matchAll(/`([a-z]+)`/g)].map((m) => m[1])).toEqual([...COLORS]);
  });
});
