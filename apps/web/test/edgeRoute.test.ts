import { describe, expect, it } from "vitest";
import {
  BOX_COST,
  PORT_GAP,
  assignPorts,
  bendOf,
  detour,
  detourPoints,
  preferCorners,
  routeAround,
  routeCorner,
  routeEdge,
  separateBends,
  untangle,
  type Obstacle,
  type Rect,
  type RoutedEdge,
} from "../lib/edgeRoute";
import { bundle, bundleChip } from "../lib/edgeBundle";

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
    return bendOf(route, s, t);
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

  it("gives edges fanning out the same way their own tracks, crossing nothing", () => {
    // hub fans out right to x and y, both below it. With their own ports, the
    // one leaving lower (to y, further down) turns down first, so the one to
    // x passes above its corner instead of across its trunk.
    const hub = box(0, 0);
    const [x, y] = [box(400, 300), box(400, 600)];
    const edges: RoutedEdge[] = [x, y].map((t, i) => ({
      source: "hub",
      target: `t${i}`,
      s: hub,
      t,
      route: routeEdge(hub, t, []),
      headAtTarget: true,
    }));
    const ports = assignPorts(edges, () => []);
    const [a, b] = edges.map((e, i) => bendOf(e.route, e.s, e.t, ports[i]));
    separateBends([a!, b!]);
    expect(a!.route.mid - b!.route.mid).toBeGreaterThanOrEqual(10);
  });
});

describe("assignPorts", () => {
  const routed = (source: string, target: string, s: Rect, t: Rect): RoutedEdge => ({
    source,
    target,
    s,
    t,
    route: routeEdge(s, t, []),
    headAtTarget: true,
  });

  it("gives each edge on a side its own port, in the order of where it goes", () => {
    const hub = box(0, 200);
    const edges = [
      routed("hub", "low", hub, box(400, 500)),
      routed("hub", "high", hub, box(400, -100)),
      routed("hub", "level", hub, box(400, 200)),
    ];
    const ports = assignPorts(edges, () => []);
    const at = ports.map((p) => p.from);
    expect(new Set(at).size).toBe(3);
    // high leaves highest, then level, then low.
    expect(at[1]! < at[2]! && at[2]! < at[0]!).toBe(true);
    expect(at[2]! - at[1]!).toBe(PORT_GAP);
  });

  it("keeps two opposite arrows between the same boxes apart, and straight", () => {
    const a = box(0, 0);
    const b = box(400, 0);
    const edges = [routed("a", "b", a, b), routed("b", "a", b, a)];
    const ports = assignPorts(edges, () => []);
    // Same height at both ends (straight), different from each other.
    const ys = edges.map((e, i) => [e.s.y + 60 + ports[i]!.from, e.t.y + 60 + ports[i]!.to]);
    expect(ys[0]![0]).toBe(ys[0]![1]);
    expect(ys[1]![0]).toBe(ys[1]![1]);
    expect(Math.abs(ys[0]![0]! - ys[1]![0]!)).toBe(PORT_GAP);
  });

  it("straightens an edge between overlapping boxes", () => {
    // Offset by 40px: the line runs level at the smaller box's middle.
    const small = box(0, 40, 160, 80);
    const big = box(400, 0, 160, 240);
    const [p] = assignPorts([routed("small", "big", small, big)], () => []);
    expect(small.y + small.h / 2 + p!.from).toBe(big.y + big.h / 2 + p!.to);
    expect(p!.from).toBe(0);
  });

  it("leaves an L's ports where the spread put them", () => {
    // api's top takes an L in from the left and a straight edge from above.
    const api = box(400, 300);
    const left = box(0, 0);
    const above = box(420, -300);
    const l: RoutedEdge = { ...routed("left", "api", left, api), route: routeCorner(left, api, [])! };
    const edges = [l, routed("above", "api", above, api)];
    expect([l.route.to, edges[1]!.route.to]).toEqual(["t", "t"]);
    const ports = assignPorts(edges, () => []);
    // The L arrives left of the other edge, each on its own port.
    expect(ports[0]!.to).toBeLessThan(ports[1]!.to);
    expect(ports[1]!.to - ports[0]!.to).toBeGreaterThanOrEqual(PORT_GAP - 0.01);
    expect(ports[0]!.from).toBe(0);
  });

  it("leaves the bend when a straight line would cross a box", () => {
    const small = box(0, 40, 160, 80);
    const big = box(400, 0, 160, 240);
    const wallBetween = wall(box(220, 60, 120, 40));
    const [p] = assignPorts([routed("small", "big", small, big)], () => [wallBetween]);
    expect(p).toEqual({ from: 0, to: 0 });
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

describe("preferCorners", () => {
  const routed = (source: string, target: string, s: Rect, t: Rect): RoutedEdge => ({
    source,
    target,
    s,
    t,
    route: routeEdge(s, t, []),
    headAtTarget: true,
  });

  it("turns a diagonal edge into an L with one bend", () => {
    const e = routed("a", "b", box(0, 0), box(400, 300));
    expect(e.route.corner).toBeUndefined();
    preferCorners([e], () => []);
    expect([e.route.corner, e.route.from, e.route.to]).toEqual([true, "r", "t"]);
  });

  it("leaves the other way when the L it would take is blocked", () => {
    const e = routed("a", "b", box(0, 0), box(400, 300));
    // A box right of a, on the way to b's top.
    preferCorners([e], () => [wall(box(240, 0, 120, 120))]);
    expect([e.route.corner, e.route.from, e.route.to]).toEqual([true, "b", "l"]);
  });

  it("takes no L onto a side another edge uses", () => {
    const hub = box(0, 200);
    const up = routed("hub", "up", hub, box(400, -100));
    const level = routed("hub", "level", hub, box(400, 200));
    preferCorners([up, level], () => []);
    // Out of hub's right side it would run beside level: out of its top instead.
    expect([up.route.corner, up.route.from, up.route.to]).toEqual([true, "t", "l"]);
    // With hub's top taken too, it keeps its three pieces.
    const up2 = routed("hub", "up", hub, box(400, -100));
    const above = routed("hub", "above", hub, box(0, -200));
    preferCorners([up2, routed("hub", "level", hub, box(400, 200)), above], () => []);
    expect(up2.route.corner).toBeUndefined();
  });

  it("leaves boxes that overlap alone", () => {
    const e = routed("a", "b", box(0, 0), box(400, 60));
    preferCorners([e], () => []);
    expect(e.route.corner).toBeUndefined();
  });
});

describe("bundle", () => {
  const c = (source: string, target: string, arrow: "->" | "<->" | "--", summary = true) => ({
    source,
    target,
    arrow,
    summary,
  });

  it("puts summary connections that point the same way on one line", () => {
    const lines = bundle([
      c("a", "b", "->"),
      c("b", "a", "->"),
      c("a", "b", "->"),
      c("a", "b", "<->"),
      c("b", "a", "<->"),
      c("a", "b", "->", false),
    ]);
    expect(lines.map((l) => l.length)).toEqual([2, 1, 2, 1]);
    expect(lines[0]!.every((m) => m.source === "a")).toBe(true);
  });

  it("counts the connections a line stands for, with the protocol they share", () => {
    const http = { type: "http", payloads: [] };
    expect(bundleChip([http, { ...http, label: "x" }])).toEqual({
      protocol: "http",
      label: "2 connections",
      payloads: 0,
    });
    expect(bundleChip([{ ...http, label: "x", payloads: [1] }])).toEqual({
      protocol: "http",
      label: "x",
      payloads: 1,
    });
  });
});

describe("detour", () => {
  // Every piece of a polyline, as [x1, y1, x2, y2].
  const legs = (pts: { x: number; y: number }[]) => pts.slice(1).map((q, i) => [pts[i]!, q] as const);
  const crosses = (pts: { x: number; y: number }[], r: Rect) =>
    legs(pts).some(([a, b]) => {
      const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      return x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h;
    });

  it("goes around a box in the row that no bend gets past", () => {
    const a = box(0, 0);
    const b = box(800, 0);
    const middle = box(400, -20, 160, 160);
    const e: RoutedEdge = {
      source: "a",
      target: "b",
      s: a,
      t: b,
      route: routeEdge(a, b, [wall(middle)]),
      headAtTarget: true,
    };
    detour([e], () => [wall(middle)]);
    const pts = e.route.points!;
    expect(pts).toBeDefined();
    expect(crosses(pts, middle)).toBe(false);
    // Square corners only, and few of them.
    for (const [p, q] of legs(pts)) expect(p.x === q.x || p.y === q.y).toBe(true);
    expect(pts.length).toBeLessThanOrEqual(6);
  });

  it("leaves edges with a clear route alone", () => {
    const e: RoutedEdge = {
      source: "a",
      target: "b",
      s: box(0, 0),
      t: box(400, 200),
      route: routeEdge(box(0, 0), box(400, 200), []),
      headAtTarget: true,
    };
    detour([e], () => []);
    expect(e.route.points).toBeUndefined();
  });

  it("finds nothing when the target is walled in", () => {
    const t = box(400, 0);
    const ring = [
      box(360, -40, 240, 20),
      box(360, 140, 240, 20),
      box(360, -40, 20, 200),
      box(580, -40, 20, 200),
    ];
    expect(routeAround(box(0, 0), t, ring.map(wall))).toBeNull();
  });

  it("slides a detour's ends to their ports, keeping the pieces square", () => {
    const route = routeAround(box(0, 0), box(800, 0), [wall(box(400, -20, 160, 160))])!;
    const pts = detourPoints(route, { from: 10, to: -10 });
    expect(pts[0]!.y - route.points![0]!.y).toBe(route.from === "r" || route.from === "l" ? 10 : 0);
    for (const [p, q] of legs(pts)) expect(p.x === q.x || p.y === q.y).toBe(true);
  });
});
