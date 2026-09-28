import { describe, expect, it } from "vitest";
import {
  connectionKey,
  diffDocs,
  format,
  isEmptyDiff,
  layoutMap,
  mergeForDiff,
  parse,
  summarizeDiff,
  validate,
} from "../src/index";

const HEADER = 'arch "X" v0.2\n';
const doc = (src: string) => parse(src).doc;

const BASE = doc(
  HEADER +
    `component web "Web" @vercel.nextjs {
  desc "front"
}
component backend "Backend" {
  component api "API" {
    endpoints json \`\`\`
    {"a": 1}
    \`\`\`
  }
  component db "DB" @postgres
}
component stripe

web -> backend.api @http
backend.api -> backend.db @sql
backend.api -> stripe @http : "checkout"

layout {
  web: { at: [0, 0], size: [4, 3] }
  backend: { at: [6, 0], size: [4, 3] }
  backend.api: { at: [1, 2], size: [4, 3] }
  backend.db: { at: [7, 2], size: [4, 3] }
  stripe: { at: [20, 0], size: [4, 3] }
}`,
);

describe("diffDocs", () => {
  it("is empty for identical docs and for layout-only changes", () => {
    expect(isEmptyDiff(diffDocs(BASE, BASE))).toBe(true);
    const moved = doc(format(BASE).replace("web: { at: [0, 0]", "web: { at: [9, 9]"));
    expect(layoutMap(moved).get("web")!.at).toEqual([9, 9]);
    expect(isEmptyDiff(diffDocs(BASE, moved))).toBe(true);
  });

  it("detects added, removed and changed components incl. nested paths", () => {
    const next = doc(
      HEADER +
        `component web "Web site" @vercel.nextjs {
  desc "front"
  src "apps/web"
}
component backend "Backend" {
  component api "API" {
    endpoints json \`\`\`
    {"a": 2}
    \`\`\`
  }
  component cache "Cache" @redis
}
component stripe

web -> backend.api @http
backend.api -> stripe @http : "checkout sessions"
backend.api -> backend.cache @redis`,
    );
    const d = diffDocs(BASE, next);
    expect(d.title).toBeUndefined();
    expect(d.components).toEqual([
      { path: "web", kind: "changed", fields: ["name", "src"] },
      { path: "backend.api", kind: "changed", fields: ["payloads"] },
      { path: "backend.cache", kind: "added" },
      { path: "backend.db", kind: "removed" },
    ]);
    // Children changes do not mark the parent as changed.
    expect(d.components.find((c) => c.path === "backend")).toBeUndefined();

    const conns = d.connections.map((c) => `${c.kind}:${c.key}`).sort();
    expect(conns).toEqual(
      [
        "added:backend.api|->|backend.cache|redis|",
        "added:backend.api|->|stripe|http|checkout sessions",
        "removed:backend.api|->|backend.db|sql|",
        "removed:backend.api|->|stripe|http|checkout",
      ].sort(),
    );
    expect(summarizeDiff(d)).toEqual({
      added: 1,
      removed: 1,
      changed: 2,
      connectionsAdded: 2,
      connectionsRemoved: 2,
      connectionsChanged: 0,
      planesAdded: 0,
      planesRemoved: 0,
      planesChanged: 0,
    });
  });

  it("reports a connection whose payloads changed as changed, not removed+added", () => {
    const next = doc(
      format(BASE).replace(
        "web -> backend.api @http",
        'web -> backend.api @http {\n  request json ```\n  {"q": "string"}\n  ```\n}',
      ),
    );
    const d = diffDocs(BASE, next);
    expect(d.components).toEqual([]);
    expect(d.connections.map((c) => `${c.kind}:${c.key}`)).toEqual([
      "changed:web|->|backend.api|http|",
    ]);
    expect(summarizeDiff(d).connectionsChanged).toBe(1);
    expect(mergeForDiff(BASE, next).connections.get("web|->|backend.api|http|")).toBe("changed");
    // Same payloads again: no change.
    expect(isEmptyDiff(diffDocs(next, doc(format(next))))).toBe(true);
  });

  it("detects a title change", () => {
    const next = doc(format(BASE).replace('arch "X"', 'arch "Y"'));
    const d = diffDocs(BASE, next);
    expect(d.title).toEqual({ from: "X", to: "Y" });
    expect(d.components).toEqual([]);
    expect(isEmptyDiff(d)).toBe(false);
  });

  it("treats a changed type or desc as changed with the right fields", () => {
    const next = doc(format(BASE).replace("@postgres", "@mysql").replace('desc "front"', 'desc "frontend"'));
    const d = diffDocs(BASE, next);
    expect(d.components).toEqual([
      { path: "web", kind: "changed", fields: ["desc"] },
      { path: "backend.db", kind: "changed", fields: ["type"] },
    ]);
  });

  it("counts planes, what they're called, and which plane things sit on", () => {
    const base = doc(`${HEADER}plane front "Front" {
  component web
}
plane back "Back" {
  component api
}
plane old "Old"
component db`);
    const next = doc(`${HEADER}plane front "Frontend" {
  component web
  component api
}
plane back "Back" {
  plane data "Data" {
    component db
  }
}`);
    const d = diffDocs(base, next);
    expect(d.planes).toEqual([
      { path: "front", kind: "changed", fields: ["name"] },
      { path: "data", kind: "added" },
      { path: "old", kind: "removed" },
    ]);
    expect(d.components).toEqual([
      { path: "api", kind: "changed", fields: ["plane"] },
      { path: "db", kind: "changed", fields: ["plane"] },
    ]);
    expect(summarizeDiff(d)).toMatchObject({ changed: 2, planesAdded: 1, planesRemoved: 1, planesChanged: 1 });
    expect(isEmptyDiff(diffDocs(base, doc(format(base))))).toBe(true);
  });

  it("sees a plane added with nothing else changed", () => {
    const base = doc(`${HEADER}component a\ncomponent b`);
    const next = doc(`${HEADER}plane p {\n  component a\n  component b\n}`);
    const d = diffDocs(base, next);
    expect(isEmptyDiff(d)).toBe(false);
    expect(d.planes).toEqual([{ path: "p", kind: "added" }]);
  });

  it("connectionKey ignores position but not label/type/arrow", () => {
    const a = BASE.connections[0]!;
    expect(connectionKey(a)).toBe("web|->|backend.api|http|");
    expect(connectionKey({ ...a, arrow: "<->" })).toBe("web|<->|backend.api|http|");
  });
});

describe("mergeForDiff", () => {
  it("re-inserts a removed nested subtree with its layout and stays valid", () => {
    // Remove the whole backend (api + db) and the connections touching it.
    const next = doc(
      HEADER +
        `component web "Web" @vercel.nextjs {
  desc "front"
}
component stripe
component queue @sqs

web -> stripe @http

layout {
  web: { at: [0, 0], size: [4, 3] }
  stripe: { at: [20, 0], size: [4, 3] }
}`,
    );
    const { doc: merged, components, connections } = mergeForDiff(BASE, next);

    expect(components.get("backend")).toBe("removed");
    expect(components.get("backend.api")).toBe("removed");
    expect(components.get("backend.db")).toBe("removed");
    expect(components.get("queue")).toBe("added");
    expect(components.has("web")).toBe(false);

    // Tree structure restored under the re-inserted parent.
    const backend = merged.components.find((c) => c.id === "backend")!;
    expect(backend.children.map((c) => c.id)).toEqual(["api", "db"]);
    expect(backend.children[0]!.payloads).toHaveLength(1);

    // Layout entries come from base for removed paths.
    const lm = layoutMap(merged);
    expect(lm.get("backend")!.at).toEqual([6, 0]);
    expect(lm.get("backend.db")!.at).toEqual([7, 2]);
    expect(lm.get("web")!.at).toEqual([0, 0]);

    // Removed connections are back (their endpoints exist again), added ones flagged.
    expect(connections.get("web|->|backend.api|http|")).toBe("removed");
    expect(connections.get("backend.api|->|backend.db|sql|")).toBe("removed");
    expect(connections.get("backend.api|->|stripe|http|checkout")).toBe("removed");
    expect(connections.get("web|->|stripe|http|")).toBe("added");
    expect(merged.connections).toHaveLength(4);

    expect(validate(merged).filter((d) => d.severity === "error")).toEqual([]);
    // The merged doc is a real document: it formats and re-parses cleanly.
    expect(parse(format(merged)).diagnostics).toEqual([]);
  });

  it("puts a removed plane back, with what was on it", () => {
    const base = doc(`${HEADER}plane back "Back" {
  component api
  component db
}
component web
web -> api
layout {
  back: { at: [6, 0], size: [12, 6] }
  api: { at: [1, 2], size: [4, 3] }
  db: { at: [7, 2], size: [4, 3] }
  web: { at: [0, 0], size: [4, 3] }
}`);
    const next = doc(`${HEADER}component web\ncomponent api\nweb -> api`);
    const { doc: merged, components, planes } = mergeForDiff(base, next);
    expect(planes.get("back")).toBe("removed");
    expect(components.get("db")).toBe("removed");
    expect(components.get("api")).toBe("changed");
    expect(merged.planes.map((p) => p.id)).toEqual(["back"]);
    // db goes back on its plane; api (still there, now on no plane) stays put.
    expect(merged.components.find((c) => c.id === "db")!.plane).toBe("back");
    expect(merged.components.find((c) => c.id === "api")!.plane).toBeUndefined();
    expect(layoutMap(merged).get("back")!.at).toEqual([6, 0]);
    expect(validate(merged).filter((x) => x.severity === "error")).toEqual([]);
  });

  it("doesn't put back a plane whose id something else now has", () => {
    const base = doc(`${HEADER}plane back {\n  component api\n}`);
    const next = doc(`${HEADER}component back {\n  component api\n}`);
    const { doc: merged, planes, components } = mergeForDiff(base, next);
    expect(planes.has("back")).toBe(false);
    expect(merged.planes).toEqual([]);
    expect(components.get("back")).toBe("added");
    expect(components.get("api")).toBe("removed");
  });

  it("keeps next's layout for surviving components and marks changed ones", () => {
    const next = doc(format(BASE).replace("web: { at: [0, 0]", "web: { at: [2, 2]").replace('"Web"', '"Web app"'));
    const { doc: merged, components } = mergeForDiff(BASE, next);
    expect(layoutMap(merged).get("web")!.at).toEqual([2, 2]);
    expect(components.get("web")).toBe("changed");
    expect(merged.components.map((c) => c.id)).toEqual(["web", "backend", "stripe"]);
  });
});
