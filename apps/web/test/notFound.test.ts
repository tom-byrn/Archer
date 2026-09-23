import { describe, expect, it } from "vitest";
import { format, parse, validate } from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { NOT_FOUND_SOURCE, notFoundProblems } from "../lib/notFound";
import { highlightArch } from "../lib/highlightArch";

// The 404 page shows its document and the validator's verdict on it; these
// keep the joke accurate as the language and catalog change.
describe("404 page document", () => {
  it("is canonical and fails only because the page isn't declared", () => {
    const { doc, diagnostics } = parse(NOT_FOUND_SOURCE);
    expect(format(doc)).toBe(NOT_FOUND_SOURCE);
    const all = [
      ...diagnostics,
      ...validate(doc, { knownTypes: knownTypes(), knownConnectionTypes: knownConnectionTypes() }),
    ];
    expect(all.map((d) => d.code)).toEqual(["E101"]);
  });

  it("points its one problem at the undeclared page", () => {
    const problems = notFoundProblems();
    expect(problems).toHaveLength(1);
    const [{ diagnostic, missing }] = problems as [(typeof problems)[number]];
    expect(missing).toBe("page");
    const line = NOT_FOUND_SOURCE.split("\n")[diagnostic.span!.start.line - 1];
    expect(line).toMatch(/\bpage\b/);
  });

  it("highlights without changing the text", () => {
    const text = highlightArch(NOT_FOUND_SOURCE)
      .map((line) => line.map((t) => t.text).join(""))
      .join("\n");
    expect(text + "\n").toBe(NOT_FOUND_SOURCE);
  });
});
