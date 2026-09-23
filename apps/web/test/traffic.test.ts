import { describe, expect, it } from "vitest";
import { parse, type ArchDoc } from "@archer/lang";
import { findExample } from "../lib/examples";
import { describeSources, entryPoints, planTraffic, type TrafficPlan } from "../lib/traffic";

const doc = (source: string): ArchDoc => parse(`arch "Test" v0.1\n${source}`).doc;
const example = (slug: string): ArchDoc => parse(findExample(slug)!.source).doc;

/** Hops as "from -> to @start", in time order, replies marked. */
const trace = (d: ArchDoc, plan: TrafficPlan): string[] =>
  [...plan.hops]
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((h) => {
      const c = d.connections[h.index]!;
      const [from, to] = h.reverse ? [c.target, c.source] : [c.source, c.target];
      return `${from.join(".")} -> ${to.join(".")} @${h.start}${h.reply ? " reply" : ""}`;
    });

describe("planTraffic", () => {
  it("follows a request through a web app and back", () => {
    const d = example("components-and-connections");
    const plan = planTraffic(d);
    expect(plan.sources).toEqual(["browser"]);
    expect(trace(d, plan)).toEqual([
      "browser -> app @150",
      "app -> api @1000",
      "api -> cache @1850",
      "api -> db @1850",
      "cache -> api @2700 reply",
      "db -> api @2700 reply",
      "api -> app @3400 reply",
      "app -> browser @4100 reply",
    ]);
    expect([...plan.paths].sort()).toEqual(["api", "app", "browser", "cache", "db"]);
  });

  it("sends queues, events and streams one way, without waiting on them", () => {
    const d = doc(`
component web @browser
component api
component jobs @queue
component worker
web -> api @http
api -> jobs @queue
jobs -> worker @event
`);
    // The API answers the browser as soon as the job is queued.
    expect(trace(d, planTraffic(d))).toEqual([
      "web -> api @150",
      "api -> web @1000 reply",
      "api -> jobs @1000",
      "jobs -> worker @1850",
    ]);
  });

  it("carries nothing on undirected or structural connections", () => {
    const d = doc(`
component a
component b
component c
a -- b
a -> c @deploys
b -> c @depends
c -> a @contains
`);
    const plan = planTraffic(d);
    expect(plan.hops).toEqual([]);
    expect(plan.connections.size).toBe(0);
  });

  it("reaches everything inside a group, and starts from users", () => {
    const d = example("music-streaming");
    const plan = planTraffic(d);
    // The royalty and training jobs also call out, but the listener apps stand for users.
    expect(plan.sources).toEqual(["apps"]);
    for (const p of ["apps.mobile", "gateway", "services.playback", "storage.sessions", "stripe"]) {
      expect(plan.paths).toContain(p);
    }
    for (const p of ["analytics.royalties", "content.inbox", "labels"]) {
      expect(plan.paths).not.toContain(p);
    }
    const unsigned = d.connections.findIndex((c) => c.arrow === "--");
    expect(plan.connections).not.toContain(unsigned);
  });

  it("sends from a component inside a group along the group's connections", () => {
    const d = example("music-streaming");
    const plan = planTraffic(d, "apps.mobile");
    expect(plan.sources).toEqual(["apps.mobile"]);
    expect(trace(d, plan)).toContain("apps -> gateway @150");
  });

  it("travels both ways on <->", () => {
    const d = doc(`
component a @browser
component b
a <-> b @ws
`);
    expect(trace(d, planTraffic(d))).toEqual([
      "a -> b @150",
      "b -> a @1000",
      "a -> b @1850 reply",
      "b -> a @2550 reply",
    ]);
  });

  it("terminates on cycles, starting from the first caller", () => {
    const d = doc(`
component a
component b
a -> b
b -> a
`);
    expect(entryPoints(d)).toEqual(["a"]);
    expect(trace(d, planTraffic(d))).toEqual([
      "a -> b @150",
      "b -> a @1000",
      "a -> b @1850 reply",
      "b -> a @2550 reply",
    ]);
  });

  it("sends nothing from a component that calls nothing", () => {
    const d = example("components-and-connections");
    const plan = planTraffic(d, "db");
    expect(plan.sources).toEqual(["db"]);
    expect(plan.hops).toEqual([]);
  });

  it("falls back to the entry points when the source is gone", () => {
    const d = example("components-and-connections");
    expect(planTraffic(d, "deleted.component").sources).toEqual(["browser"]);
  });
});

describe("describeSources", () => {
  it("names one, two, or a few", () => {
    const d = doc(`
component a "Browser"
component b "Mobile App"
component c
component d
`);
    expect(describeSources(d, ["a"])).toBe("Browser");
    expect(describeSources(d, ["a", "b"])).toBe("Browser and Mobile App");
    expect(describeSources(d, ["a", "b", "c", "d"])).toBe("Browser, Mobile App and 2 more");
  });
});
