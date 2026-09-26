import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOGOS } from "@archer/catalog/logos";
import { renderArchSvg } from "../lib/svg";

const SOURCE = `arch "Logos" v0.2

component fn "Handler" @aws.lambda
component billing "Billing" @stripe
component model "Model" @gemini
component thing "Thing" @custom.thing

fn -> billing @http
`;

describe("logos", () => {
  it("draws catalog types with their logos when given them", () => {
    const svg = renderArchSvg(SOURCE, { logos: LOGOS });
    // AWS's own Lambda icon replaces the tinted tile; Stripe's mark keeps it, in Stripe's color.
    expect(svg).toContain(LOGOS["aws-lambda"]!.body);
    expect(svg).toContain(LOGOS.stripe!.body);
    expect(svg).toContain(`style="color:${LOGOS.stripe!.color}"`);
    // Gemini has no logo (Google needs permission), and custom types never do.
    expect(svg.match(/<svg x=/g)).toHaveLength(4);
    expect(svg.match(/viewBox="0 0 256 256"/g)).toHaveLength(2);
  });

  it("draws a shaped component's logo too, as the canvas does", () => {
    const shaped = `arch "Shapes" v0.2

component store "Store" @redis {
  shape cylinder
}
`;
    const svg = renderArchSvg(shaped, { logos: LOGOS });
    expect(svg).toContain(LOGOS.redis!.body);
    expect(svg).not.toContain('viewBox="0 0 256 256"');
  });

  it("draws glyphs only, without them", () => {
    const svg = renderArchSvg(SOURCE);
    expect(svg.match(/viewBox="0 0 256 256"/g)).toHaveLength(4);
    expect(svg).not.toContain(LOGOS.stripe!.body);
    expect(svg).not.toContain("data:image/png");
  });

  // Logos identify products in people's diagrams; they stay off the marketing
  // pages (landing, its sandbox, the OG image), which draw glyphs.
  it("stays out of marketing surfaces", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const root = join(__dirname, "..");
    const marketing = [...files(join(root, "components/landing")), ...files(join(root, "app/welcome"))];
    expect(marketing.length).toBeGreaterThan(0);
    const offenders = marketing.filter((f) => /@archer\/catalog\/logos|components\/logos|["']\.\.?\/logos["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
