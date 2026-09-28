import { describe, expect, it } from "vitest";
import { GLYPHS } from "@archer/catalog";
import { iconMarkup } from "@archer/catalog/icons";
import { parse } from "@archer/lang";
import { ALL_ICONS, iconLabel, iconRank } from "../lib/icons";
import { renderArchSvg } from "../lib/svg";
import { toFlow } from "../lib/toFlow";

// A component's own icon (`icon <name>`) replaces its type's glyph, and an
// untyped component without one shows no icon, on the canvas and in images.

const SOURCE = `arch "Shop" v0.2

component plain "Plain"
component cart "Cart" {
  icon shopping_cart
}
component db "Orders" @postgres {
  icon receipt
}
component odd "Odd" {
  icon no_such_icon
}
component round "Round" {
  shape circle
}
`;

const pathOf = (markup: string) => /d="([^"]+)"/.exec(markup)![1]!;

describe("component icons", () => {
  it("carries a known icon into the canvas nodes, and leaves an unknown one out", () => {
    const { nodes } = toFlow(parse(SOURCE).doc);
    const icon = (id: string) => nodes.find((n) => n.id === id)!.data.icon;
    expect(icon("cart")).toBe("shopping_cart");
    expect(icon("db")).toBe("receipt");
    expect(icon("odd")).toBeUndefined();
    expect(icon("plain")).toBeUndefined();
  });

  it("draws the picked icon in images, over the type's own", () => {
    const svg = renderArchSvg(SOURCE);
    expect(svg).toContain(pathOf(iconMarkup("shopping_cart")!));
    expect(svg).toContain(pathOf(iconMarkup("receipt")!));
    // Postgres keeps no glyph of its own once it picks an icon.
    expect(svg).not.toContain(pathOf(GLYPHS.database!));
  });

  it("draws no icon on an untyped component that picks none", () => {
    const svg = renderArchSvg('arch "X" v0.2\n\ncomponent plain "Plain"\ncomponent round "Round" { shape circle }\n');
    expect(svg).not.toContain(pathOf(GLYPHS.box!));
    expect(svg).not.toContain('width="32" height="32"');
    const typed = renderArchSvg('arch "X" v0.2\n\ncomponent svc "Svc" @service\n');
    expect(typed).toContain(pathOf(GLYPHS.box!));
  });
});

describe("icon search", () => {
  const search = (q: string) =>
    ALL_ICONS.map((name) => ({ name, r: iconRank(name, q) }))
      .filter(({ r }) => r >= 0)
      .sort((a, b) => a.r - b.r)
      .map(({ name }) => name);

  it("puts names before Phosphor's tags", () => {
    expect(search("cart")[0]).toBe("shopping_cart");
    // Map is tagged "cartography": found, but after the carts.
    expect(search("cart").indexOf("map")).toBeGreaterThan(search("cart").indexOf("shopping_cart"));
    expect(search("shopping c")[0]).toBe("shopping_cart");
    expect(search("user circle")[0]).toBe("user_circle");
    // A tag finds an icon whose name doesn't say it.
    expect(search("hdd")).toContain("server");
    expect(search("zzzz")).toEqual([]);
  });

  it("labels icons by name", () => {
    expect(iconLabel("shopping_cart")).toBe("Shopping cart");
  });
});
