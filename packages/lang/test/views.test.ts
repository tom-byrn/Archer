import { describe, expect, it } from "vitest";
import {
  addEntity,
  addFlowNode,
  addGraphEdgeTo,
  addState,
  addView,
  allViews,
  diffDocs,
  format,
  mergeDocs,
  parse,
  removeComponent,
  removeEntity,
  removeGraphNode,
  renameComponent,
  setEntity,
  setFlowNode,
  setGraphEdge,
  setState,
  setViewMeta,
  validate,
  viewsWith,
} from "../src/index";

const SRC = `arch "Link Shortener" v0.2

component browser "Browser"

component app "Web App"

component api "API"

component db "Links"

api -> db @sql
app -> api @http
browser -> app @http

flow publish "Publish a link" {
  start begin in browser
  step paste "Paste URL" in browser
  decision valid "Valid URL?" in api
  step store "Store link" in api
  step error "Show error" in app
  end done
  begin -> paste
  paste -> valid
  valid -> store : "yes"
  valid -> error : "no"
  store -> done
}

states lifecycle "Link lifecycle" of db {
  state pending "Pending" initial
  state live "Live"
  state expired "Expired" final
  pending -> live : "slug reserved"
  live -> live : "clicked"
  live -> expired : "TTL passed"
}

entities schema "Links schema" on db {
  entity link "Link" {
    id uuid pk
    slug text unique
    url "varchar(2048)"
    expires_at timestamp optional
  }
  entity click "Click" {
    id uuid pk
    link_id uuid -> link.id
    at timestamp
  }
  entity tag
}
`;

const doc = () => parse(SRC).doc;

describe("views: parse and format", () => {
  it("parses flows, state machines and data models", () => {
    const { doc: d, diagnostics } = parse(SRC);
    expect(diagnostics).toEqual([]);
    expect(d.flows[0]!.nodes.map((n) => `${n.node}:${n.id}:${n.lane?.join(".") ?? "-"}`)).toEqual([
      "start:begin:browser", "step:paste:browser", "decision:valid:api", "step:store:api", "step:error:app", "end:done:-",
    ]);
    expect(d.flows[0]!.edges[2]).toMatchObject({ from: "valid", to: "store", label: "yes" });
    expect(d.machines[0]).toMatchObject({ id: "lifecycle", of: ["db"] });
    expect(d.machines[0]!.states.map((s) => [s.id, !!s.initial, !!s.final])).toEqual([
      ["pending", true, false], ["live", false, false], ["expired", false, true],
    ]);
    const link = d.models[0]!.entities[0]!;
    expect(link.fields[1]).toEqual({ name: "slug", type: "text", unique: true });
    expect(link.fields[2]).toEqual({ name: "url", type: "varchar(2048)" });
    expect(d.models[0]!.entities[1]!.fields[1]).toEqual({ name: "link_id", type: "uuid", ref: { entity: "link", field: "id" } });
    expect(allViews(d).map((v) => `${v.kind}:${v.node.id}`)).toEqual(["flow:publish", "states:lifecycle", "entities:schema"]);
  });

  it("is canonical", () => {
    expect(format(doc())).toBe(SRC);
  });

  it("keeps keywords usable as ids", () => {
    const src = `arch "X" v0.2\ncomponent flow\ncomponent states\ncomponent entities\nflow -> states\nstates -> entities\nflow f {\n  step in in flow\n  step state\n  in -> state\n}`;
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.connections).toHaveLength(2);
    expect(r.doc.flows[0]!.nodes.map((n) => [n.id, n.lane?.[0]])).toEqual([["in", "flow"], ["state", undefined]]);
  });

  it("reads modifiers only on the field's own line", () => {
    const r = parse(`arch "X" v0.2\nentities m {\n  entity e {\n    id uuid\n    unique text\n  }\n}`);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.models[0]!.entities[0]!.fields).toEqual([{ name: "id", type: "uuid" }, { name: "unique", type: "text" }]);
  });

  it("recovers line by line inside a view", () => {
    const r = parse(`arch "X" v0.2\nflow f {\n  step a\n  oops oops oops\n  step b\n  a -> b\n}\ncomponent c`);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.doc.flows[0]!.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(r.doc.components.map((c) => c.id)).toEqual(["c"]);
  });
});

describe("views: validate", () => {
  it("accepts the example", () => {
    expect(validate(doc())).toEqual([]);
  });

  it("E002: one id namespace for every view, and unique ids inside one", () => {
    const d = parse(`arch "X" v0.2\nsequence v {}\nflow v {}\nstates m {\n  state a initial\n  state a\n}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["E002", "E002"]);
  });

  it("E101: lanes and subjects are components", () => {
    const d = parse(`arch "X" v0.2\nplane p\nflow f {\n  step a in ghost\n}\nstates s of p {\n  state a initial\n}\nentities e on ghost {}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["E101", "E101", "E101"]);
  });

  it("E102: edges, transitions and references resolve inside the view", () => {
    const d = parse(`arch "X" v0.2\nflow f {\n  step a\n  a -> b\n}\nstates s {\n  state a initial\n  a -> z\n}\nentities e {\n  entity x {\n    y_id uuid -> y\n    a_id uuid -> x.nope\n  }\n}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["E102", "E102", "E102", "E102"]);
  });

  it("W308: a state machine without an initial state", () => {
    const d = parse(`arch "X" v0.2\nstates s {\n  state a\n}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["W308"]);
  });
});

describe("views: follow the architecture", () => {
  it("renames follow into lanes and subjects", () => {
    const text = format(renameComponent(doc(), ["db"], "store"));
    expect(text).toContain('states lifecycle "Link lifecycle" of store {');
    expect(text).toContain('entities schema "Links schema" on store {');
  });

  it("removing a component clears lanes and subjects but keeps the views", () => {
    const d = removeComponent(removeComponent(doc(), ["db"]), ["browser"]);
    expect(validate(d)).toEqual([]);
    const text = format(d);
    expect(text).toContain('states lifecycle "Link lifecycle" {');
    expect(text).toContain("  start begin\n");
  });

  it("lists the views a component takes part in", () => {
    expect(viewsWith(doc(), ["db"]).map((v) => v.node.id)).toEqual(["lifecycle", "schema"]);
    expect(viewsWith(doc(), ["api"]).map((v) => v.node.id)).toEqual(["publish"]);
  });
});

describe("views: transforms", () => {
  it("adds views of each kind in one namespace", () => {
    let d = doc();
    d = addView(d, "flow", { name: "Sign up" }).doc;
    d = addView(d, "states", { name: "Order", subject: ["api"] }).doc;
    expect(() => addView(d, "entities", { id: "publish" })).toThrow("Duplicate view id");
    expect(() => addView(d, "entities", { subject: ["nope"] })).toThrow("No component");
    d = setViewMeta(d, "order", { name: "Orders", subject: null });
    expect(format(d)).toContain('flow sign_up "Sign up" {}');
    expect(format(d)).toContain('states order "Orders" {}');
  });

  it("edits a flow: nodes join on from the selected one, renames carry edges", () => {
    let d = doc();
    const r = addFlowNode(d, "publish", { node: "step", name: "Notify", lane: ["app"] }, "store");
    d = setFlowNode(r.doc, "publish", r.id, { id: "notify_user", node: "end" });
    expect(format(d)).toContain('  end notify_user "Notify" in app');
    expect(format(d)).toContain("  store -> notify_user");
    d = removeGraphNode(d, "publish", "valid");
    expect(format(d)).not.toContain("valid");
  });

  it("edits a state machine", () => {
    let d = addState(doc(), "lifecycle", { name: "Blocked" }, "live").doc;
    d = setState(d, "lifecycle", "blocked", { final: true });
    d = addGraphEdgeTo(d, "lifecycle", "blocked", "live", "unblocked").doc;
    d = setGraphEdge(d, "lifecycle", 0, { label: null });
    const text = format(d);
    expect(text).toContain('  state blocked "Blocked" final');
    expect(text).toContain("  live -> blocked\n");
    expect(text).toContain('  blocked -> live : "unblocked"');
    expect(text).toContain("  pending -> live\n");
    expect(() => addGraphEdgeTo(d, "lifecycle", "live", "ghost")).toThrow("No state");
  });

  it("edits a data model: renames follow references, removals drop them", () => {
    let d = addEntity(doc(), "schema", { name: "Owner" }).doc;
    expect(format(d)).toContain('  entity owner "Owner" {\n    id uuid pk\n  }');
    d = setEntity(d, "schema", "link", { id: "short_link" });
    expect(format(d)).toContain("link_id uuid -> short_link.id");
    d = removeEntity(d, "schema", "short_link");
    expect(format(d)).toContain("    link_id uuid\n");
    expect(validate(d)).toEqual([]);
  });
});

describe("views: diff and merge", () => {
  it("diff reports every kind of view", () => {
    const base = doc();
    const next = setState(addView(base, "flow", { id: "other" }).doc, "lifecycle", "live", { name: "Active" });
    expect(diffDocs(base, next).views).toEqual([
      { view: "flow", id: "other", kind: "added" },
      { view: "states", id: "lifecycle", kind: "changed" },
    ]);
  });

  it("merges views whole and conflicts when both sides edit one", () => {
    const base = doc();
    const ours = setState(base, "lifecycle", "live", { name: "Ours" });
    const theirs = addEntity(base, "schema", { id: "owner" }).doc;
    const m = mergeDocs(base, ours, theirs);
    expect(m.conflicts).toEqual([]);
    expect(format(m.doc)).toContain('state live "Ours"');
    expect(format(m.doc)).toContain("entity owner");
    const both = mergeDocs(base, ours, setState(base, "lifecycle", "live", { name: "Theirs" }));
    expect(both.conflicts).toEqual([{ kind: "view", path: "lifecycle", reason: "changed on both sides" }]);
  });
});
