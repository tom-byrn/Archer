import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { EXAMPLES } from "../src/examples";

// The docs' worked examples, served to agents as tools and resources. They
// need no backend, but run behind the same auth wrapper as every other tool.

const APP_URL = "https://archer.test";
let mcp: Awaited<ReturnType<typeof connectInProcess>>;

beforeAll(async () => {
  // Read when connectInProcess loads the tools.
  process.env.ARCHER_APP_URL = APP_URL;
  process.env.ARCHER_SERVICE_SECRET = "test-service-secret";
  mcp = await connectInProcess({ userId: "user_tester", agentName: "test" });
});
afterAll(() => mcp?.client.close());

const links = (slug: string) => ({
  docs_url: `${APP_URL}/language/examples#${slug}`,
  sandbox_url: `${APP_URL}/sandbox/${slug}`,
});

describe("worked examples", () => {
  it("list_examples describes each one and links to it, without the source", async () => {
    const res = await mcp.call("list_examples");
    expect(res.isError).toBe(false);
    expect(res.json).toEqual(
      EXAMPLES.map(({ slug, title, summary, features }) => ({ slug, title, summary, features, ...links(slug) })),
    );
  });

  it.each(EXAMPLES.map((e) => [e.slug, e] as const))("get_example returns %s with its source", async (slug, e) => {
    const res = await mcp.call("get_example", { slug });
    expect(res.isError).toBe(false);
    expect(res.json).toEqual({
      slug,
      title: e.title,
      summary: e.summary,
      features: e.features,
      ...links(slug),
      source: e.source,
    });
  });

  it("get_example names the valid slugs when given an unknown one", async () => {
    const res = await mcp.call("get_example", { slug: "no-such-example" });
    expect(res.isError).toBe(true);
    for (const e of EXAMPLES) expect(res.text).toContain(e.slug);
  });

  it("each example is also a resource", async () => {
    const { resources } = await mcp.client.listResources();
    for (const e of EXAMPLES) {
      const uri = `archer://examples/${e.slug}`;
      expect(resources).toContainEqual(expect.objectContaining({ uri, title: `Example: ${e.title}` }));
      const { contents } = await mcp.client.readResource({ uri });
      expect(contents).toEqual([{ uri, mimeType: "text/plain", text: e.source }]);
    }
  });
});
