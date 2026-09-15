import { describe, expect, it } from "vitest";
import { compileForAgent, format, parse, setComponentMeta } from "../src/index";

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
    expect(api.src).toBe("apps/api/src");
    expect(api.desc).toBe("Route handlers.");
    expect(api.payloads).toHaveLength(1);
    expect(api.children[0]!.src).toBe("https://github.com/acme/inner");
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

  it("flags a second src as E004 (last one wins)", () => {
    const { doc, diagnostics } = parse(
      HEADER + `component web {\n  src "a"\n  src "b"\n}`,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["E004"]);
    expect(doc.components[0]!.src).toBe("b");
  });

  it("setComponentMeta sets and clears src", () => {
    const d0 = parse(HEADER + "component web").doc;
    const d1 = setComponentMeta(d0, ["web"], { src: "apps/web" });
    expect(d1.components[0]!.src).toBe("apps/web");
    expect(d0.components[0]!.src).toBeUndefined();
    const d2 = setComponentMeta(d1, ["web"], { src: null });
    expect(d2.components[0]!.src).toBeUndefined();
    expect(format(d2)).toBe(format(d0));
  });

  it("compileForAgent keeps the src line and documents it", () => {
    const doc = parse(HEADER + `component web {\n  src "apps/web"\n}`).doc;
    const out = compileForAgent(doc);
    expect(out).toContain('  src "apps/web"');
    expect(out).toContain("`src` points at where the component lives in code");
  });
});
