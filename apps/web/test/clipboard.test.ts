import { describe, expect, it } from "vitest";
import { extractFragment, format, parse } from "@archer/lang";
import { fragmentSize, parseFragment } from "../lib/clipboard";

const DOC = `arch "Shop" v0.1

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
    expect(parseFragment('arch "Empty" v0.1\n')).toBeNull();
    expect(parseFragment('arch "Broken" v0.1\ncomponent {')).toBeNull();
  });
});

describe("fragmentSize", () => {
  it("measures the top-level components' bounding box in grid cells", () => {
    expect(fragmentSize(parse(DOC).doc)).toEqual([10, 3]);
  });
});
