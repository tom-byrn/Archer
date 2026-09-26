import { describe, expect, it } from "vitest";
import { autoLayout, parse } from "@archer/lang";
import { CONTEXT, toFlow } from "../lib/toFlow";

const laid = (src: string) => autoLayout(parse(`arch "X" v0.1\n${src}`).doc);

const SRC = `
component users @user
component app "App" {
  component api "API"
  component jobs "Jobs"
}
component stores "Stores" {
  component db "DB" @postgres
  component cache "Cache" @redis
}
component billing "Billing" {
  component ledger
  component invoices
}
users -> app.api @http : "requests"
app.api -> app.jobs @queue
app.api -> stores.db @sql
app.jobs -> stores.db @sql
app.jobs -> billing.ledger
billing.ledger -> stores.cache
layout {
  billing: { display: icon }
  app: { display: icon }
}
`;

describe("toFlow", () => {
  it("draws a collapsed container's connections as one edge per pair of boxes", () => {
    const { edges } = toFlow(laid(SRC));
    const between = (s: string, t: string) => edges.filter((e) => e.source === s && e.target === t);
    // Two connections from inside the collapsed app into stores.db: one edge.
    const [toDb] = between("app", "stores.db");
    expect(between("app", "stores.db")).toHaveLength(1);
    expect(toDb!.data!.indices).toHaveLength(2);
    expect(toDb!.data!.keys).toHaveLength(2);
    expect(toDb!.data).toMatchObject({ protocol: "sql", summary: true, arrow: "->" });
    expect(toDb!.data!.members).toEqual(["API → DB · sql", "Jobs → DB · sql"]);
    expect(toDb!.reconnectable).toBe(false);
    // A lone connection keeps its label, and can still be re-pointed; one
    // inside a collapsed box isn't drawn.
    const [lone] = between("users", "app");
    expect(lone!.data).toMatchObject({ label: "requests", indices: [0] });
    expect(lone!.reconnectable).toBeUndefined();
    expect(edges.some((e) => e.source === e.target)).toBe(false);
  });

  it("places every labelled chip", () => {
    const { edges } = toFlow(laid(SRC));
    for (const e of edges) if (e.data!.protocol || e.data!.label) expect(e.data!.chip, e.id).toBeDefined();
  });

  it("draws what's outside a drilled-into container beside it", () => {
    const { nodes, edges } = toFlow(laid(SRC), { focus: ["app"] });
    const context = nodes.filter((n) => n.type === "archContext");
    // As the top level draws them: the open plane's child, the collapsed container itself.
    expect(context.map((n) => n.id).sort()).toEqual(
      [`${CONTEXT}billing`, `${CONTEXT}stores.db`, `${CONTEXT}users`].sort(),
    );
    const at = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    const inside = nodes.filter((n) => n.type !== "archContext").map((n) => n.position.x);
    // users only feeds in: left. The rest are fed: right.
    expect(at(`${CONTEXT}users`)).toBeLessThan(Math.min(...inside));
    expect(at(`${CONTEXT}stores.db`)).toBeGreaterThan(Math.max(...inside));
    expect(nodes.find((n) => n.id === `${CONTEXT}stores.db`)!.data).toMatchObject({
      path: "stores.db",
      context: { where: "Stores" },
    });
    // Connections among outside components (ledger -> cache) aren't drawn.
    expect(edges.every((e) => !(e.source.startsWith(CONTEXT) && e.target.startsWith(CONTEXT)))).toBe(true);
    expect(edges.find((e) => e.source === "app.jobs" && e.target === `${CONTEXT}billing`)).toBeDefined();
  });

  it("draws no context at the top level", () => {
    expect(toFlow(laid(SRC)).nodes.some((n) => n.type === "archContext")).toBe(false);
  });
});
