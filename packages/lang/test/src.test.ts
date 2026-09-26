import { describe, expect, it } from "vitest";
import { compileForAgent, diffDocs, format, mergeDocs, parse, setComponentMeta } from "../src/index";

const stripSpans = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, v) => (key === "span" ? undefined : v)));

const HEADER = 'arch "X" v0.1\n';

describe("src field", () => {
  it("parses src alongside desc, payloads and children", () => {
    const { doc, diagnostics } = parse(
      HEADER +
        `component api "API" @vercel.functions {
  desc "Route handlers."
  src "apps/api/src"
  endpoints json \`\`\`
  {}
  \`\`\`
  component inner {
    src "https://github.com/acme/inner"
  }
}`,
    );
    expect(diagnostics).toEqual([]);
    const api = doc.components[0]!;
    expect(api.src).toEqual(["apps/api/src"]);
    expect(api.desc).toBe("Route handlers.");
    expect(api.payloads).toHaveLength(1);
    expect(api.children[0]!.src).toEqual(["https://github.com/acme/inner"]);
  });

  it("formats src right after desc and round-trips", () => {
    const original = parse(
      HEADER + `component web "Web" {\n  src "apps/web"\n  desc "Front end"\n}`,
    ).doc;
    const once = format(original);
    expect(once).toContain('  desc "Front end"\n  src "apps/web"\n');
    const reparsed = parse(once).doc;
    expect(stripSpans(reparsed.components)).toEqual(stripSpans(original.components));
    expect(format(reparsed)).toBe(once);
  });

  it("src without desc comes first in the body", () => {
    const out = format(parse(HEADER + `component web {\n  src "apps/web"\n}`).doc);
    expect(out).toContain('component web {\n  src "apps/web"\n}');
  });

  it("rejects a non-string after src", () => {
    const { diagnostics } = parse(HEADER + `component web {\n  src 42\n}`);
    expect(diagnostics.some((d) => d.code === "E001" && /after 'src'/.test(d.message))).toBe(true);
  });

  it("rejects a triple-quoted src", () => {
    const { diagnostics } = parse(HEADER + `component web {\n  src """\n  x\n  """\n}`);
    expect(diagnostics.some((d) => d.code === "E001" && /after 'src'/.test(d.message))).toBe(true);
  });

  it("no src leaves the field absent", () => {
    expect(parse(HEADER + "component web").doc.components[0]!.src).toBeUndefined();
  });
});

describe("several src lines", () => {
  const MANY = `component billing {
  desc "Charges and invoices."
  src "apps/api/src/billing"
  src "packages/stripe-client/src/index.ts"
  src "https://dashboard.stripe.com/webhooks"
}`;

  it("keeps every src, in the order written, with no diagnostics", () => {
    const { doc, diagnostics } = parse(HEADER + MANY);
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.src).toEqual([
      "apps/api/src/billing",
      "packages/stripe-client/src/index.ts",
      "https://dashboard.stripe.com/webhooks",
    ]);
  });

  it("gathers src lines wherever they sit in the body", () => {
    const { doc } = parse(
      HEADER + `component web {\n  src "apps/web"\n  desc "Front end"\n  src "packages/ui"\n}`,
    );
    expect(doc.components[0]!.src).toEqual(["apps/web", "packages/ui"]);
  });

  it("formats one line per source, together after desc, and round-trips", () => {
    const once = format(parse(HEADER + MANY).doc);
    expect(once).toContain(
      '  desc "Charges and invoices."\n' +
        '  src "apps/api/src/billing"\n' +
        '  src "packages/stripe-client/src/index.ts"\n' +
        '  src "https://dashboard.stripe.com/webhooks"\n',
    );
    expect(format(parse(once).doc)).toBe(once);
  });

  it("still flags a second shape as E004", () => {
    const { diagnostics } = parse(
      HEADER + `component db {\n  src "a"\n  src "b"\n  shape cylinder\n  shape cloud\n}`,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["E004"]);
  });

  it("compileForAgent keeps every src line and documents them", () => {
    const out = compileForAgent(parse(HEADER + MANY).doc);
    expect(out).toContain('  src "apps/api/src/billing"\n  src "packages/stripe-client/src/index.ts"');
    expect(out).toContain("`src` points at where the component lives in code");
    expect(out).toContain("one `src` line per place");
  });
});

describe("setComponentMeta src", () => {
  it("sets a list, and clears it with null or an empty list", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { src: ["apps/web", "packages/ui"] });
    expect(d1.components[0]!.src).toEqual(["apps/web", "packages/ui"]);
    expect(d0.components[0]!.src).toBeUndefined();
    expect(format(d1)).toContain('  src "apps/web"\n  src "packages/ui"\n');
    const d2 = setComponentMeta(d1, ["web"], { src: null });
    expect(d2.components[0]!.src).toBeUndefined();
    expect(format(d2)).toBe(format(d0));
    expect(setComponentMeta(d1, ["web"], { src: [] }).components[0]!.src).toBeUndefined();
  });

  it("trims entries and drops blanks and repeats", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { src: [" apps/web ", "", "apps/web", "  ", "packages/ui"] });
    expect(d1.components[0]!.src).toEqual(["apps/web", "packages/ui"]);
    expect(setComponentMeta(d0, ["web"], { src: ["", " "] }).components[0]!.src).toBeUndefined();
  });

  it("leaves src alone when the meta doesn't mention it", () => {
    const d0 = parse(HEADER + `component web {\n  src "a"\n  src "b"\n}`).doc;
    expect(setComponentMeta(d0, ["web"], { desc: "x" }).components[0]!.src).toEqual(["a", "b"]);
  });
});

describe("src in diff and merge", () => {
  const withSrc = (...src: string[]) =>
    parse(HEADER + `component web {\n${src.map((s) => `  src "${s}"`).join("\n")}\n}`).doc;
  const changed = (a: ReturnType<typeof withSrc>, b: ReturnType<typeof withSrc>) =>
    diffDocs(a, b).components.find((c) => c.path === "web")?.fields;

  it("diff reports src when a source is added, removed or reordered", () => {
    expect(changed(withSrc("a"), withSrc("a", "b"))).toEqual(["src"]);
    expect(changed(withSrc("a", "b"), withSrc("a"))).toEqual(["src"]);
    expect(changed(withSrc("a", "b"), withSrc("b", "a"))).toEqual(["src"]);
    expect(changed(withSrc("a", "b"), withSrc("a", "b"))).toBeUndefined();
  });

  it("merge takes the side that changed the list", () => {
    const r = mergeDocs(withSrc("a"), withSrc("a", "b"), withSrc("a"));
    expect(r.conflicts).toEqual([]);
    expect(r.doc.components[0]!.src).toEqual(["a", "b"]);
    const r2 = mergeDocs(withSrc("a"), withSrc("a"), withSrc("a", "c"));
    expect(r2.doc.components[0]!.src).toEqual(["a", "c"]);
  });

  it("merge accepts the same list from both sides", () => {
    const r = mergeDocs(withSrc("a"), withSrc("a", "b"), withSrc("a", "b"));
    expect(r.conflicts).toEqual([]);
    expect(r.doc.components[0]!.src).toEqual(["a", "b"]);
  });

  it("merge flags different lists from both sides as a conflict (ours wins)", () => {
    const r = mergeDocs(withSrc("a"), withSrc("a", "b"), withSrc("a", "c"));
    expect(r.conflicts.map((c) => c.reason)).toEqual(["changed src on both sides"]);
    expect(r.doc.components[0]!.src).toEqual(["a", "b"]);
  });

  it("merge drops every source when one side removed them all", () => {
    const r = mergeDocs(withSrc("a", "b"), parse(HEADER + "component web").doc, withSrc("a", "b"));
    expect(r.conflicts).toEqual([]);
    expect(r.doc.components[0]!.src).toBeUndefined();
  });
});
