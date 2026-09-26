import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("parse: spec worked example", () => {
  const { doc, diagnostics } = parse(fixture("acme.arch"));

  it("has no diagnostics", () => {
    expect(diagnostics).toEqual([]);
  });

  it("parses the header", () => {
    expect(doc.title).toBe("Acme SaaS");
    expect(doc.version).toBe("0.2");
  });

  it("parses the component tree, planes aside", () => {
    // A plane adds no level: its components are top-level components.
    expect(doc.components.map((c) => c.id)).toEqual(["web", "api", "db", "auth", "cognito", "stripe"]);
    const api = doc.components[1]!;
    expect(api.type).toBe("vercel.functions");
    expect(api.plane).toBe("backend");
    expect(api.children.map((c) => c.id)).toEqual(["checkout", "projects"]);
    expect(api.children[0]!.plane).toBeUndefined();
    expect(doc.components[0]!.plane).toBeUndefined();
    expect(doc.components[4]!.type).toBe("aws.cognito");
    expect(doc.components[4]!.children).toEqual([]);
  });

  it("parses planes", () => {
    expect(doc.planes).toHaveLength(1);
    const backend = doc.planes[0]!;
    expect(backend).toMatchObject({ kind: "plane", id: "backend", name: "Backend", type: "vercel" });
    expect(backend.desc).toContain("server-side");
    expect(backend.plane).toBeUndefined();
    expect(doc.components.filter((c) => c.plane === "backend").map((c) => c.id)).toEqual(["api", "db"]);
  });

  it("parses descriptions", () => {
    expect(doc.components[0]!.desc).toContain("App shell");
  });

  it("parses payloads dedented", () => {
    const api = doc.components[1]!;
    expect(api.payloads).toHaveLength(1);
    const endpoints = api.payloads[0]!;
    expect(endpoints.name).toBe("endpoints");
    expect(endpoints.format).toBe("table");
    expect(endpoints.content.startsWith("| method |")).toBe(true);
    expect(endpoints.content.endsWith("|")).toBe(true);

    const db = doc.components[2]!;
    const schema = db.payloads[0]!;
    expect(schema.format).toBe("json");
    expect(() => JSON.parse(schema.content)).not.toThrow();
  });

  it("parses connections", () => {
    expect(doc.connections).toHaveLength(6);
    const first = doc.connections[0]!;
    expect(first.source).toEqual(["web"]);
    expect(first.target).toEqual(["auth"]);
    expect(first.arrow).toBe("->");
    expect(first.type).toBe("http");
    expect(first.label).toBe("login");
    const second = doc.connections[1]!;
    expect(second.target).toEqual(["api"]);
    expect(second.label).toBeUndefined();
    expect(doc.connections[5]!.source).toEqual(["api", "checkout"]);
  });

  it("parses layout entries, planes' included", () => {
    expect(doc.layout).toHaveLength(7);
    const backend = doc.layout.find((l) => l.path.join(".") === "backend")!;
    expect(backend.at).toEqual([6, 0]);
    expect(backend.size).toEqual([12, 6]);
    expect(doc.layout.find((l) => l.path.join(".") === "api")!.at).toEqual([1, 2]);
  });
});

describe("parse: planes", () => {
  const src = (body: string) => parse(`arch "X" v0.2\n${body}`);

  it("nests planes and marks what sits on each", () => {
    const { doc, diagnostics } = src(`plane cloud "AWS" @aws {
  plane vpc "VPC" @aws.vpc {
    desc "10.0.0.0/16"
    component api
    plane private "Private subnet" {
      component db
    }
  }
  component cdn
}
component users`);
    expect(diagnostics).toEqual([]);
    expect(doc.planes.map((p) => [p.id, p.plane])).toEqual([
      ["cloud", undefined],
      ["vpc", "cloud"],
      ["private", "vpc"],
    ]);
    expect(doc.planes[1]!.desc).toBe("10.0.0.0/16");
    expect(doc.components.map((c) => [c.id, c.plane])).toEqual([
      ["api", "vpc"],
      ["db", "private"],
      ["cdn", "cloud"],
      ["users", undefined],
    ]);
  });

  it("puts planes inside a component on its own canvas", () => {
    const { doc, diagnostics } = src(`component api {
  plane handlers "Handlers" {
    component checkout
  }
  component worker
}`);
    expect(diagnostics).toEqual([]);
    expect(doc.planes).toEqual([]);
    const api = doc.components[0]!;
    expect(api.planes.map((p) => p.id)).toEqual(["handlers"]);
    expect(api.children.map((c) => [c.id, c.plane])).toEqual([
      ["checkout", "handlers"],
      ["worker", undefined],
    ]);
  });

  it("parses a plane with no body", () => {
    const { doc, diagnostics } = src(`plane empty "Nothing yet" @network`);
    expect(diagnostics).toEqual([]);
    expect(doc.planes[0]).toMatchObject({ id: "empty", name: "Nothing yet", type: "network" });
  });

  it("keeps plane usable as a component id and a payload name", () => {
    const { doc, diagnostics } = src(`component plane
component api {
  plane json \`\`\`
  {"a": 1}
  \`\`\`
}
plane -> api
plane.x -> api`);
    expect(diagnostics).toEqual([]);
    expect(doc.planes).toEqual([]);
    expect(doc.components.map((c) => c.id)).toEqual(["plane", "api"]);
    expect(doc.components[1]!.payloads.map((p) => p.name)).toEqual(["plane"]);
    expect(doc.connections.map((c) => c.source.join("."))).toEqual(["plane", "plane.x"]);
  });

  it("rejects what a plane can't hold and keeps going", () => {
    const { doc, diagnostics } = src(`plane p {
  src "apps/web"
  component a
  notes markdown \`\`\`
  hi
  \`\`\`
  component b
}
component c`);
    expect(diagnostics.map((d) => d.code)).toEqual(["E001", "E001"]);
    expect(diagnostics[0]!.message).toMatch(/inside a plane body/);
    expect(doc.components.map((c) => [c.id, c.plane])).toEqual([
      ["a", "p"],
      ["b", "p"],
      ["c", undefined],
    ]);
  });
});

describe("parse: v0.1 documents", () => {
  const OLD = `arch "X" v0.1
component p { component x }
component q { component y }
component r
layout {
  p: { at: [0, 0], size: [12, 8], display: plane }
  p.x: { at: [1, 2], size: [4, 3] }
  q: { at: [14, 0], size: [4, 3], display: icon }
  r: { at: [20, 0], size: [5, 3] }
}`;

  it("reads them as v0.2", () => {
    const { doc, diagnostics } = parse(OLD);
    expect(diagnostics).toEqual([]);
    expect(doc.version).toBe("0.2");
  });

  it("gives a component v0.1 drew as a plane a box's size, and keeps the rest", () => {
    const { doc } = parse(OLD);
    const entry = (p: string) => doc.layout.find((e) => e.path.join(".") === p)!;
    expect(entry("p").at).toEqual([0, 0]);
    expect(entry("p").size).toBeUndefined(); // it was a 12×8 plane
    expect(entry("q").size).toEqual([4, 3]); // it was already an icon
    expect(entry("r").size).toEqual([5, 3]);
    expect(entry("p.x").at).toEqual([1, 2]);
    expect(Object.keys(entry("p"))).not.toContain("display");
  });

  it("counts a container without a display as a plane, as v0.1 drew it", () => {
    const { doc } = parse(OLD.replace(", display: plane", ""));
    expect(doc.layout.find((e) => e.path.join(".") === "p")!.size).toBeUndefined();
  });

  it("ignores a display in a v0.2 layout", () => {
    const { doc, diagnostics } = parse(OLD.replace("v0.1", "v0.2"));
    expect(diagnostics).toEqual([]);
    expect(doc.layout.find((e) => e.path.join(".") === "p")!.size).toEqual([12, 8]);
  });
});

describe("parse: edge cases", () => {
  it("handles a minimal document", () => {
    const { doc, diagnostics } = parse('arch "X" v0.2');
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
      'arch "X" v0.2\ncomponent a\ncomponent b\na <-> b\na -- b\na -> b',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.connections.map((c) => c.arrow)).toEqual(["<->", "--", "->"]);
  });

  it("parses connection bodies with payloads", () => {
    const src =
      'arch "X" v0.2\ncomponent api\ncomponent q\n' +
      'api -> q @queue : "orders" {\n  message json ```\n  { "id": "uuid" }\n  ```\n  notes markdown ```\n  at-least-once\n  ```\n}\n' +
      "q -> api\n";
    const { doc, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(doc.connections).toHaveLength(2);
    const c = doc.connections[0]!;
    expect(c.type).toBe("queue");
    expect(c.label).toBe("orders");
    expect(c.payloads.map((p) => [p.name, p.format, p.content])).toEqual([
      ["message", "json", '{ "id": "uuid" }'],
      ["notes", "markdown", "at-least-once"],
    ]);
    expect(src.slice(c.span.start.offset, c.span.end.offset).endsWith("}")).toBe(true);
    expect(doc.connections[1]!.payloads).toEqual([]);
  });

  it("rejects non-payload items in a connection body and keeps going", () => {
    const { doc, diagnostics } = parse(
      'arch "X" v0.2\ncomponent a\ncomponent b\na -> b {\n  desc "no"\n}\ncomponent c\n',
    );
    expect(diagnostics.some((d) => d.code === "E001")).toBe(true);
    expect(doc.components.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(doc.connections).toHaveLength(1);
  });

  it("reports an unclosed connection body without swallowing the next component", () => {
    const { doc, diagnostics } = parse(
      'arch "X" v0.2\ncomponent a\ncomponent b\na -> b {\n  m json ```\n{}\n```\ncomponent c\n',
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(diagnostics[0]!.message).toContain("closing the connection body");
    expect(doc.components.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(doc.connections[0]!.payloads).toHaveLength(1);
  });

  it("parses negative layout coordinates", () => {
    const { doc, diagnostics } = parse(
      'arch "X" v0.2\ncomponent a\nlayout { a: { at: [-2, -14] } }',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.layout[0]!.at).toEqual([-2, -14]);
  });

  it("ignores comments everywhere", () => {
    const { doc, diagnostics } = parse(
      '# top\narch "X" v0.2 # trailing\ncomponent a { # inner\n  desc "hi" }\n',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.desc).toBe("hi");
  });

  it("dedents triple-string descriptions", () => {
    const src = `arch "X" v0.2
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
    const src = 'arch "X" v0.2\ncomponent a {\n  stuff toml ```\nx=1\n```\n}';
    const { diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.message.includes("Unknown payload format"))).toBe(
      true,
    );
  });

  it("reports unterminated fences", () => {
    const src = 'arch "X" v0.2\ncomponent a {\n  s json ```\n{}';
    const { diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.message.includes("Unterminated payload fence"))).toBe(
      true,
    );
  });

  it("recovers after a bad statement", () => {
    const src = 'arch "X" v0.2\n{{{\ncomponent ok';
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
      'arch "X" v0.2\ncomponent a {\n  notes markdown ````\nuse ``` for code\n````\n}';
    const { doc, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(doc.components[0]!.payloads[0]!.content).toBe("use ``` for code");
  });
});
