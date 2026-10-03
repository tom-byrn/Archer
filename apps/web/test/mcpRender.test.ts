import { describe, expect, it } from "vitest";
import { LOGOS } from "@archer/catalog/logos";
import { EXAMPLE_STATE, TOOL_DOCS } from "@archer/mcp/reference";
import { renderArchSvg } from "../lib/svg";

// The /mcp route hands render_project this renderer, as the share image uses
// it. packages/mcp checks the tool with a stand-in; this checks that what the
// real one draws for the docs' example is what the tool reference promises.
describe("render_project's renderer", () => {
  const source = EXAMPLE_STATE.project.revisions.at(-1)!.source;
  const doc = TOOL_DOCS.render_project!;

  it("draws the example project as the reference shows", () => {
    const svg = renderArchSvg(source, { theme: doc.args.theme as "dark", logos: LOGOS });
    const [head, tail] = (doc.result as string).split("…");
    expect(svg.startsWith(head!)).toBe(true);
    expect(svg.endsWith(tail!)).toBe(true);
    expect(svg).toContain("<title>Shop</title>");
    expect(svg).not.toContain("Invalid document");
  });
});
