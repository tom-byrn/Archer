import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { allComponents, canvasRows, docStats, searchComponents, trail } from "@/lib/outline";
import { shareSlugFrom } from "@/lib/links";

const doc = parse(`arch "Shop" v0.2

component web "Web" @vercel.nextjs

plane backend "Backend" {
  component api "API" {
    desc "Takes orders"
    component checkout "Checkout"
  }
  component db "Postgres" @postgres
}

web -> api @http
`).doc;

describe("canvasRows", () => {
  it("lists a canvas plane by plane, in canonical order", () => {
    expect(canvasRows(doc).map((r) => [r.kind, r.path.join("."), r.depth])).toEqual([
      ["component", "web", 0],
      ["plane", "backend", 0],
      ["component", "api", 1],
      ["component", "db", 1],
    ]);
  });
});

describe("allComponents / searchComponents / trail", () => {
  it("walks every level", () => {
    expect(allComponents(doc).map((c) => c.path.join("."))).toEqual(["web", "api", "api.checkout", "db"]);
  });

  it("searches names, ids, types and descriptions", () => {
    expect(searchComponents(doc, "postgres").map((c) => c.path.join("."))).toEqual(["db"]);
    expect(searchComponents(doc, "orders").map((c) => c.path.join("."))).toEqual(["api"]);
    expect(searchComponents(doc, "CHECK").map((c) => c.path.join("."))).toEqual(["api.checkout"]);
    expect(searchComponents(doc, "  ")).toEqual([]);
  });

  it("follows a path through the components it's nested in", () => {
    expect(trail(doc, ["api", "checkout"]).map((e) => e.node.name)).toEqual(["API", "Checkout"]);
  });

  it("counts every level", () => {
    expect(docStats(doc)).toEqual({ components: 4, planes: 1, connections: 1 });
  });
});

describe("shareSlugFrom", () => {
  it("reads a slug from the links the web hands out", () => {
    const slug = "1uC4PhN_kTVQmFom";
    for (const input of [
      slug,
      `https://tryarcher.dev/share/${slug}`,
      `https://www.tryarcher.dev/share/${slug}/image.svg?theme=dark`,
      `https://tryarcher.dev/s/${slug}`,
      `archer://share/${slug}`,
      `  ${slug}\n`,
    ])
      expect(shareSlugFrom(input)).toBe(slug);
  });

  it("rejects anything else", () => {
    expect(shareSlugFrom("")).toBeNull();
    expect(shareSlugFrom("https://tryarcher.dev/documents/abc")).toBeNull();
    expect(shareSlugFrom("not a link")).toBeNull();
  });
});
