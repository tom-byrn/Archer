import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("parse: spec worked example", () => {
  const { doc, diagnostics } = parse(fixture("acme.arch"));

  it("has no diagnostics", () => {
    expect(diagnostics).toEqual([]);
  });

  it("parses the header", () => {
    expect(doc.title).toBe("Acme SaaS");
    expect(doc.version).toBe("0.1");
  });

  it("parses the component tree", () => {
    expect(doc.components.map((c) => c.id)).toEqual([
      "web",
      "backend",
      "auth",
      "cognito",
      "stripe",
    ]);
    const backend = doc.components[1]!;
    expect(backend.name).toBe("Backend");
    expect(backend.type).toBe("vercel");
    expect(backend.children.map((c) => c.id)).toEqual(["api", "db"]);
    expect(backend.children[0]!.type).toBe("vercel.functions");
    expect(doc.components[3]!.type).toBe("aws.cognito");
    expect(doc.components[3]!.children).toEqual([]);
  });

  it("parses descriptions", () => {
    expect(doc.components[0]!.desc).toContain("App shell");
  });

  it("parses payloads dedented", () => {
    const api = doc.components[1]!.children[0]!;
    expect(api.payloads).toHaveLength(1);
    const endpoints = api.payloads[0]!;
    expect(endpoints.name).toBe("endpoints");
    expect(endpoints.format).toBe("table");
    expect(endpoints.content.startsWith("| method |")).toBe(true);
    expect(endpoints.content.endsWith("|")).toBe(true);

    const db = doc.components[1]!.children[1]!;
    const schema = db.payloads[0]!;
    expect(schema.format).toBe("json");
    expect(() => JSON.parse(schema.content)).not.toThrow();
  });

  it("parses connections", () => {
    expect(doc.connections).toHaveLength(5);
    const first = doc.connections[0]!;
    expect(first.source).toEqual(["web"]);
    expect(first.target).toEqual(["auth"]);
    expect(first.arrow).toBe("->");
    expect(first.type).toBe("http");
    expect(first.label).toBe("login");
    const second = doc.connections[1]!;
    expect(second.target).toEqual(["backend", "api"]);
    expect(second.label).toBeUndefined();
  });

  it("parses layout entries", () => {
    expect(doc.layout).toHaveLength(7);
    const backend = doc.layout.find((l) => l.path.join(".") === "backend")!;
    expect(backend.at).toEqual([6, 0]);
    expect(backend.size).toEqual([12, 10]);
    expect(backend.display).toBe("plane");
    const db = doc.layout.find((l) => l.path.join(".") === "backend.db")!;
    expect(db.display).toBe("icon");
  });
});

describe("parse: edge cases", () => {
  it("handles a minimal document", () => {
    const { doc, diagnostics } = parse('arch "X" v0.1');
    expect(diagnostics).toEqual([]);
    expect(doc.title).toBe("X");
    expect(doc.components).toEqual([]);
  });

  it("reports a missing header but still parses statements", () => {
    const { doc, diagnostics } = parse("component a\ncomponent b");
    expect(diagnostics.some((d) => d.code === "E001")).toBe(true);
    expect(doc.components.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("parses arrows, bare connections, and undirected edges", () => {
    const { doc, diagnostics } = parse(
      'arch "X" v0.1\ncomponent a\ncomponent b\na <-> b\na -- b\na -> b',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.connections.map((c) => c.arrow)).toEqual(["<->", "--", "->"]);
  });

  it("parses negative layout coordinates", () => {
    const { doc, diagnostics } = parse(
      'arch "X" v0.1\ncomponent a\nlayout { a: { at: [-2, -14] } }',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.layout[0]!.at).toEqual([-2, -14]);
  });

  it("ignores comments everywhere", () => {
    const { doc, diagnostics } = parse(
      '# top\narch "X" v0.1 # trailing\ncomponent a { # inner\n  desc "hi" }\n',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.desc).toBe("hi");
  });

  it("dedents triple-string descriptions", () => {
    const src = `arch "X" v0.1
component a {
  desc """
    line one
      indented
  """
}`;
    const { doc } = parse(src);
    expect(doc.components[0]!.desc).toBe("line one\n  indented");
  });

  it("reports unknown payload formats", () => {
    const src = 'arch "X" v0.1\ncomponent a {\n  stuff toml ```\nx=1\n```\n}';
    const { diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.message.includes("Unknown payload format"))).toBe(
      true,
    );
  });

  it("reports unterminated fences", () => {
    const src = 'arch "X" v0.1\ncomponent a {\n  s json ```\n{}';
    const { diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.message.includes("Unterminated payload fence"))).toBe(
      true,
    );
  });

  it("recovers after a bad statement", () => {
    const src = 'arch "X" v0.1\n{{{\ncomponent ok';
    const { doc, diagnostics } = parse(src);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(doc.components.map((c) => c.id)).toEqual(["ok"]);
  });

  it("rejects unsupported major versions", () => {
    const { diagnostics } = parse('arch "X" v2.0');
    expect(diagnostics.some((d) => d.message.includes("Unsupported spec major"))).toBe(
      true,
    );
  });

  it("keeps a fence containing shorter backtick runs intact", () => {
    const src =
      'arch "X" v0.1\ncomponent a {\n  notes markdown ````\nuse ``` for code\n````\n}';
    const { doc, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.payloads[0]!.content).toBe("use ``` for code");
  });
});
