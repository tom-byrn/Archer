import { describe, expect, it } from "vitest";
import { extractFragment, format, parse } from "@archer/lang";
import { fragmentSize, parseFragment } from "../lib/clipboard";

const DOC = `arch "Shop" v0.2

component web "Web" @vercel.nextjs
component api "API"
web -> api @http
layout {
  web: { at: [0, 0] }
  api: { at: [6, 0] }
}
`;

describe("parseFragment", () => {
  it("reads back what copying writes", () => {
    const text = format(extractFragment(parse(DOC).doc, [["web"], ["api"]]));
    const fragment = parseFragment(text);
    expect(fragment?.components.map((c) => c.id)).toEqual(["web", "api"]);
    expect(fragment?.connections).toHaveLength(1);
  });

  it("accepts components without a header (hand-written or from an agent)", () => {
    const fragment = parseFragment("component queue @sqs\ncomponent worker\nqueue -> worker");
    expect(fragment?.components.map((c) => c.id)).toEqual(["queue", "worker"]);
  });

  it("ignores text that isn't Archer, and documents with nothing to paste", () => {
    expect(parseFragment("")).toBeNull();
    expect(parseFragment("just some words")).toBeNull();
    expect(parseFragment('arch "Empty" v0.2\n')).toBeNull();
    expect(parseFragment('arch "Broken" v0.2\ncomponent {')).toBeNull();
  });
});

describe("fragmentSize", () => {
  it("measures the top-level components' bounding box in grid cells", () => {
    expect(fragmentSize(parse(DOC).doc)).toEqual([10, 3]);
  });
});

describe("planes on the clipboard", () => {
  const PLANES = `arch "Shop" v0.2

plane backend "Backend" {
  component api "API"
  component db "DB" @postgres
}

component web "Web"

api -> db @sql
web -> api @http

layout {
  api: { at: [1, 2], size: [4, 3] }
  backend: { at: [6, 0], size: [12, 6] }
  db: { at: [7, 2], size: [4, 3] }
  web: { at: [0, 0], size: [4, 3] }
}
`;

  it("copies a plane with what's on it, and reads it back", () => {
    const text = format(extractFragment(parse(PLANES).doc, [["backend"]]));
    const fragment = parseFragment(text);
    expect(fragment?.planes.map((p) => p.id)).toEqual(["backend"]);
    expect(fragment?.components.map((c) => [c.id, c.plane])).toEqual([
      ["api", "backend"],
      ["db", "backend"],
    ]);
    expect(fragment?.connections).toHaveLength(1);
  });

  it("accepts a lone plane, and measures planes as the top-level items they are", () => {
    const fragment = parseFragment('plane lane "Lane"');
    expect(fragment?.planes.map((p) => p.id)).toEqual(["lane"]);
    expect(fragmentSize(parse(PLANES).doc)).toEqual([18, 6]);
  });
});
