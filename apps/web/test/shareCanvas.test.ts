import { describe, expect, it } from "vitest";
import { autoLayout, parse } from "@archer/lang";
import { canvasTrail, renderArchSvg } from "../lib/svg";
import { CONTEXT_PREFIX, parseFocus, toFlow } from "../lib/toFlow";

// A share link's `?component=` (and render_project's `component`) draws the
// inside of a nested component: the canvas the editor shows when it's opened.
const SOURCE = `arch "Shop" v0.2

component web "Storefront"

component backend "Backend" {
  component api "API"
  component db "Orders DB"
  component jobs "Jobs" {
    component mailer "Mailer"
  }
}

component stripe "Stripe"

backend.api -> backend.db : "orders"
backend.api -> backend.jobs

web -> backend.api : "checkout"
backend.api -> stripe : "charges"
`;

const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);

describe("rendering a nested canvas", () => {
  it("draws the top level by default", () => {
    const svg = renderArchSvg(SOURCE);
    expect(svg).toContain("<title>Shop</title>");
    expect(texts(svg)).toEqual(expect.arrayContaining(["Storefront", "Backend", "Stripe"]));
    expect(texts(svg)).not.toContain("API");
  });

  it("draws a component's inside, titled with where it is", () => {
    const svg = renderArchSvg(SOURCE, { focus: ["backend"] });
    expect(svg).toContain("<title>Shop › Backend</title>");
    const t = texts(svg);
    expect(t).toEqual(expect.arrayContaining(["API", "Orders DB", "Jobs", "orders"]));
    expect(t).not.toContain("Backend");
    // Jobs holds a component: one box with a count, not its parts.
    expect(t).not.toContain("Mailer");
  });

  it("draws the outside components it connects to as context, where the canvas does", () => {
    const svg = renderArchSvg(SOURCE, { focus: ["backend"] });
    const t = texts(svg);
    expect(t).toEqual(expect.arrayContaining(["Storefront", "web", "Stripe", "stripe", "checkout", "charges"]));
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(2);
    // Same places as toFlow's context nodes.
    const flow = toFlow(autoLayout(parse(SOURCE).doc), { focus: ["backend"] });
    const ctx = flow.nodes.filter((n) => n.id.startsWith(CONTEXT_PREFIX));
    expect(ctx.map((n) => n.id).sort()).toEqual(["ctx:stripe", "ctx:web"]);
  });

  it("goes as deep as the nesting does", () => {
    const svg = renderArchSvg(SOURCE, { focus: ["backend", "jobs"] });
    expect(svg).toContain("<title>Shop › Backend › Jobs</title>");
    expect(texts(svg)).toContain("Shop › Backend › Jobs");
    expect(texts(svg)).toContain("Mailer");
  });

  it("says when the path names no component", () => {
    expect(canvasTrail(SOURCE, ["backend", "cache"])).toBeUndefined();
    expect(canvasTrail(SOURCE, ["backend", "jobs"])).toEqual(["Backend", "Jobs"]);
    expect(canvasTrail(SOURCE, [])).toEqual([]);
    expect(renderArchSvg(SOURCE, { focus: ["nope"] })).toContain("No component nope");
  });

  it("reads a path the way share links write it", () => {
    expect(parseFocus("backend.jobs")).toEqual(["backend", "jobs"]);
    expect(parseFocus("")).toEqual([]);
    expect(parseFocus(null)).toEqual([]);
  });
});
