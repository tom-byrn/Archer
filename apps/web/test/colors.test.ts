import { describe, expect, it } from "vitest";
import { lookupType } from "@archer/catalog";
import { COLOR_HEX, parse } from "@archer/lang";
import { mix, renderArchSvg } from "../lib/svg";
import { toFlow } from "../lib/toFlow";

// A component's own color (`color <name>` or `color "#rrggbb"`) replaces its
// type's, and tints its card or shape, on the canvas and in images.

const SOURCE = `arch "Shop" v0.2

component plain "Plain"
component cart "Cart" {
  icon shopping_cart
  color green
}
component db "Orders" @postgres {
  color "#B45309"
}
component odd "Odd" {
  color mauve
}
component round "Round" {
  shape circle
  color violet
}
`;

// Light theme tokens (lib/svg.ts LIGHT).
const SURFACE = "#ffffff";
const LINE2 = "#d2ccc3";

describe("component colors", () => {
  it("carries a known color into the canvas nodes as #rrggbb, and leaves an unknown one out", () => {
    const { nodes } = toFlow(parse(SOURCE).doc, {
      resolveType: (tag) => {
        const t = lookupType(tag);
        return t ? { color: t.color, glyph: t.glyph } : undefined;
      },
    });
    const data = (id: string) => nodes.find((n) => n.id === id)!.data;
    expect(data("cart").color).toBe(COLOR_HEX.green);
    expect(data("db").color).toBe("#b45309");
    // Its type's color stays beside it, for when the color goes.
    expect(data("db").accent).toBe(lookupType("postgres")!.color);
    expect(data("round").color).toBe(COLOR_HEX.violet);
    expect(data("odd").color).toBeUndefined();
    expect(data("plain").color).toBeUndefined();
  });

  it("tints a colored card and shape in images, and leaves the rest plain", () => {
    const svg = renderArchSvg(SOURCE);
    for (const hex of [COLOR_HEX.green, "#b45309"]) {
      expect(svg).toContain(`fill="${mix(hex, SURFACE, 0.05)}" stroke="${mix(hex, LINE2, 0.45)}"`);
    }
    expect(svg).toContain(`stroke="${mix(COLOR_HEX.violet, LINE2, 0.45)}"`);
    // The icon is drawn in the color, not the type's.
    expect(svg).toContain(`style="color:${COLOR_HEX.green}"`);
    expect(svg).not.toContain(`style="color:${lookupType("postgres")!.color}"`);
    // Uncolored and unknown-colored cards keep the plain card.
    const plain = renderArchSvg('arch "X" v0.2\n\ncomponent a "A"\ncomponent b "B" { color mauve }\n');
    expect(plain.match(new RegExp(`fill="${SURFACE}" stroke="${LINE2}"`, "g"))?.length).toBe(2);
  });
});
