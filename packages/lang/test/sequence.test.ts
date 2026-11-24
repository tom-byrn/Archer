import { describe, expect, it } from "vitest";
import {
  addSequence,
  diffDocs,
  format,
  insertStep,
  mergeDocs,
  messageConnection,
  moveStep,
  parse,
  removeComponent,
  removeStep,
  renameComponent,
  reparentComponent,
  sequenceParticipants,
  sequenceRows,
  sequenceUses,
  setMessageMeta,
  stepsFromConnections,
  validate,
  wrapInFragment,
} from "../src/index";

const SRC = `arch "Link Shortener" v0.2

component browser "Browser"

component app "Web App"

component api "API"

component cache "Hot Links"

component db "Links"

api -> cache @reads : "resolve"
api -> db @sql
app -> api @http : "shorten"
browser -> app @http

sequence shorten "Shorten a link" {
  browser -> app : "Paste long URL"
  app -> api @http : "POST /links"
  api -> cache : "GET slug"
  cache --> api : "miss"
  alt "slug is free" {
    api -> db @sql : "INSERT link"
    db --> api : "id"
  } else "taken" {
    api -> api : "pick another slug"
  }
  note over api, db "Slugs are unique per workspace"
  api --> app : "201 Created"
  app --> browser : "Short link"
}
`;

const doc = () => parse(SRC).doc;

describe("sequences: parse and format", () => {
  it("parses messages, fragments and notes", () => {
    const { doc: d, diagnostics } = parse(SRC);
    expect(diagnostics).toEqual([]);
    expect(d.sequences).toHaveLength(1);
    const seq = d.sequences[0]!;
    expect(seq.id).toBe("shorten");
    expect(seq.name).toBe("Shorten a link");
    expect(seq.steps.map((s) => s.kind)).toEqual([
      "message", "message", "message", "message", "fragment", "note", "message", "message",
    ]);
    const alt = seq.steps[4]!;
    expect(alt.kind === "fragment" && alt.branches.map((b) => [b.guard, b.steps.length])).toEqual([
      ["slug is free", 2],
      ["taken", 1],
    ]);
    expect(seq.steps[3]).toMatchObject({ arrow: "-->", from: ["cache"], to: ["api"], label: "miss" });
  });

  it("is canonical: format(parse(SRC)) is SRC, and stable", () => {
    expect(format(doc())).toBe(SRC);
    expect(format(parse(format(doc())).doc)).toBe(SRC);
  });

  it("keeps steps in written order, and sequences in document order", () => {
    const src = `arch "X" v0.2\n\ncomponent a\n\ncomponent b\n\nsequence z {\n  b -> a\n  a -> b\n}\n\nsequence a_first {}\n`;
    expect(format(parse(src).doc)).toBe(src);
  });

  it("reads async arrows and empty branches", () => {
    const src = `arch "X" v0.2\n\ncomponent a\n\ncomponent b\n\na -> b\n\nsequence s {\n  a ~> b @queue : "event"\n  opt "cached" {}\n  loop {\n    a -> b\n  }\n}\n`;
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    expect(format(r.doc)).toBe(src);
  });

  it("still allows components called sequence, note, alt or else", () => {
    const src = `arch "X" v0.2\ncomponent sequence\ncomponent note\ncomponent alt\ncomponent else\nsequence -> note\nsequence s {\n  alt -> else\n  note -> sequence\n}`;
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.connections).toHaveLength(1);
    expect(r.doc.sequences[0]!.steps).toHaveLength(2);
  });

  it("reports sequence arrows in connections, and connection arrows in sequences", () => {
    const a = parse(`arch "X" v0.2\ncomponent a\ncomponent b\na --> b`);
    expect(a.diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(a.diagnostics[0]!.message).toContain("sequence arrow");
    const b = parse(`arch "X" v0.2\ncomponent a\ncomponent b\nsequence s {\n  a <-> b\n  a -> b\n}`);
    expect(b.diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(b.doc.sequences[0]!.steps).toHaveLength(1);
  });

  it("only alt and par take else", () => {
    const r = parse(`arch "X" v0.2\ncomponent a\nsequence s {\n  opt { a -> a } else { a -> a }\n}`);
    expect(r.diagnostics[0]!.message).toContain("Only 'alt' and 'par'");
  });

  it("recovers from an unclosed sequence at the next top-level statement", () => {
    const r = parse(`arch "X" v0.2\ncomponent a\nsequence s {\n  a -> a\ncomponent b`);
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.doc.components.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("sequences: validate", () => {
  it("accepts the example", () => {
    expect(validate(doc())).toEqual([]);
  });

  it("E101: participants must be components", () => {
    const d = parse(`arch "X" v0.2\ncomponent a\nplane p\nsequence s {\n  a -> ghost\n  note over p "x"\n}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["E101", "E101"]);
  });

  it("E002: sequence ids are unique", () => {
    const d = parse(`arch "X" v0.2\nsequence s {}\nsequence s {}`).doc;
    expect(validate(d).map((x) => x.code)).toEqual(["E002"]);
  });

  it("W307: a call needs a connection; replies and self-calls don't", () => {
    const d = parse(`arch "X" v0.2\ncomponent a\ncomponent b\nb -> a\nsequence s {\n  a -> b\n  b --> a\n  b -> a\n  a -> a\n  a ~> b\n}`).doc;
    const w = validate(d);
    expect(w.map((x) => x.code)).toEqual(["W307", "W307"]);
    expect(w[0]!.message).toContain("step 1");
    expect(w[1]!.message).toContain("step 5");
  });

  it("an undirected or two-way connection carries calls both ways", () => {
    const d = parse(`arch "X" v0.2\ncomponent a\ncomponent b\na <-> b\nsequence s {\n  a -> b\n  b -> a\n}`).doc;
    expect(validate(d)).toEqual([]);
  });
});

describe("sequences: helpers", () => {
  it("rows number messages in reading order", () => {
    const rows = sequenceRows(doc().sequences[0]!);
    const numbered = rows.filter((r) => r.kind === "message").map((r) => (r.kind === "message" ? r.number : 0));
    expect(numbered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.map((r) => r.kind)).toContain("branch");
    expect(rows.find((r) => r.kind === "message" && r.number === 7)).toMatchObject({ address: [4, 1, 0], depth: 1 });
  });

  it("participants in order of first appearance", () => {
    expect(sequenceParticipants(doc().sequences[0]!).map((p) => p.join("."))).toEqual([
      "browser", "app", "api", "cache", "db",
    ]);
  });

  it("finds the connection a message travels on (replies go back along it)", () => {
    const d = doc();
    const at = (s: string) => d.connections.findIndex((c) => `${c.source} ${c.arrow} ${c.target}` === s);
    expect(messageConnection(d.connections, { from: ["api"], to: ["db"], arrow: "->" })).toBe(at("api -> db"));
    expect(messageConnection(d.connections, { from: ["db"], to: ["api"], arrow: "-->" })).toBe(at("api -> db"));
    expect(messageConnection(d.connections, { from: ["db"], to: ["api"], arrow: "->" })).toBe(-1);
    const uses = sequenceUses(d, at("api -> db"));
    expect(uses.map((u) => [u.sequence.id, u.messages.map((m) => m.number)])).toEqual([["shorten", [5, 6]]]);
  });
});

describe("sequences: transforms", () => {
  it("renames follow into sequences", () => {
    const d = renameComponent(doc(), ["db"], "links");
    expect(validate(d)).toEqual([]);
    expect(format(d)).toContain("api -> links @sql : \"INSERT link\"");
    expect(format(d)).toContain("note over api, links");
  });

  it("moving a component into another rewrites its paths", () => {
    const d = reparentComponent(doc(), ["db"], ["api"]);
    expect(validate(d)).toEqual([]);
    expect(format(d)).toContain("api -> api.db @sql");
  });

  it("removing a component drops its steps, and fragments left empty", () => {
    const d = removeComponent(doc(), ["db"]);
    expect(validate(d)).toEqual([]);
    const text = format(d);
    expect(text).not.toContain("INSERT link");
    expect(text).toContain("note over api \"Slugs");
    // The alt survives: its else branch still has a step.
    expect(text).toContain('alt "slug is free" {} else "taken"');
    const gone = removeComponent(removeComponent(doc(), ["db"]), ["api"]);
    expect(format(gone)).toContain('sequence shorten "Shorten a link" {\n  browser -> app : "Paste long URL"\n  app --> browser : "Short link"\n}');
  });

  it("adds, edits, moves and removes steps", () => {
    let d = addSequence(doc(), { name: "Resolve a link" }).doc;
    expect(d.sequences.map((s) => s.id)).toEqual(["shorten", "resolve_a_link"]);
    const msg = { kind: "message" as const, from: ["browser"], to: ["app"], arrow: "->" as const, span: d.sequences[0]!.span };
    d = insertStep(d, "resolve_a_link", { list: [], index: 0 }, msg).doc;
    d = insertStep(d, "resolve_a_link", { list: [], index: 1 }, { ...msg, from: ["app"], to: ["api"] }).doc;
    d = setMessageMeta(d, "resolve_a_link", [1], { label: "GET /:slug", type: "http" });
    d = moveStep(d, "resolve_a_link", [1], -1).doc;
    expect(format(d)).toContain('sequence resolve_a_link "Resolve a link" {\n  app -> api @http : "GET /:slug"\n  browser -> app\n}');
    d = wrapInFragment(d, "resolve_a_link", { list: [], index: 0 }, 2, "opt", "cold").doc;
    expect(format(d)).toContain('  opt "cold" {\n    app -> api');
    // Moving the first step of a branch up takes it out of the fragment.
    const out = moveStep(d, "resolve_a_link", [0, 0, 0], -1);
    expect(out.address).toEqual([0]);
    d = removeStep(out.doc, "resolve_a_link", [0]);
    expect(format(d)).toContain('  opt "cold" {\n    browser -> app\n  }');
    expect(() => insertStep(d, "resolve_a_link", { list: [], index: 0 }, { ...msg, to: ["nope"] })).toThrow("No component");
  });

  it("starts a sequence from the connections among some components", () => {
    const steps = stepsFromConnections(doc(), [["browser"], ["app"], ["api"], ["cache"]]);
    expect(steps.map((s) => `${s.from} -> ${s.to}`)).toEqual(["browser -> app", "app -> api", "api -> cache"]);
  });
});

describe("sequences: diff and merge", () => {
  it("diff reports sequences added, changed and removed", () => {
    const base = doc();
    const next = setMessageMeta(addSequence(base, { id: "other" }).doc, "shorten", [0], { label: "Paste" });
    expect(diffDocs(base, next).sequences).toEqual([
      { id: "shorten", kind: "changed" },
      { id: "other", kind: "added" },
    ]);
  });

  it("merges sequences whole: one side's edit wins, both editing conflicts", () => {
    const base = doc();
    const ours = setMessageMeta(base, "shorten", [0], { label: "ours" });
    const theirs = addSequence(base, { id: "theirs" }).doc;
    const m = mergeDocs(base, ours, theirs);
    expect(m.conflicts).toEqual([]);
    expect(m.doc.sequences.map((s) => s.id)).toEqual(["shorten", "theirs"]);
    expect(format(m.doc)).toContain(': "ours"');

    const both = mergeDocs(base, ours, setMessageMeta(base, "shorten", [0], { label: "theirs" }));
    expect(both.conflicts).toEqual([{ kind: "sequence", path: "shorten", reason: "changed on both sides" }]);
  });

  it("drops steps naming a component the other side removed", () => {
    const base = doc();
    const m = mergeDocs(base, base, removeComponent(base, ["cache"]));
    expect(format(m.doc)).not.toContain("GET slug");
    expect(m.conflicts).toEqual([]);
  });
});
