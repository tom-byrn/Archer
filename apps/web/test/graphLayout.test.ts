import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { findExample } from "@archer/mcp/examples";
import { layoutFlow, layoutMachine, layoutModel, routeEdges, type Box } from "../lib/graphLayout";

const doc = parse(findExample("flows-states-and-data")!.source).doc;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const noOverlaps = (boxes: Map<string, Box>) => {
  const list = [...boxes.values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlap(list[i]!, list[j]!)).toBe(false);
};

describe("graph layouts", () => {
  it("flow: one lane per component in order of appearance, nodes inside their lane, ranks left to right", () => {
    const flow = doc.flows[0]!;
    const l = layoutFlow(flow);
    expect(l.laneKeys).toEqual(["browser", "app", "api"]);
    noOverlaps(l.boxes);
    for (const n of flow.nodes) {
      const b = l.boxes.get(n.id)!;
      const lane = l.lanes[l.laneKeys.indexOf(n.lane!.join("."))]!;
      expect(b.y).toBeGreaterThanOrEqual(lane.y);
      expect(b.y + b.h).toBeLessThanOrEqual(lane.y + lane.h);
    }
    const x = (id: string) => l.boxes.get(id)!.x;
    expect(x("begin")).toBeLessThan(x("paste"));
    expect(x("paste")).toBeLessThan(x("submit"));
    expect(x("valid")).toBeLessThan(x("store"));
  });

  it("flow: a node with no lane gets a lane of its own", () => {
    const l = layoutFlow(parse('arch "X" v0.2\ncomponent a\nflow f {\n  step x in a\n  step y\n  x -> y\n}').doc.flows[0]!);
    expect(l.laneKeys).toEqual(["a", null]);
  });

  it("states: no overlaps, and a back edge never runs through a state", () => {
    const m = doc.machines[0]!;
    const l = layoutMachine(m);
    noOverlaps(l.boxes);
    const routes = routeEdges(m.transitions, l.boxes);
    expect(routes).toHaveLength(m.transitions.length);
    // Every vertical leg of every route stays clear of the boxes it doesn't start or end at.
    routes.forEach((r) => {
      const t = m.transitions[r.index]!;
      const others = [...l.boxes.entries()].filter(([id]) => id !== t.from && id !== t.to).map(([, b]) => b);
      const pts = [...r.d.matchAll(/([MHV])(-?[\d.]+)(?: (-?[\d.]+))?/g)];
      let x = 0;
      let y = 0;
      for (const p of pts) {
        const [, cmd, a, b] = p;
        if (cmd === "M") [x, y] = [Number(a), Number(b)];
        else if (cmd === "H") x = Number(a);
        else {
          const y2 = Number(a);
          for (const o of others) expect(x > o.x && x < o.x + o.w && Math.max(y, y2) > o.y && Math.min(y, y2) < o.y + o.h).toBe(false);
          y = y2;
        }
      }
    });
  });

  it("data model: referenced entities sit left of what refers to them, one line per reference", () => {
    const m = doc.models[0]!;
    const l = layoutModel(m);
    noOverlaps(l.boxes);
    expect(l.boxes.get("owner")!.x).toBeLessThan(l.boxes.get("link")!.x);
    expect(l.boxes.get("link")!.x).toBeLessThan(l.boxes.get("click")!.x);
    expect(l.refs.map((r) => `${r.entity}.${r.field}`)).toEqual(["link.owner_id", "click.link_id"]);
  });
});
