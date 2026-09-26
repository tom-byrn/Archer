import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import {
  BOX_COST,
  bendOf,
  chipPoint,
  chipText,
  groupEdges,
  placeChips,
  routeEdge,
  routePieces,
  separateBends,
  untangle,
  type Obstacle,
  type Rect,
  type RoutedEdge,
} from "../lib/edgeRoute";

const box = (x: number, y: number, w = 160, h = 120): Rect => ({ x, y, w, h });
const wall = (r: Rect): Obstacle => ({ ...r, cost: BOX_COST });

describe("routeEdge", () => {
  it("connects side-by-side boxes left/right and stacked boxes top/bottom", () => {
    const beside = routeEdge(box(0, 0), box(400, 200), []);
    expect([beside.from, beside.to, beside.horizontal]).toEqual(["r", "l", true]);
    const leftward = routeEdge(box(400, 0), box(0, 0), []);
    expect([leftward.from, leftward.to]).toEqual(["l", "r"]);
    const below = routeEdge(box(0, 0), box(40, 400), []);
    expect([below.from, below.to, below.horizontal]).toEqual(["b", "t", false]);
  });

  it("bends in the middle when that is clear", () => {
    const r = routeEdge(box(0, 0), box(400, 200), []);
    expect(r.mid).toBe((160 + 400) / 2);
  });

  it("moves the bend off a box in the way", () => {
    // A box sits across the middle of the span, between the two rows.
    const blocker = box(240, 60, 80, 120);
    const r = routeEdge(box(0, 0), box(400, 200), [wall(blocker)]);
    expect(r.mid < blocker.x - 10 || r.mid > blocker.x + blocker.w + 10).toBe(true);
  });
});

describe("separateBends", () => {
  const edge = (source: string, target: string, s: Rect, t: Rect) => {
    const route = routeEdge(s, t, []);
    return bendOf(route, s, t, source, target);
  };

  it("pulls apart unrelated bends that share a channel", () => {
    // a (top) runs down to d, b (bottom) up to e; their vertical pieces would
    // overlap on one line at x=280.
    const a = edge("a", "d", box(0, 0), box(400, 300));
    const b = edge("b", "e", box(0, 400), box(400, 150));
    expect(a.route.mid).toBe(b.route.mid);
    separateBends([a, b]);
    expect(Math.abs(a.route.mid - b.route.mid)).toBeGreaterThanOrEqual(10);
  });

  it("keeps a fan-out on one trunk", () => {
    const a = edge("hub", "x", box(0, 200), box(400, 0));
    const b = edge("hub", "y", box(0, 200), box(400, 400));
    separateBends([a, b]);
    expect(a.route.mid).toBe(b.route.mid);
  });
});

describe("untangle", () => {
  it("brings an arrow in from above instead of onto a side another edge leaves from", () => {
    const api = box(400, 300);
    const worker = box(800, 300);
    const stripe = box(1200, 0);
    const out: RoutedEdge = {
      source: "api",
      target: "worker",
      s: api,
      t: worker,
      route: routeEdge(api, worker, []),
      headAtTarget: true,
    };
    const webhook: RoutedEdge = {
      source: "stripe",
      target: "api",
      s: stripe,
      t: api,
      route: routeEdge(stripe, api, []),
      headAtTarget: true,
    };
    expect(webhook.route.to).toBe("r"); // would share api's right side with `out`
    untangle([out, webhook], () => []);
    expect(webhook.route.corner).toBe(true);
    expect(webhook.route.to).toBe("t");
    expect(out.route.corner).toBeUndefined();
  });
});

describe("groupEdges", () => {
  const conns = (body: string) => parse(`arch "X" v0.1\n${body}`).doc.connections;
  /** `box` is collapsed: everything inside it is drawn as it. */
  const folded = (p: string) => (p.startsWith("box.") ? "box" : p);

  it("keeps connections between boxes drawn as themselves apart", () => {
    const c = conns(
      'component a\ncomponent b\na -> b @http : "request"\nb -> a @webhook : "callback"',
    );
    const g = groupEdges(c, (p) => p);
    expect(g.map((e) => [e.source, e.target, e.indices, e.summary])).toEqual([
      ["a", "b", [0], false],
      ["b", "a", [1], false],
    ]);
  });

  it("sums up everything between the same two boxes once an end is folded away", () => {
    const c = conns(
      "component a\ncomponent box { component x\ncomponent y }\n" +
        "a -> box.x @sql\na -> box.y @sql\nbox.y -> a @sql\nbox.x -> box.y",
    );
    const g = groupEdges(c, folded);
    // The x -> y connection is inside one box: not drawn.
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ source: "a", target: "box", arrow: "<->", type: "sql", summary: true });
    expect(g[0]!.indices).toHaveLength(3);
    expect(chipText(g[0]!)).toBe("sql ×3");
  });

  it("points a summary the way its connections do, and drops a type they don't share", () => {
    const c = conns(
      "component a\ncomponent box { component x\ncomponent y }\n" +
        "a -- box.x\nbox.y -> a @http\nbox.x -> a @queue",
    );
    const [g] = groupEdges(c, folded);
    expect([g!.source, g!.target, g!.arrow, g!.type]).toEqual(["box", "a", "->", undefined]);
    expect(chipText(g!)).toBe("×3");
  });

  it("keeps a lone folded connection's own label", () => {
    const c = conns('component a\ncomponent box { component x }\na -> box.x @http : "pages"');
    const [g] = groupEdges(c, folded);
    expect(g).toMatchObject({ source: "a", target: "box", summary: true, label: "pages" });
    expect(chipText(g!)).toBe("http · pages");
  });
});

describe("placeChips", () => {
  it("keeps chips off a trunk that several edges share", () => {
    // One box fanning out to three targets below it: their bends run down
    // one trunk, each as far as its own target.
    const hub = box(0, 0);
    const targets = [box(400, 200), box(400, 400), box(400, 600)];
    const edges = targets.map((t) => {
      const route = routeEdge(hub, t, []);
      return { pieces: routePieces(route, hub, t), width: 60 };
    });
    expect(new Set(edges.map((e) => e.pieces[1]!.x1)).size).toBe(1);
    const spots = placeChips(edges, [hub, ...targets]);
    for (const [i, spot] of spots.entries()) {
      const at = chipPoint(edges[i]!.pieces, spot!)!;
      const chip = { x: at.x - 30, y: at.y - 9, w: 60, h: 18 };
      // No other edge's line runs under it.
      for (const [j, other] of edges.entries()) {
        if (j === i) continue;
        for (const p of other.pieces) {
          const vertical = p.x1 === p.x2;
          const under = vertical
            ? p.x1 > chip.x && p.x1 < chip.x + chip.w && Math.max(p.y1, p.y2) > chip.y && Math.min(p.y1, p.y2) < chip.y + chip.h
            : p.y1 > chip.y && p.y1 < chip.y + chip.h && Math.max(p.x1, p.x2) > chip.x && Math.min(p.x1, p.x2) < chip.x + chip.w;
          expect(under, `chip ${i} over edge ${j}`).toBe(false);
        }
      }
    }
  });

  it("moves a chip off a box it would cover", () => {
    const s = box(0, 0);
    const t = box(600, 0);
    const route = routeEdge(s, t, []);
    const pieces = routePieces(route, s, t);
    const blocker = { x: 280, y: 40, w: 80, h: 80 }; // over the middle of the line
    const [spot] = placeChips([{ pieces, width: 60 }], [s, t, blocker]);
    const at = chipPoint(pieces, spot!)!;
    expect(at.x + 30 < blocker.x || at.x - 30 > blocker.x + blocker.w).toBe(true);
  });

  it("gives an edge without a label no chip", () => {
    expect(placeChips([{ pieces: [{ x1: 0, y1: 0, x2: 100, y2: 0 }], width: 0 }], [])).toEqual([null]);
  });
});
