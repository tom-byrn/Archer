import { describe, expect, it } from "vitest";
import { checkFiles, expandFiles, fileOf, format, moveInline, moveToFile, relativeFile, resolveFile, splitFiles, validate } from "../src";

const ROOT = `arch "Shop" v0.2

component web "Storefront" @vercel.nextjs

import "./services/billing/billing.arch" as billing

component search "Search" @service {
  use "./services/search/search.arch"
  color blue
}

component db "Orders DB" @postgres

billing.ledger -> db @sql
web -> billing.checkout @http
web -> search

sequence pay "Pay" {
  web -> billing.checkout
  billing.ledger -> db
}
`;

const BILLING = `arch "Billing" v0.2

component checkout "Checkout" @service

import "./tax/tax.arch" as tax

component ledger "Ledger" @service

checkout -> ledger
checkout -> tax.rates

sequence charge "Charge" {
  checkout -> ledger
}
`;

const TAX = `arch "Tax" v0.2

component rates "Rates"
`;

const SEARCH = `arch "Search" v0.2

component index "Index"
`;

const FILES: Record<string, string> = {
  "architecture.arch": ROOT,
  "services/billing/billing.arch": BILLING,
  "services/billing/tax/tax.arch": TAX,
  "services/search/search.arch": SEARCH,
};
const read = (files: Record<string, string>) => (p: string) => files[p];

describe("paths", () => {
  it("resolves and relativizes", () => {
    expect(resolveFile("architecture.arch", "./services/billing/billing.arch")).toBe("services/billing/billing.arch");
    expect(resolveFile("services/billing/billing.arch", "./tax/tax.arch")).toBe("services/billing/tax/tax.arch");
    expect(resolveFile("a/b.arch", "../c.arch")).toBe("c.arch");
    expect(resolveFile("b.arch", "../c.arch")).toBeNull();
    expect(resolveFile("b.arch", "/etc/c.arch")).toBeNull();
    expect(relativeFile("architecture.arch", "services/billing/billing.arch")).toBe("./services/billing/billing.arch");
    expect(relativeFile("a/x.arch", "b/y.arch")).toBe("../b/y.arch");
  });
});

describe("expandFiles", () => {
  it("puts the document together with full paths", () => {
    const { doc, diagnostics, files } = expandFiles("architecture.arch", read(FILES));
    expect(diagnostics).toEqual([]);
    expect(files).toEqual(["architecture.arch", "services/billing/billing.arch", "services/billing/tax/tax.arch", "services/search/search.arch"]);
    const text = format(doc);
    expect(text).toContain(`import "./services/billing/billing.arch" as billing "Billing" {`);
    expect(text).toContain("billing.checkout -> billing.tax.rates");
    expect(text).toContain("billing.checkout -> billing.ledger");
    expect(text).toContain(`sequence charge "Charge" {\n  billing.checkout -> billing.ledger\n}`);
    expect(text).toContain(`component search "Search" @service {\n  use "./services/search/search.arch"\n  color blue\n  component index "Index"\n}`);
    expect(fileOf(doc, "architecture.arch", ["billing", "tax", "rates"])).toBe("services/billing/tax/tax.arch");
    expect(fileOf(doc, "architecture.arch", ["billing"])).toBe("architecture.arch");
  });
});

describe("splitFiles", () => {
  it("is the inverse of expandFiles", () => {
    const { doc } = expandFiles("architecture.arch", read(FILES));
    const split = splitFiles(doc, "architecture.arch");
    expect([...split.keys()]).toEqual(Object.keys(FILES));
    for (const [file, text] of split) expect(text, file).toBe(FILES[file]);
  });

  it("puts a connection in the deepest file that holds both ends", () => {
    const { doc } = expandFiles("architecture.arch", read(FILES));
    doc.connections.push({ ...doc.connections[0]!, source: ["billing", "tax", "rates"], target: ["billing", "ledger"], type: undefined, label: undefined });
    doc.connections.push({ ...doc.connections[0]!, source: ["search", "index"], target: ["billing", "tax", "rates"], type: undefined, label: undefined });
    const split = splitFiles(doc, "architecture.arch");
    expect(split.get("services/billing/billing.arch")).toContain("tax.rates -> ledger");
    expect(split.get("architecture.arch")).toContain("search.index -> billing.tax.rates");
  });

  it("moves a component's inside into a file, and back, re-pointing the files used from it", () => {
    const { doc } = expandFiles("architecture.arch", read(FILES));
    const moved = moveToFile(doc, "architecture.arch", ["db"], "data/db.arch");
    const split = splitFiles(moved, "architecture.arch");
    expect(split.get("architecture.arch")).toContain(`component db "Orders DB" @postgres {\n  use "./data/db.arch"\n}`);
    expect(split.get("data/db.arch")).toBe(`arch "Orders DB" v0.2\n`);

    const inline = splitFiles(moveInline(doc, "architecture.arch", ["billing"]), "architecture.arch");
    expect(inline.has("services/billing/billing.arch")).toBe(false);
    expect(inline.get("architecture.arch")).toContain(
      `component billing "Billing" {\n  component checkout "Checkout" @service\n  import "./services/billing/tax/tax.arch" as tax\n  component ledger "Ledger" @service\n}`,
    );
    expect(inline.get("services/billing/tax/tax.arch")).toBe(TAX);

    // Into a file somewhere else: the tax file is re-pointed from there.
    const away = splitFiles(moveToFile(moveInline(doc, "architecture.arch", ["billing"]), "architecture.arch", ["billing"], "billing.arch"), "architecture.arch");
    expect(away.get("billing.arch")).toContain(`import "./services/billing/tax/tax.arch" as tax`);
    for (const [file, text] of away) expect(expandFiles("architecture.arch", (p) => away.get(p)).diagnostics, file + text).toEqual([]);
  });

  it("refuses a file that's taken or outside the folder", () => {
    const { doc } = expandFiles("architecture.arch", read(FILES));
    expect(() => moveToFile(doc, "architecture.arch", ["db"], "services/search/search.arch")).toThrow(/already holds/);
    expect(() => moveToFile(doc, "architecture.arch", ["db"], "../db.arch")).toThrow(/isn't a path/);
    expect(() => moveToFile(doc, "architecture.arch", ["billing"], "x.arch")).toThrow(/already in/);
  });
});

describe("file errors", () => {
  const with_ = (over: Record<string, string | undefined>) => {
    const files = { ...FILES, ...over } as Record<string, string>;
    for (const [k, v] of Object.entries(over)) if (v === undefined) delete files[k];
    return expandFiles("architecture.arch", read(files)).diagnostics.map((d) => [d.code, d.file]);
  };
  it("reports a missing file, a loop, a file used twice, inline parts and a path outside", () => {
    expect(with_({ "services/search/search.arch": undefined })).toEqual([["E401", "architecture.arch"]]);
    expect(with_({ "services/billing/tax/tax.arch": `arch "Tax" v0.2\nimport "../billing.arch" as again` })).toEqual([["E402", "services/billing/tax/tax.arch"]]);
    expect(with_({ "services/search/search.arch": `arch "Search" v0.2\nimport "../billing/tax/tax.arch" as tax2` })).toEqual([["E403", "services/search/search.arch"]]);
    expect(with_({ "architecture.arch": ROOT.replace(`use "./services/search/search.arch"`, `use "./services/search/search.arch"\n  component extra`) })).toEqual([["E404", "architecture.arch"]]);
    expect(with_({ "architecture.arch": ROOT.replace("./services/search/search.arch", "../search.arch") })).toEqual([["E405", "architecture.arch"]]);
  });
});

describe("checkFiles", () => {
  it("validates each file with the files it uses filled in", () => {
    expect(checkFiles("architecture.arch", read(FILES)).diagnostics).toEqual([]);
  });

  it("reports each problem in its own file with its own line", () => {
    const files = {
      ...FILES,
      "services/billing/billing.arch": BILLING.replace("checkout -> tax.rates", "checkout -> tax.nope"),
      "architecture.arch": ROOT.replace("web -> search", "web -> search.missing"),
    };
    const ds = checkFiles("architecture.arch", read(files)).diagnostics.map((d) => [d.code, d.file, d.span?.start.line]);
    expect(ds).toEqual([
      ["E101", "architecture.arch", 16],
      ["E101", "services/billing/billing.arch", 10],
    ]);
  });

  it("doesn't report a sub-file's own problems in the file that uses it", () => {
    const files = { ...FILES, "services/search/search.arch": `arch "Search" v0.2\ncomponent index\ncomponent index` };
    const ds = checkFiles("architecture.arch", read(files)).diagnostics.map((d) => [d.code, d.file]);
    expect(ds).toEqual([["E002", "services/search/search.arch"]]);
  });
});

describe("validate", () => {
  it("flags a file used twice or a path outside the folder in a put-together document", () => {
    const { doc } = expandFiles("architecture.arch", read(FILES));
    doc.components.find((c) => c.id === "db")!.use = "./services/search/search.arch";
    doc.components.find((c) => c.id === "web")!.use = "../web.arch";
    expect(validate(doc).map((d) => d.code).filter((c) => c.startsWith("E4"))).toEqual(["E405", "E403"]);
  });

  it("lets a used file point up a folder when it's really there", () => {
    const files = { ...FILES, "services/search/search.arch": `arch "Search" v0.2\nimport "../shared.arch" as shared`, "services/shared.arch": `arch "Shared" v0.2` };
    expect(checkFiles("architecture.arch", read(files)).diagnostics).toEqual([]);
  });
});
