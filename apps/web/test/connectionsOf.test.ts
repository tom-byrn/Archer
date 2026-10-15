import { describe, expect, it } from "vitest";
import { parse, pathToString } from "@archer/lang";
import { connectionsOf } from "../lib/connectionsOf";

const DOC = parse(`arch "Shop" v0.2

component web "Web"
component orders "Orders" {
  component api "Orders API"
  component db "Orders DB"
}
component stripe "Stripe"
component cache "Cache"
component audit "Audit"

orders.api -> orders.db @sql
web -> orders.api @http
orders.api -> stripe @http : "charge"
orders <-> cache
audit -- orders
`).doc;

const summary = (path: string) =>
  connectionsOf(DOC, path.split(".")).map(
    (l) => `${l.direction} ${pathToString(l.near)} ${pathToString(l.far)}`,
  );

describe("connectionsOf", () => {
  it("lists what reaches a component and its parts, outgoing first", () => {
    expect(summary("orders")).toEqual([
      "out orders.api stripe",
      "both orders cache",
      "none orders audit",
      "in orders.api web",
    ]);
  });

  it("leaves out connections between a component's own parts", () => {
    expect(summary("orders").some((s) => s.includes("orders.db"))).toBe(false);
  });

  it("reads a nested part on its own", () => {
    expect(summary("orders.api")).toEqual([
      "out orders.api orders.db",
      "out orders.api stripe",
      "in orders.api web",
    ]);
  });

  it("is empty for an unconnected component", () => {
    expect(summary("orders.db").length).toBe(1);
    expect(connectionsOf(DOC, ["nowhere"])).toEqual([]);
  });

  it("keeps the connection's index into the document", () => {
    const [first] = connectionsOf(DOC, ["stripe"]);
    expect(first?.direction).toBe("in");
    expect(DOC.connections[first!.index]?.label).toBe("charge");
  });
});
