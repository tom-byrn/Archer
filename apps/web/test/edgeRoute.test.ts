import { describe, expect, it } from "vitest";
import {
  BOX_COST,
  bendOf,
  routeEdge,
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
