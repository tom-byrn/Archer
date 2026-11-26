import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { findExample } from "@archer/mcp/examples";
import { HEAD_H, HEAD_W, layoutSequence, textWidth } from "../lib/sequenceLayout";

const doc = parse(findExample("sequences")!.source).doc;
const shorten = doc.sequences.find((s) => s.id === "shorten")!;

describe("sequence layout", () => {
  const l = layoutSequence(shorten);

  it("puts one lifeline per participant, left to right in order of first appearance", () => {
    expect(l.lifelines.map((x) => x.key)).toEqual(["browser", "app", "api", "cache", "db"]);
    const xs = l.lifelines.map((x) => x.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]).toBeGreaterThanOrEqual(HEAD_W / 2);
  });

  it("numbers messages and stacks them top to bottom below the headers", () => {
    expect(l.messages.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const ys = l.messages.map((m) => m.y);
    expect(ys[0]).toBeGreaterThan(HEAD_H);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
    expect(l.messages.find((m) => m.number === 7)!.self).toBe(true);
  });

  it("spaces lifelines so every label fits between its ends", () => {
    for (const m of l.messages) {
      if (m.self || !m.label) continue;
      expect(Math.abs(m.x2 - m.x1)).toBeGreaterThan(textWidth(m.label) + 24);
    }
  });

  it("frames a fragment around its steps, a branch per else", () => {
    expect(l.frames).toHaveLength(1);
    const f = l.frames[0]!;
    expect(f.branches.map((b) => b.guard)).toEqual(["slug is free", "taken"]);
    for (const n of [5, 6, 7]) {
      const m = l.messages.find((x) => x.number === n)!;
      expect(m.y).toBeGreaterThan(f.y);
      expect(m.y).toBeLessThan(f.y + f.h);
      expect(Math.min(m.x1, m.x2)).toBeGreaterThan(f.x);
      expect(Math.max(m.x1, m.x2)).toBeLessThan(f.x + f.w);
    }
    expect(l.width).toBeGreaterThanOrEqual(f.x + f.w);
  });

  it("draws an empty sequence as nothing but its frame of reference", () => {
    const empty = layoutSequence({ kind: "sequence", id: "x", steps: [], span: shorten.span });
    expect(empty.lifelines).toEqual([]);
    expect(empty.messages).toEqual([]);
    expect(empty.width).toBeGreaterThan(0);
  });
});
