import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { resolveDropTarget } from "../lib/dropTarget";
import { CELL, toFlow } from "../lib/toFlow";

// Orders sits on the Backend plane and holds two parts of its own.
const DOC = parse(`arch "Shop" v0.2

component web "Web"

plane backend "Backend" {
  component orders "Orders" {
    component api "Orders API"
    component db "Orders DB"
  }
  component pay "Payments"
}

component stripe "Stripe"

orders.api -> orders.db @sql
orders.api -> stripe @http : "charge"
pay -> stripe @http
web -> orders.api @http

layout {
  backend: { at: [6, 0], size: [13, 6] }
  orders: { at: [1, 2], size: [4, 3] }
  orders.api: { at: [0, 0], size: [4, 3] }
  orders.db: { at: [7, 0], size: [4, 3] }
  pay: { at: [8, 2], size: [4, 3] }
  stripe: { at: [22, 2], size: [4, 3] }
  web: { at: [0, 2], size: [4, 3] }
}
`).doc;

const pairs = (edges: ReturnType<typeof toFlow>["edges"]) => edges.map((e) => `${e.source}->${e.target}`);

describe("toFlow", () => {
  it("draws planes first, with what sits on them placed relative to them", () => {
    const { nodes } = toFlow(DOC);
    expect(nodes.map((n) => n.id)).toEqual(["backend", "web", "orders", "pay", "stripe"]);
    expect(nodes[0]!.type).toBe("archPlane");
    const orders = nodes.find((n) => n.id === "orders")!;
    expect(orders.parentId).toBe("backend");
    expect(orders.position).toEqual({ x: 1 * CELL, y: 2 * CELL });
    expect(orders.data.childCount).toBe(2);
    expect(nodes.find((n) => n.id === "web")!.parentId).toBeUndefined();
  });

  it("draws a connection to a nested part to the component that holds it", () => {
    const { edges } = toFlow(DOC);
    expect(pairs(edges).sort()).toEqual(["orders->stripe", "pay->stripe", "web->orders"]);
  });

  it("opens a component on its parts, with outside partners as context nodes", () => {
    const { nodes, edges } = toFlow(DOC, { focus: ["orders"] });
    expect(nodes.map((n) => n.id)).toEqual(["orders.api", "orders.db", "ctx:web", "ctx:stripe"]);
    const side = (id: string) => nodes.find((n) => n.id === id)!.data.side;
    expect(side("ctx:web")).toBe("left");
    expect(side("ctx:stripe")).toBe("right");
    expect(pairs(edges).sort()).toEqual([
      "ctx:web->orders.api",
      "orders.api->ctx:stripe",
      "orders.api->orders.db",
    ]);
    expect(edges.find((e) => e.target === "ctx:stripe")!.data!.context).toBe(true);
    expect(toFlow(DOC, { focus: ["orders"], context: false }).nodes.map((n) => n.id)).toEqual([
      "orders.api",
      "orders.db",
    ]);
  });
});

describe("resolveDropTarget", () => {
  // Orders spans cells (7, 2) to (11, 5) on the canvas: Backend's at plus its own.
  const onOrders = { x: 9 * CELL, y: 3 * CELL };

  it("nests into the component under the point when nesting is allowed", () => {
    expect(resolveDropTarget(DOC, onOrders, { nest: true })).toEqual({
      scope: ["orders"],
      highlight: "orders",
    });
  });

  it("otherwise lands on the plane there, at a position relative to it", () => {
    const t = resolveDropTarget(DOC, onOrders, { topLeft: { x: 9 * CELL, y: 3 * CELL } });
    expect(t).toEqual({ scope: [], plane: "backend", at: [3, 3], highlight: "backend" });
  });

  it("lands loose on the canvas away from planes, and never on what's being dragged", () => {
    expect(resolveDropTarget(DOC, { x: 30 * CELL, y: 20 * CELL }, { topLeft: { x: 30 * CELL, y: 20 * CELL } })).toEqual({
      scope: [],
      at: [30, 20],
    });
    expect(resolveDropTarget(DOC, onOrders, { nest: true, exclude: [["orders"]] }).scope).toEqual([]);
  });
});
