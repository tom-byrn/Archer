import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { canvasDoc, fitViewport, hitTest, renderCanvas } from "@/lib/diagram";

const SRC = `arch "Shop" v0.2

component web "Web" @vercel.nextjs

plane backend "Backend" {
  component api "API" {
    component checkout "Checkout"
    component orders "Orders"
  }
}

component db "DB" @postgres

api.checkout -> api.orders : "places"
api.orders -> db @sql
web -> api @http

layout {
  web: { at: [0, 0], size: [4, 3] }
  backend: { at: [6, 0], size: [8, 6] }
  api: { at: [1, 2], size: [4, 3] }
  db: { at: [16, 0], size: [4, 3] }
  api.checkout: { at: [0, 0], size: [4, 3] }
  api.orders: { at: [6, 0], size: [4, 3] }
}
`;

describe("canvasDoc", () => {
  const doc = parse(SRC).doc;

  it("is the document itself at the top level", () => {
    expect(canvasDoc(doc, [])).toBe(doc);
  });

  it("makes a component's inside a document of its own, paths relative to it", () => {
    const inner = canvasDoc(doc, ["api"])!;
    expect(inner.title).toBe("API");
    expect(inner.components.map((c) => c.id)).toEqual(["checkout", "orders"]);
    // Only connections between its own parts come along.
    expect(inner.connections.map((c) => [c.source, c.target])).toEqual([[["checkout"], ["orders"]]]);
    expect(inner.layout.map((e) => e.path.join("."))).toEqual(["checkout", "orders"]);
  });

  it("is null for a path that names nothing", () => {
    expect(canvasDoc(doc, ["nope"])).toBeNull();
  });
});

describe("renderCanvas", () => {
  it("draws a component's inside with boxes for its parts", () => {
    const r = renderCanvas(SRC, ["api"]);
    expect(r.boxes.map((b) => b.path).sort()).toEqual(["checkout", "orders"]);
    expect(r.svg).toContain("Checkout");
    expect(r.svg).not.toContain("Web");
  });
});

describe("hitTest", () => {
  const { boxes } = renderCanvas(SRC, []);
  const center = (path: string) => {
    const b = boxes.find((x) => x.path === path)!;
    return [b.x + b.w / 2, b.y + b.h / 2] as const;
  };

  it("finds the component under a point before the plane it sits on", () => {
    expect(hitTest(boxes, ...center("api"))?.path).toBe("api");
    expect(hitTest(boxes, ...center("db"))?.path).toBe("db");
  });

  it("falls back to the plane, and to nothing on empty canvas", () => {
    const plane = boxes.find((b) => b.path === "backend")!;
    expect(hitTest(boxes, plane.x + 4, plane.y + plane.h - 4)?.path).toBe("backend");
    expect(hitTest(boxes, -10, -10)).toBeUndefined();
  });
});

describe("fitViewport", () => {
  it("scales a large diagram down to fit, centered", () => {
    const v = fitViewport(1000, 500, 400, 800, 0);
    expect(v.scale).toBeCloseTo(0.4);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo((800 - 200) / 2);
  });

  it("never enlarges past 1:1", () => {
    expect(fitViewport(100, 100, 1000, 1000).scale).toBe(1);
  });
});
