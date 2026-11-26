import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findExample } from "@archer/mcp/examples";
import { renderViewSvg } from "../lib/viewSvg";

const views = findExample("flows-states-and-data")!.source;
const seqs = findExample("sequences")!.source;

describe("view SVGs", () => {
  it.each([
    [seqs, "shorten", ["Shorten a link", "POST /links", "alt [slug is free]"]],
    [views, "publish", ["Publish a link", "Valid URL?", "yes"]],
    [views, "lifecycle", ["Link lifecycle", "Pending", "slug reserved"]],
    [views, "schema", ["Links schema", "owner_id", "varchar(2048)"]],
  ] as const)("draws %#", (source, id, words) => {
    const svg = renderViewSvg(source, id);
    expect(svg.startsWith("<svg")).toBe(true);
    for (const w of words) expect(svg).toContain(w.replace(/&/g, "&amp;"));
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
    if (process.env.VIEW_SVG_OUT) writeFileSync(`${process.env.VIEW_SVG_OUT}/${id}.svg`, svg);
    if (process.env.VIEW_SVG_OUT) writeFileSync(`${process.env.VIEW_SVG_OUT}/${id}-dark.svg`, renderViewSvg(source, id, { theme: "dark" }));
  });

  it("says so for an unknown view or an unparseable document", () => {
    expect(renderViewSvg(views, "nope")).toContain("No view &apos;nope&apos;".replace("&apos;", "'").replace("&apos;", "'"));
    expect(renderViewSvg("not arch", "x")).toContain("Invalid document");
  });

  it("draws placed nodes where they were put", () => {
    const placed = `${views.trimEnd()}\n\nlayout {\n  view lifecycle {\n    expired: { at: [20, 8] }\n  }\n}\n`;
    expect(renderViewSvg(placed, "lifecycle")).toContain(`x="800" y="320"`);
  });
});
