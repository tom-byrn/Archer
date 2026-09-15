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

const HEADER = 'arch "X" v0.1\n';
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
  backend: { at: [6, 0], size: [12, 8], display: plane }
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
    });
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
    expect(lm.get("backend")!.display).toBe("plane");
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

  it("keeps next's layout for surviving components and marks changed ones", () => {
    const next = doc(format(BASE).replace("web: { at: [0, 0]", "web: { at: [2, 2]").replace('"Web"', '"Web app"'));
    const { doc: merged, components } = mergeForDiff(BASE, next);
    expect(layoutMap(merged).get("web")!.at).toEqual([2, 2]);
    expect(components.get("web")).toBe("changed");
    expect(merged.components.map((c) => c.id)).toEqual(["web", "backend", "stripe"]);
  });
});
