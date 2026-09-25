import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { resolveDropTarget } from "../lib/dropTarget";
import { renderArchSvg } from "../lib/svg";
import { CELL, toFlow } from "../lib/toFlow";

// Free-form blocks: their descriptions are the content, and an empty group is
// already an area to put components in.
const SRC = `arch "Checkout" v0.1

component payments "Payments" @group {
  desc "Everything that touches money."
}
component fraud "Fraud checks" @block {
  desc "Rules first, then a model score for anything they let through."
}
component why "Why a queue?" @note {
  desc "Checkout spikes on sale days."
}
component api "API" @service

layout {
  payments: { at: [0, 0], size: [10, 6] }
  fraud: { at: [12, 0], size: [6, 4] }
  why: { at: [12, 6], size: [5, 3] }
  api: { at: [20, 0] }
}
`;
const doc = parse(SRC).doc;

describe("free-form blocks", () => {
  it("draws an empty group as an area and cards and notes as nodes", () => {
    const types = Object.fromEntries(toFlow(doc).nodes.map((n) => [n.id, n.type]));
    expect(types).toEqual({
      payments: "archPlane",
      fraud: "archComponent",
      why: "archComponent",
      api: "archComponent",
    });
  });

  it("drops into an empty group, but not into a card", () => {
    const inGroup = resolveDropTarget(doc, { x: 5 * CELL, y: 4 * CELL });
    expect(inGroup.parent).toEqual(["payments"]);
    // Clamped below the group's title row, as in any plane.
    expect(inGroup.at[1]).toBeGreaterThanOrEqual(2);
    expect(resolveDropTarget(doc, { x: 15 * CELL, y: 2 * CELL }).parent).toEqual([]);
  });

  it("writes block descriptions into the SVG, wrapped, without the type tag", () => {
    const svg = renderArchSvg(SRC);
    // Each block's text elements (title first), in drawing order.
    const texts = [...svg.matchAll(/<g>(.*?)<\/g>/g)].map((g) =>
      [...g[1]!.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((t) => t[1]),
    );
    const block = (title: string) => texts.find((t) => t[0] === title)!.slice(1);
    expect(block("Payments")).toEqual(["Everything that touches money."]);
    // Wrapped over lines, every word kept.
    for (const [title, desc] of [
      ["Fraud checks", "Rules first, then a model score for anything they let through."],
      ["Why a queue?", "Checkout spikes on sale days."],
    ] as const) {
      expect(block(title).length).toBeGreaterThan(1);
      expect(block(title).join(" ")).toBe(desc);
    }
    expect(svg).not.toMatch(/>(group|block|note)</);
    // An ordinary component still shows its type.
    expect(block("API")).toEqual(["service"]);
  });
});
