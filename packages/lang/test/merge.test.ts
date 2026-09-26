import { describe, expect, it } from "vitest";
import { diffDocs, format, isEmptyDiff, mergeDocs, parse, validate } from "../src/index";

const doc = (body: string, title = "Shop") => parse(`arch "${title}" v0.2\n\n${body}`).doc;
const semantic = (d: Parameters<typeof format>[0]) => format(d, { stripLayout: true });

const BASE = doc(`component web "Web" @vercel.nextjs {
  desc "Storefront"
}

component api "API" {
  desc "Orders and checkout"
  endpoints json \`\`\`
  {"POST /orders": "create"}
  \`\`\`
}

component db "Postgres" @postgres

web -> api @http
api -> db @sql

layout {
  web: { at: [0, 0], size: [4, 3] }
  api: { at: [6, 0], size: [4, 3] }
  db: { at: [12, 0], size: [4, 3] }
}`);

/** Apply a text edit to BASE's canonical source. */
const edit = (fn: (src: string) => string) => parse(fn(format(BASE))).doc;

describe("mergeDocs", () => {
  it("returns theirs when ours is unchanged, and ours when theirs is", () => {
    const theirs = edit((s) => s.replace('desc "Storefront"', 'desc "Shop front"'));
    expect(semantic(mergeDocs(BASE, BASE, theirs).doc)).toBe(semantic(theirs));
    const ours = edit((s) => s.replace('desc "Storefront"', 'desc "Web shop"'));
    const r = mergeDocs(BASE, ours, BASE);
    expect(r.conflicts).toEqual([]);
    expect(semantic(r.doc)).toBe(semantic(ours));
  });

  it("combines edits to different components", () => {
    const ours = edit((s) => s.replace('component db "Postgres" @postgres', 'component db "Postgres" @postgres\n\ncomponent cache "Redis" @redis'));
    const theirs = edit((s) => s.replace('desc "Orders and checkout"', 'desc "Orders, checkout and refunds"'));
    const r = mergeDocs(BASE, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(isEmptyDiff(diffDocs(r.doc, parse(format(r.doc)).doc))).toBe(true);
    const text = semantic(r.doc);
    expect(text).toContain('component cache "Redis" @redis');
    expect(text).toContain("Orders, checkout and refunds");
  });

  it("combines edits to different fields and payloads of one component", () => {
    const ours = edit((s) => s.replace('component api "API"', 'component api "Orders API"'));
    const theirs = edit((s) =>
      s.replace('desc "Orders and checkout"', 'desc "Orders and checkout"\n  notes markdown ```\n  Rate limited.\n  ```'),
    );
    const r = mergeDocs(BASE, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const api = r.doc.components.find((c) => c.id === "api")!;
    expect(api.name).toBe("Orders API");
    expect(api.payloads.map((p) => p.name).sort()).toEqual(["endpoints", "notes"]);
  });

  it("does not flag the same change made on both sides", () => {
    const both = edit((s) => s.replace('desc "Storefront"', 'desc "Shop front"'));
    const r = mergeDocs(BASE, both, both);
    expect(r.conflicts).toEqual([]);
    expect(semantic(r.doc)).toBe(semantic(both));
  });

  it("reports a field changed differently on both sides, keeping ours", () => {
    const ours = edit((s) => s.replace('desc "Storefront"', 'desc "Ours"'));
    const theirs = edit((s) => s.replace('desc "Storefront"', 'desc "Theirs"'));
    const r = mergeDocs(BASE, ours, theirs);
    expect(r.conflicts).toEqual([{ kind: "component", path: "web", reason: "changed desc on both sides" }]);
    expect(r.doc.components.find((c) => c.id === "web")!.desc).toBe("Ours");
  });

  it("removes what one side deleted when the other left it alone", () => {
    const theirs = edit((s) => s.replace(/component db[^\n]*\n\n/, "").replace("api -> db @sql\n", ""));
    const ours = edit((s) => s.replace('desc "Storefront"', 'desc "Shop front"'));
    const r = mergeDocs(BASE, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.doc.components.map((c) => c.id)).toEqual(["web", "api"]);
    expect(r.doc.connections).toHaveLength(1);
    expect(r.doc.layout.map((e) => e.path.join(".")).sort()).toEqual(["api", "web"]);
  });

  it("reports a component removed on one side and changed on the other", () => {
    const ours = edit((s) => s.replace('component db "Postgres" @postgres', 'component db "Primary DB" @postgres'));
    const theirs = edit((s) => s.replace(/component db[^\n]*\n\n/, "").replace("api -> db @sql\n", ""));
    const r = mergeDocs(BASE, ours, theirs);
    expect(r.conflicts).toEqual([
      { kind: "component", path: "db", reason: "removed on one side, changed on the other" },
    ]);
    expect(r.doc.components.some((c) => c.id === "db")).toBe(true);
  });

  it("keeps connections added on both sides and drops ones left dangling", () => {
    const ours = edit((s) => s.replace("api -> db @sql", "api -> db @sql\nweb -> db @sql"));
    const theirs = edit((s) =>
      s
        .replace('component db "Postgres" @postgres', 'component db "Postgres" @postgres\n\ncomponent queue "Queue" @sqs')
        .replace("api -> db @sql", "api -> db @sql\napi -> queue @queue"),
    );
    const clean = mergeDocs(BASE, ours, theirs);
    expect(clean.conflicts).toEqual([]);
    expect(clean.doc.connections).toHaveLength(4);

    const removed = edit((s) => s.replace(/component db[^\n]*\n\n/, "").replace("api -> db @sql\n", ""));
    const r = mergeDocs(BASE, ours, removed);
    expect(r.conflicts.map((c) => c.reason)).toEqual(["points at a component the other side removed"]);
    const errors = validate(r.doc).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("merges nested components by path", () => {
    const nested = doc(`component backend "Backend" {
  component api "API"
  component db "DB"
}`);
    const ours = parse(format(nested).replace('component db "DB"', 'component db "DB" {\n    desc "Postgres 16"\n  }')).doc;
    const theirs = parse(format(nested).replace('component db "DB"', 'component db "DB"\n  component cache "Cache"')).doc;
    const r = mergeDocs(nested, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const backend = r.doc.components[0]!;
    expect(backend.children.map((c) => c.id)).toEqual(["api", "db", "cache"]);
    expect(backend.children[1]!.desc).toBe("Postgres 16");
  });

  it("merges the title like any field", () => {
    const ours = doc(format(BASE).split("\n").slice(2).join("\n"), "Shop v2");
    const r = mergeDocs(BASE, ours, BASE);
    expect(r.doc.title).toBe("Shop v2");
    const theirs = doc(format(BASE).split("\n").slice(2).join("\n"), "Store");
    expect(mergeDocs(BASE, ours, theirs).conflicts).toEqual([
      { kind: "title", path: "title", reason: "renamed on both sides" },
    ]);
  });
});

describe("mergeDocs: planes", () => {
  const PLANES = doc(`plane front "Front" {
  component web
}
plane back "Back" {
  component api
  component db
}
web -> api`);
  const change = (fn: (src: string) => string) => parse(fn(format(PLANES))).doc;

  it("merges planes by id: a new plane on one side, a renamed one on the other", () => {
    const ours = change((s) => s.replace('plane front "Front"', 'plane front "Frontend"'));
    const theirs = change((s) => s.replace("component web\n}", "component web\n}\n\nplane ops \"Ops\""));
    const r = mergeDocs(PLANES, ours, theirs);
    expect(r.conflicts).toEqual([]);
    // In theirs' order, where ops went in after front.
    expect(r.doc.planes.map((p) => [p.id, p.name])).toEqual([
      ["front", "Frontend"],
      ["ops", "Ops"],
      ["back", "Back"],
    ]);
  });

  it("merges moving a component between planes with a change to it", () => {
    const ours = change((s) => s.replace("  component db\n", "").replace("component web\n", "component web\n  component db\n"));
    const theirs = change((s) => s.replace("component db", 'component db "Orders DB"'));
    const r = mergeDocs(PLANES, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const db = r.doc.components.find((c) => c.id === "db")!;
    expect([db.plane, db.name]).toEqual(["front", "Orders DB"]);
  });

  it("conflicts when both sides put a component on different planes", () => {
    const ours = change((s) => s.replace("  component db\n", "").replace("component web\n", "component web\n  component db\n"));
    const theirs = change((s) => s.replace("  component db\n", "") + "\nplane data {\n  component db\n}\n");
    const r = mergeDocs(PLANES, ours, theirs);
    expect(r.conflicts).toEqual([{ kind: "component", path: "db", reason: "changed plane on both sides" }]);
    expect(r.doc.components.find((c) => c.id === "db")!.plane).toBe("front");
  });

  it("takes a component off a plane the other side removed, and says so", () => {
    // Ours adds a cache on back; theirs removes back (and what was on it).
    const ours = change((s) => s.replace("component db\n", "component db\n  component cache\n"));
    const theirs = change((s) =>
      s.replace(/plane back "Back" \{[^}]*\}\n/, "component api\ncomponent db\n"),
    );
    const r = mergeDocs(PLANES, ours, theirs);
    expect(r.doc.planes.map((p) => p.id)).toEqual(["front"]);
    expect(r.conflicts).toEqual([
      { kind: "component", path: "cache", reason: "sits on a plane the other side removed" },
    ]);
    expect(r.doc.components.find((c) => c.id === "cache")!.plane).toBeUndefined();
    expect(validate(r.doc).filter((d) => d.severity === "error")).toEqual([]);
  });

  it("conflicts when one side adds a component and the other a plane with one id", () => {
    const ours = change((s) => s + "\ncomponent ops\n");
    const theirs = change((s) => s + "\nplane ops\n");
    const r = mergeDocs(PLANES, ours, theirs);
    expect(r.conflicts).toEqual([
      { kind: "plane", path: "ops", reason: "a component and a plane were added with this id" },
    ]);
    expect(r.doc.components.some((c) => c.id === "ops")).toBe(true);
    expect(r.doc.planes.some((p) => p.id === "ops")).toBe(false);
  });

  it("merges planes inside components", () => {
    const base = doc("component api {\n  component x\n}");
    const ours = parse(format(base).replace("component x", "plane jobs {\n    component x\n  }")).doc;
    const theirs = parse(format(base).replace("component x", 'component x "X"')).doc;
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const api = r.doc.components[0]!;
    expect(api.planes.map((p) => p.id)).toEqual(["jobs"]);
    expect([api.children[0]!.plane, api.children[0]!.name]).toEqual(["jobs", "X"]);
  });
});
