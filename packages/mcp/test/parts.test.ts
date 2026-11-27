import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { db } from "../src/backend";
import { EXAMPLE_STATE } from "../src/reference";
import { EXAMPLES } from "../src/examples";
import { layoutMap, parse } from "@archer/lang";
import { createFakeBackend } from "./fakeBackend";
import { seedExample } from "./seedExample";

// get_part / update_part beyond the documented example: the ways a write is
// refused, and that a part's edit leaves the rest of the document alone.

process.env.ARCHER_SERVICE_SECRET ??= "test-service-secret";
const project_id = EXAMPLE_STATE.project.id;

let mcp: Awaited<ReturnType<typeof connectInProcess>>;
beforeEach(async () => {
  const fake = createFakeBackend();
  seedExample(fake);
  Object.assign(db, fake.db);
  mcp = await connectInProcess({ userId: EXAMPLE_STATE.user, agentName: EXAMPLE_STATE.agentName });
});
afterEach(() => mcp.client.close());

const source = async () => (await mcp.call("get_project", { project_id })).json.source as string;

describe("parts", () => {
  it("edits one component and keeps the rest, positions included", async () => {
    const before = await source();
    const part = (await mcp.call("get_part", { project_id, path: "stripe" })).json;
    const res = await mcp.call("update_part", {
      project_id,
      path: "stripe",
      version: part.version,
      source: part.source.replace('"Stripe"', '"Stripe Payments"'),
    });
    expect(res.isError, res.text).toBe(false);
    const after = await source();
    expect(after).toBe(before.replace('component stripe "Stripe"', 'component stripe "Stripe Payments"'));
    // The version moves on, and the old one is now stale.
    expect(res.json.version).not.toBe(part.version);
    const stale = await mcp.call("update_part", { project_id, path: "stripe", version: part.version, source: part.source });
    expect(stale.isError).toBe(true);
    expect(stale.json.message).toMatch(/changed since you read it/);
    expect(await source()).toBe(after);
  });

  it("reports a part that doesn't parse with its own line numbers", async () => {
    const res = await mcp.call("update_part", { project_id, path: "stripe", source: "component stripe {\n  desc\n}" });
    expect(res.isError).toBe(true);
    expect(res.json.errors[0]).toMatch(/^E001 \[error\] line 3:/);
  });

  it("rejects a part that breaks the document, saving nothing", async () => {
    const before = await source();
    const res = await mcp.call("update_part", { project_id, path: "stripe", source: "component stripe\nstripe -> nowhere" });
    expect(res.isError).toBe(true);
    expect(res.json.errors.join(" ")).toMatch(/E101/);
    expect(await source()).toBe(before);
  });

  it("deletes a component, and reads and writes views", async () => {
    const del = await mcp.call("update_part", { project_id, path: "stripe", source: "" });
    expect(del.json).toMatchObject({ saved: true, deleted: true, path: null });
    expect(await source()).not.toMatch(/stripe/);
    const add = await mcp.call("update_part", {
      project_id,
      view: "order",
      source: "sequence order \"Order\" {\n  web -> api\n  api -> db\n}",
    });
    expect(add.isError, add.text).toBe(false);
    const read = await mcp.call("get_part", { project_id, view: "order" });
    expect(read.json).toMatchObject({ view: "order", kind: "sequence", version: add.json.version });
    const outline = await mcp.call("get_outline", { project_id });
    expect(outline.json.outline).toMatch(/\n\nsequence order "Order"$/);
  });

  it("wants exactly one of path and view", async () => {
    const res = await mcp.call("get_part", { project_id });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/exactly one of `path`/);
  });

  it("round-trips every part of every example without a change or a revision", async () => {
    for (const ex of EXAMPLES) {
      const id = (await mcp.call("create_project", { source: ex.source })).json.id;
      const before = (await mcp.call("get_project", { project_id: id })).json.source;
      const history = (await mcp.call("get_history", { project_id: id })).json.length;
      const [components, views = ""] = (await mcp.call("get_outline", { project_id: id })).json.outline.split("\n\n");
      const targets = [
        ...components.split("\n").map((l: string) => ({ path: l.trim().split(" ")[0] })),
        ...views.split("\n").filter(Boolean).map((l: string) => ({ view: l.split(" ")[1] })),
      ];
      for (const t of targets) {
        const part = (await mcp.call("get_part", { project_id: id, ...t })).json;
        const res = await mcp.call("update_part", { project_id: id, ...t, source: part.source, version: part.version });
        expect(res.isError, `${ex.slug} ${JSON.stringify(t)} ${res.text}`).toBe(false);
        expect(res.json.version).toBe(part.version);
      }
      expect((await mcp.call("get_project", { project_id: id })).json.source, ex.slug).toBe(before);
      expect((await mcp.call("get_history", { project_id: id })).json.length, ex.slug).toBe(history);
    }
  });

  it("keeps a renamed component where it was, and says which views changed", async () => {
    const ex = EXAMPLES.find((e) => e.slug === "sequences")!;
    const id = (await mcp.call("create_project", { source: ex.source })).json.id;
    const at = async (p: string) => layoutMap(parse((await mcp.call("get_project", { project_id: id })).json.source).doc).get(p)?.at;
    const was = await at("cache");
    const part = (await mcp.call("get_part", { project_id: id, path: "cache" })).json;
    const res = await mcp.call("update_part", { project_id: id, path: "cache", source: part.source.replaceAll("cache", "redis") });
    expect(res.json).toMatchObject({ path: "redis", views_changed: ["shorten", "resolve"] });
    expect(await at("redis")).toEqual(was);
  });
});
