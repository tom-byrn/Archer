import { describe, expect, it } from "vitest";
import { layoutMap, parse } from "@archer/lang";
import { analyzeSource, prepareSource } from "../src/analysis";

// Agents write without a layout block; the previous revision's positions carry over.
const BEFORE = `arch "Shop" v0.2

plane frontend "Frontend" {
  component web "Web"
}

plane backend "Backend" {
  component api "API"
  component db "DB"
}

api -> db @sql
web -> api @http

layout {
  api: { at: [1, 2], size: [4, 3] }
  backend: { at: [8, 0], size: [13, 6] }
  db: { at: [8, 2], size: [4, 3] }
  frontend: { at: [0, 0], size: [6, 6] }
  web: { at: [1, 2], size: [4, 3] }
}
`;

const laidOut = (source: string) => {
  const r = prepareSource(source, new Set(), BEFORE);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("\n"));
  return layoutMap(parse(r.text).doc);
};

describe("layout carried over to an agent's write", () => {
  it("keeps positions of what stays where it was", () => {
    const layout = laidOut(BEFORE.slice(0, BEFORE.indexOf("layout {")));
    expect(layout.get("api")?.at).toEqual([1, 2]);
    expect(layout.get("backend")?.at).toEqual([8, 0]);
    expect(layout.get("web")?.at).toEqual([1, 2]);
  });

  it("places a component moved to another plane afresh, since its old spot was relative to the old plane", () => {
    const moved = `arch "Shop" v0.2

plane frontend "Frontend" {
  component web "Web"
  component api "API"
}

plane backend "Backend" {
  component db "DB"
}

api -> db @sql
web -> api @http
`;
    const layout = laidOut(moved);
    const web = layout.get("web")!;
    const api = layout.get("api")!;
    expect(web.at).toEqual([1, 2]);
    // Kept, the old [1, 2] would put API right on top of Web.
    const overlap =
      api.at![0] < web.at![0] + web.size![0] &&
      web.at![0] < api.at![0] + api.size![0] &&
      api.at![1] < web.at![1] + web.size![1] &&
      web.at![1] < api.at![1] + api.size![1];
    expect(overlap).toBe(false);
    expect(api.size).toEqual([4, 3]);
  });
});

describe("icons", () => {
  it("knows every icon the picker offers, and warns on one it doesn't (W305)", () => {
    const a = analyzeSource(
      'arch "X" v0.2\n\ncomponent cart { icon shopping_cart }\ncomponent db { icon database }\ncomponent disk { icon hard_drives }\ncomponent odd { icon blob }\n',
      new Set(),
    );
    expect(a.errors).toEqual([]);
    expect(a.warnings.map((w) => [w.code, w.message.includes("'blob' on 'odd'")])).toEqual([["W305", true]]);
  });
});
