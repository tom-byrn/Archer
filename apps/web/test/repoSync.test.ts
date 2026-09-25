import { describe, expect, it } from "vitest";
import { diffDocs, format, parse } from "@archer/lang";
import {
  conflictLine,
  describeChanges,
  fileSource,
  planSync,
  publishBody,
  publishTitle,
  resolveMerge,
  sameArchitecture,
  syncStatus,
  type StoredFile,
} from "../lib/repoSync";

const FILE = `arch "Shop" v0.1

component web "Web" {
  desc "Storefront"
}

component api "API" {
  desc "Orders"
}

component db "DB" @postgres

api -> db @sql
web -> api @http
`;

/** The document as Archer holds it: same architecture, plus a layout block. */
const DRAFT = format({ ...parse(FILE).doc, layout: parse(`${FILE}\nlayout {\n  web: { at: [0, 0], size: [4, 3] }\n  api: { at: [6, 0], size: [4, 3] }\n  db: { at: [12, 0], size: [4, 3] }\n}\n`).doc.layout });

const edit = (src: string, find: string, replace: string) => {
  expect(src).toContain(find);
  return src.replace(find, replace);
};

describe("file source", () => {
  it("is canonical and never carries layout", () => {
    expect(fileSource(DRAFT)).toBe(FILE);
    expect(fileSource(DRAFT)).not.toContain("layout");
  });

  it("compares architecture only", () => {
    expect(sameArchitecture(FILE, DRAFT)).toBe(true);
    expect(sameArchitecture(FILE, `${FILE}\n# a comment\n`)).toBe(true);
    expect(sameArchitecture(FILE, edit(FILE, '"Orders"', '"Orders v2"'))).toBe(false);
  });
});

describe("planSync", () => {
  it("fast-forwards when there is no draft", () => {
    const head = edit(FILE, 'component db "DB" @postgres', 'component db "DB" @postgres\n\ncomponent cache "Cache" @redis');
    const plan = planSync({ base: FILE, draft: DRAFT, head });
    expect(plan).toEqual({ action: "fast-forward", source: head });
  });

  it("adopts a head that already has the draft's architecture (our pull request merged)", () => {
    const draft = edit(DRAFT, '"Orders"', '"Orders and refunds"');
    const head = edit(FILE, '"Orders"', '"Orders and refunds"');
    expect(planSync({ base: FILE, draft, head })).toEqual({ action: "adopt" });
  });

  it("adopts a head that only changed formatting or comments", () => {
    const draft = edit(DRAFT, '"Orders"', '"Orders and refunds"');
    expect(planSync({ base: FILE, draft, head: `# Owned by the platform team\n${FILE}` })).toEqual({ action: "adopt" });
  });

  it("merges a draft and a head that changed different components", () => {
    const draft = edit(DRAFT, '"Storefront"', '"Storefront and cart"');
    const head = edit(FILE, '"Orders"', '"Orders and refunds"');
    const plan = planSync({ base: FILE, draft, head });
    expect(plan.action).toBe("merge");
    if (plan.action !== "merge") return;
    const merged = parse(plan.source).doc;
    expect(merged.components.map((c) => c.desc)).toEqual(["Storefront and cart", "Orders and refunds", undefined]);
    // The draft's layout survives the merge.
    expect(merged.layout.map((e) => e.path.join(".")).sort()).toEqual(["api", "db", "web"]);
  });

  it("reports conflicts when both changed the same thing", () => {
    const draft = edit(DRAFT, '"Orders"', '"Mine"');
    const head = edit(FILE, '"Orders"', '"Theirs"');
    expect(planSync({ base: FILE, draft, head })).toEqual({
      action: "conflict",
      conflicts: ["api: changed desc on both sides"],
    });
  });

  it("merges against an empty base when the document never had the file", () => {
    const draft = format(parse('arch "Shop" v0.1\n\ncomponent web "Web"\n').doc);
    const head = 'arch "Shop" v0.1\n\ncomponent api "API"\n';
    const plan = planSync({ base: null, draft, head });
    expect(plan.action).toBe("merge");
    if (plan.action === "merge") expect(parse(plan.source).doc.components.map((c) => c.id)).toEqual(["api", "web"]);
  });
});

describe("resolveMerge", () => {
  const draft = edit(edit(DRAFT, '"Orders"', '"Mine"'), '"Storefront"', '"Storefront and cart"');
  const head = edit(edit(FILE, '"Orders"', '"Theirs"'), 'component db "DB" @postgres', 'component db "DB" @postgres\n\ncomponent cache "Cache"');

  it("keeps both sides' other changes whichever side wins the conflict", () => {
    for (const prefer of ["draft", "head"] as const) {
      const doc = parse(resolveMerge({ base: FILE, draft, head, prefer })).doc;
      expect(doc.components.find((c) => c.id === "web")?.desc).toBe("Storefront and cart");
      expect(doc.components.some((c) => c.id === "cache")).toBe(true);
      expect(doc.components.find((c) => c.id === "api")?.desc).toBe(prefer === "draft" ? "Mine" : "Theirs");
    }
  });
});

describe("syncStatus", () => {
  const file = (extra: Partial<StoredFile> = {}): StoredFile => ({
    owner: "acme",
    name: "shop",
    branch: "main",
    path: "architecture.arch",
    base: { commit: "c1", blob: "b1", source: FILE, at: 1 },
    ...extra,
  });

  it("is synced when only the layout differs", () => {
    expect(syncStatus(file(), DRAFT)).toEqual({ kind: "synced" });
  });

  it("counts unpublished changes", () => {
    const s = syncStatus(file(), edit(DRAFT, '"Orders"', '"Orders v2"'));
    expect(s.kind).toBe("draft");
    if (s.kind === "draft") expect(s.summary.changed).toBe(1);
  });

  it("is new before the file exists, and in conflict while one waits", () => {
    expect(syncStatus(file({ base: undefined }), DRAFT)).toEqual({ kind: "new" });
    const incoming = { commit: "c2", blob: "b2", source: FILE, conflicts: ["api: x"], at: 2 };
    expect(syncStatus(file({ incoming }), DRAFT)).toEqual({ kind: "conflict" });
  });
});

describe("publish text", () => {
  const diffOf = (next: string) => diffDocs(parse(FILE).doc, parse(next).doc);

  it("names small changes and summarizes the rest", () => {
    expect(publishTitle(diffOf(edit(FILE, 'component db "DB" @postgres', 'component db "DB" @postgres\n\ncomponent cache "Cache"')), "architecture.arch")).toBe(
      "Add cache to architecture.arch",
    );
    expect(publishTitle(diffOf(edit(FILE, '"Orders"', '"Orders v2"')), "architecture.arch")).toBe(
      "Update the description of api in architecture.arch",
    );
    const many = edit(edit(FILE, '"Orders"', '"Orders v2"'), '"Storefront"', '"Store"');
    expect(publishTitle(diffOf(many), "architecture.arch")).toBe("Update architecture.arch: 2 components changed");
  });

  it("lists every change in the pull request body", () => {
    const body = publishBody(diffOf(edit(FILE, "api -> db @sql\n", "")), "https://archer.test/documents/x");
    expect(body).toContain("- `api -> db`: removed");
    expect(body).toContain("https://archer.test/documents/x");
  });

  it("describes summaries and conflicts in words", () => {
    expect(describeChanges({ added: 1, removed: 0, changed: 2, connectionsAdded: 1, connectionsRemoved: 0, connectionsChanged: 0 })).toBe(
      "1 component added, 2 components changed, connection 1 added",
    );
    expect(conflictLine({ kind: "connection", path: "web|->|api|http|", reason: "removed on one side, changed on the other" })).toBe(
      "web -> api: removed on one side, changed on the other",
    );
  });
});
