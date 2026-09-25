import { afterEach, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { db } from "../src/backend";
import { EXAMPLE_STATE, TOOL_DOCS, TOOL_GROUPS, describeServer } from "../src/reference";
import { createFakeBackend } from "./fakeBackend";
import { createFakeHost } from "./fakeHost";
import { seedExample } from "./seedExample";

// The docs site's tool reference (src/reference.ts) promises that every tool
// is documented and that each example call returns what the docs show. These
// run the examples against the real tools, over a fake backend seeded with
// the example scenario.

process.env.ARCHER_SERVICE_SECRET ??= "test-service-secret";

const ANY = "…";
const documented = TOOL_GROUPS.flatMap((g) => g.tools);

/** Where a result differs from its documented example. `"…"` matches anything (see ToolDoc.result). */
function shapeDiff(actual: unknown, doc: unknown, at = "result"): string[] {
  if (doc === ANY) return [];
  if (Array.isArray(doc)) {
    if (!Array.isArray(actual)) return [`${at}: not an array`];
    const open = doc.at(-1) === ANY;
    const items = open ? doc.slice(0, -1) : doc;
    if (open ? actual.length < items.length : actual.length !== items.length)
      return [`${at}: ${actual.length} elements, documented ${items.length}${open ? " or more" : ""}`];
    return items.flatMap((d, i) => shapeDiff(actual[i], d, `${at}[${i}]`));
  }
  if (doc !== null && typeof doc === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return [`${at}: not an object`];
    const a = actual as Record<string, unknown>;
    const d = doc as Record<string, unknown>;
    return [...new Set([...Object.keys(d), ...Object.keys(a)])].flatMap((k) =>
      !(k in d)
        ? [`${at}.${k}: returned but not documented`]
        : !(k in a)
          ? [`${at}.${k}: documented but not returned`]
          : shapeDiff(a[k], d[k], `${at}.${k}`),
    );
  }
  if (doc === null) return actual === null ? [] : [`${at}: not null`];
  return typeof actual === typeof doc ? [] : [`${at}: a ${typeof actual}, documented as a ${typeof doc}`];
}

/** A documented text result as a whole-text pattern, `…` standing for any run of text. */
const textPattern = (doc: string) =>
  new RegExp(`^${doc.split(ANY).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*")}$`);

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe("tool reference", () => {
  it("documents every registered tool once, in a group", async () => {
    const { tools } = await describeServer();
    const names = tools.map((t) => t.name).sort();
    expect([...documented].sort()).toEqual(names);
    expect(Object.keys(TOOL_DOCS).sort()).toEqual(names);
  });

  it("describes the server as agents see it", async () => {
    const server = await describeServer();
    expect(server.name).toBe("archer");
    expect(server.tools.every((t) => t.title && t.description)).toBe(true);
    expect(server.resources.map((r) => r.uri)).toContain("archer://guide");
  });

  it("gives each example the parameters its tool takes", async () => {
    const { tools } = await describeServer();
    for (const tool of tools) {
      const args = Object.keys(TOOL_DOCS[tool.name]!.args);
      const params = Object.keys(tool.inputSchema.properties ?? {});
      expect(params, tool.name).toEqual(expect.arrayContaining(args));
      expect(args, tool.name).toEqual(expect.arrayContaining(tool.inputSchema.required ?? []));
    }
  });

  it.each(documented)("%s: the example runs and returns what the docs show", async (name) => {
    const fake = createFakeBackend();
    const { host, github } = createFakeHost(fake, { email: EXAMPLE_STATE.email });
    seedExample(fake, github);
    Object.assign(db, fake.db);
    const mcp = await connectInProcess({ userId: EXAMPLE_STATE.user, agentName: EXAMPLE_STATE.agentName, host });
    close = () => mcp.client.close();

    const doc = TOOL_DOCS[name]!;
    const res = await mcp.call(name, doc.args);
    expect(res.isError, res.text).toBe(false);
    if (typeof doc.result === "string") {
      expect(res.json).toBeNull();
      expect(res.text).toMatch(textPattern(doc.result));
    } else {
      expect(shapeDiff(res.json, doc.result)).toEqual([]);
    }
  });
});
