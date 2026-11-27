import { describe, expect, it } from "vitest";
import {
  format,
  outline,
  parse,
  PartError,
  readComponentPart,
  readViewPart,
  validate,
  writeComponentPart,
  writeViewPart,
} from "../src";

const SRC = `arch "Shop" v0.2

component web "Web" @service

plane backend "Backend" {
  component api "API" @service {
    component checkout "Checkout"
    component ledger "Ledger" @postgres
  }
}

component stripe "Stripe"

web -> api.checkout : "pay"
api.checkout -> api.ledger
api.checkout -> stripe
web -> stripe

sequence pay "Pay" {
  web -> api.checkout : "pay"
  api.checkout -> stripe
}

layout {
  web: { at: [0, 0] }
  api: { at: [10, 0] }
  api.checkout: { at: [0, 0] }
  api.ledger: { at: [8, 0] }
}
`;

const doc = () => parse(SRC).doc;
const errors = (d: ReturnType<typeof doc>) => validate(d).filter((x) => x.severity === "error");

describe("readComponentPart", () => {
  it("gives the declaration and every connection with an end in it, full paths", () => {
    const part = readComponentPart(doc(), ["api"]);
    expect(part.source).toBe(`component api "API" @service {
  component checkout "Checkout"
  component ledger "Ledger" @postgres
}

api.checkout -> api.ledger
api.checkout -> stripe
web -> api.checkout : "pay"
`);
    expect(part.boundary).toBe(2);
    expect(part.views).toEqual(["pay"]);
  });

  it("reads a nested component", () => {
    const part = readComponentPart(doc(), ["api", "ledger"]);
    expect(part.source).toBe(`component ledger "Ledger" @postgres\n\napi.checkout -> api.ledger\n`);
  });

  it("throws for a path that names nothing", () => {
    expect(() => readComponentPart(doc(), ["nope"])).toThrow(/No component/);
  });
});

describe("writeComponentPart", () => {
  it("round-trips unchanged", () => {
    const d = doc();
    const { doc: out } = writeComponentPart(d, ["api"], readComponentPart(d, ["api"]).source);
    expect(format(out)).toBe(format(d));
  });

  it("replaces the component and its connections, keeping its plane and the rest", () => {
    const { doc: out, path } = writeComponentPart(
      doc(),
      ["api"],
      `component api "API" @service {
  component checkout "Checkout"
  component ledger "Ledger" @postgres
  component refunds "Refunds"
}
api.refunds -> api.ledger
api.checkout -> stripe
web -> api.checkout : "pay"`,
    );
    expect(path).toEqual(["api"]);
    expect(errors(out)).toEqual([]);
    expect(out.components.find((c) => c.id === "api")!.plane).toBe("backend");
    const lines = format(out);
    expect(lines).toContain("component refunds");
    expect(lines).toContain("api.refunds -> api.ledger");
    expect(lines).not.toContain("api.checkout -> api.ledger");
    expect(lines).toContain("web -> stripe");
    // Positions of what's still there survive; nothing is placed for the new part.
    expect(out.layout.map((e) => e.path.join("."))).toEqual(["web", "api", "api.checkout", "api.ledger"]);
  });

  it("drops positions of parts that are gone", () => {
    const { doc: out } = writeComponentPart(doc(), ["api"], `component api "API" { component checkout "Checkout" }\nweb -> api.checkout`);
    expect(out.layout.map((e) => e.path.join("."))).toEqual(["web", "api", "api.checkout"]);
  });

  it("renames when the top id changes; views and other connections follow", () => {
    const { doc: out, path } = writeComponentPart(
      doc(),
      ["api"],
      `component core "API" {\n  component checkout "Checkout"\n  component ledger "Ledger"\n}\ncore.checkout -> core.ledger\ncore.checkout -> stripe\nweb -> core.checkout`,
    );
    expect(path).toEqual(["core"]);
    expect(errors(out)).toEqual([]);
    expect(format(out)).toContain("web -> core.checkout");
    expect(out.layout.map((e) => e.path.join("."))).toContain("core.ledger");
  });

  it("adds a component at a path that names nothing yet", () => {
    const { doc: out } = writeComponentPart(doc(), ["api", "fraud"], `component fraud "Fraud"\napi.checkout -> api.fraud`);
    expect(errors(out)).toEqual([]);
    expect(format(out)).toContain("api.checkout -> api.fraud");
  });

  it("deletes on an empty source, like the canvas", () => {
    const { doc: out, path } = writeComponentPart(doc(), ["stripe"], "  # gone\n");
    expect(path).toBeNull();
    expect(errors(out)).toEqual([]);
    expect(format(out)).not.toContain("stripe");
  });

  it("leaves a dangling connection elsewhere for validation to catch", () => {
    const { doc: out } = writeComponentPart(doc(), ["api"], `component api "API" { component checkout "Checkout" }\nweb -> api.checkout`);
    // api.ledger is gone, and with it the only connection that named it.
    expect(errors(out)).toEqual([]);
    const { doc: bad } = writeComponentPart(doc(), ["stripe"], `component stripe "Stripe"\nweb -> stripe\nstripe -> api.nope`);
    expect(errors(bad).map((e) => e.code)).toContain("E101");
  });

  it("refuses connections with no end in the part", () => {
    expect(() => writeComponentPart(doc(), ["stripe"], `component stripe "Stripe"\nweb -> api.checkout`)).toThrow(
      /needs an end in stripe/,
    );
  });

  it("refuses more than one component, views and layout", () => {
    expect(() => writeComponentPart(doc(), ["stripe"], `component stripe\ncomponent other`)).toThrow(/exactly one component/);
    expect(() => writeComponentPart(doc(), ["stripe"], `component stripe\nsequence s { }`)).toThrow(/Views/);
    expect(() => writeComponentPart(doc(), ["stripe"], `component stripe\nlayout { stripe: { at: [0, 0] } }`)).toThrow(/layout/);
  });

  it("refuses a new path whose id doesn't match", () => {
    expect(() => writeComponentPart(doc(), ["fraud"], `component other`)).toThrow(/path names 'fraud'/);
  });

  it("reports parse errors with the part's own line numbers", () => {
    try {
      writeComponentPart(doc(), ["stripe"], `component stripe {\n  desc\n}`);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PartError);
      expect((e as PartError).diagnostics[0]!.span!.start.line).toBe(3);
    }
  });

  it("accepts a part that starts with a header", () => {
    const { doc: out } = writeComponentPart(doc(), ["stripe"], `arch "x" v0.2\ncomponent stripe "Stripe!"`);
    expect(out.components.find((c) => c.id === "stripe")!.name).toBe("Stripe!");
    expect(out.title).toBe("Shop");
  });
});

describe("view parts", () => {
  it("reads and writes a view by id", () => {
    const d = doc();
    const part = readViewPart(d, "pay");
    expect(part.kind).toBe("sequence");
    expect(part.source).toBe(`sequence pay "Pay" {\n  web -> api.checkout : "pay"\n  api.checkout -> stripe\n}\n`);
    expect(format(writeViewPart(d, "pay", part.source))).toBe(format(d));
    const edited = writeViewPart(d, "pay", `sequence pay "Pay" {\n  web -> stripe\n}`);
    expect(format(edited)).toContain("sequence pay \"Pay\" {\n  web -> stripe\n}");
  });

  it("adds a new view and deletes one", () => {
    const added = writeViewPart(doc(), "orders", `entities orders on api.ledger {\n  entity order {\n    id uuid pk\n  }\n}`);
    expect(added.models.map((m) => m.id)).toEqual(["orders"]);
    expect(writeViewPart(doc(), "pay", "").sequences).toEqual([]);
  });

  it("keeps ids and kinds", () => {
    expect(() => writeViewPart(doc(), "pay", `sequence other { }`)).toThrow(/keep their ids/);
    expect(() => writeViewPart(doc(), "pay", `flow pay { }`)).toThrow(/sequence view/);
    expect(() => writeViewPart(doc(), "pay", `component x`)).toThrow(/exactly one view/);
  });
});

describe("outline", () => {
  it("lists every component by full path, then the views", () => {
    expect(outline(doc())).toBe(`web "Web" @service — 2 connections
api "API" @service — on Backend, 2 parts, 3 connections
  api.checkout "Checkout" — 3 connections
  api.ledger "Ledger" @postgres — 1 connection
stripe "Stripe" — 2 connections

sequence pay "Pay"`);
  });

  it("stops at a depth", () => {
    expect(outline(doc(), { depth: 1 }).split("\n")[1]).toBe(`api "API" @service — on Backend, 2 parts (not shown), 3 connections`);
  });
});

describe("reading parts twice", () => {
  it("gives the same text each time", () => {
    const d = doc();
    expect(readViewPart(d, "pay").source).toBe(readViewPart(d, "pay").source);
    expect(readComponentPart(d, ["api"]).source).toBe(readComponentPart(d, ["api"]).source);
  });
});
