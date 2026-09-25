import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { docFilesModule } from "../scripts/docs";
import { APP_URL } from "../src/backend";
import { CLI_DOC, LANGUAGE_DOC, MCP_DOC } from "../src/docFiles";
import { DOC_PAGES, agentHref, docMarkdown, type DocPage, type DocSources } from "../src/docs";
import { EXAMPLES } from "../src/examples";
import { LANGUAGE_SPEC } from "../src/languageSpec";
import { createSlugger, fenced, headings, mapLinks } from "../src/markdown";
import { describeServer } from "../src/reference";

// Agents read the docs site's pages as markdown, over MCP (get_docs,
// archer://docs/<page>) and on the web (<page>.md, /llms-full.txt). These
// keep the bundled copies of docs/ current and every page's links working.

const ORIGIN = "https://archer.test";
const SOURCES: DocSources = { language: LANGUAGE_DOC, mcp: MCP_DOC, cli: CLI_DOC };
const PAGES = DOC_PAGES.map((p) => p.page);

let pages: Record<DocPage, string>;
let mcp: Awaited<ReturnType<typeof connectInProcess>>;

/** Every page as markdown for `origin`. */
const render = async (origin: string) =>
  Object.fromEntries(
    await Promise.all(PAGES.map(async (page) => [page, await docMarkdown(page, { origin, sources: SOURCES })])),
  ) as Record<DocPage, string>;

beforeAll(async () => {
  pages = await render(ORIGIN);
  process.env.ARCHER_SERVICE_SECRET = "test-service-secret";
  mcp = await connectInProcess({ userId: "user_tester", agentName: "test" });
});
afterAll(() => mcp?.client.close());

/** The ids GitHub gives a markdown document's headings. */
const idsOf = (markdown: string) => {
  const slug = createSlugger();
  return new Set(headings(markdown).map(slug));
};

describe("bundled docs", () => {
  it("are the current docs/ files (edit those, then `pnpm --filter @archer/mcp docs`)", () => {
    expect(readFileSync(new URL("../src/docFiles.ts", import.meta.url), "utf8")).toBe(docFilesModule());
  });

  it("include the whole language specification", () => {
    expect(LANGUAGE_SPEC).toBe(readFileSync(new URL("../../../docs/language-spec.md", import.meta.url), "utf8"));
  });

  it("leave out what the files keep for contributors", () => {
    expect(MCP_DOC).not.toContain("## Development");
    expect(CLI_DOC).not.toContain("## Development");
  });
});

describe("docs as markdown", () => {
  it("start each page with its title", () => {
    for (const page of PAGES) expect(pages[page], page).toMatch(/^# \S/);
  });

  it("keep the docs files as they are, apart from their links", () => {
    const unlink = (md: string) => mapLinks(md, () => "");
    expect(unlink(pages.language)).toBe(unlink(`${LANGUAGE_DOC.trimEnd()}\n`));
    expect(unlink(pages.cli)).toBe(unlink(`${CLI_DOC.trimEnd()}\n`));
  });

  it("link to other pages' markdown, and never to repository files", () => {
    expect(pages.cli).toContain(`](${ORIGIN}/language.md#8-validation)`);
    expect(pages.mcp).toContain(`](${ORIGIN}/docs/cli.md#archer-init)`);
    for (const page of PAGES) {
      const hrefs = [...pages[page].matchAll(/\]\(([^()\s]+)\)/g)].map((m) => m[1]!);
      expect(hrefs.filter((h) => !/^(https?:\/\/|#)/.test(h)), page).toEqual([]);
    }
  });

  it("only link to headings that exist, on the same page or another", () => {
    const ids = Object.fromEntries(PAGES.map((page) => [page, idsOf(pages[page])])) as Record<DocPage, Set<string>>;
    const broken: string[] = [];
    for (const page of PAGES) {
      for (const [, href] of pages[page].matchAll(/\]\(([^()\s]+)\)/g)) {
        const [target, anchor] = href!.startsWith("#")
          ? [page, href!.slice(1)]
          : [DOC_PAGES.find((p) => href!.startsWith(`${ORIGIN}${p.path}.md#`))?.page, href!.split("#")[1]];
        if (target && anchor !== undefined && !ids[target].has(anchor)) broken.push(`${page}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("put the tool reference, generated from the server, in the MCP page", async () => {
    const { tools, resources } = await describeServer();
    expect(pages.mcp).not.toContain("tools:start");
    for (const tool of tools) expect(pages.mcp).toContain(`#### \`${tool.name}\``);
    for (const resource of resources) expect(pages.mcp).toContain(`- \`${resource.uri}\``);
    expect(pages.mcp).toContain(`(version ${(await describeServer()).version}, ${tools.length} tools)`);
  });

  it("give every example its complete source", () => {
    for (const e of EXAMPLES) {
      expect(pages.examples).toContain(`## ${e.title}`);
      expect(pages.examples).toContain(fenced(e.source, "arch"));
      expect(pages.examples).toContain(`${ORIGIN}/sandbox/${e.slug}`);
    }
  });
});

describe("links", () => {
  it("go to the pages' markdown on the origin they're served from", () => {
    expect(agentHref("cli.md#archer-push", ORIGIN)).toBe(`${ORIGIN}/docs/cli.md#archer-push`);
    expect(agentHref("language-spec.md", ORIGIN)).toBe(`${ORIGIN}/language.md`);
    expect(agentHref("https://archer.tombyrne.dev/language#8-validation", ORIGIN)).toBe(`${ORIGIN}/language.md#8-validation`);
    expect(agentHref("https://archer.tombyrne.dev/language/examples", ORIGIN)).toBe(`${ORIGIN}/language/examples.md`);
    expect(agentHref("https://archer.tombyrne.dev/sandbox/x", ORIGIN)).toBe(`${ORIGIN}/sandbox/x`);
    expect(agentHref("https://archer.tombyrne.dev", ORIGIN)).toBe(`${ORIGIN}/`);
    expect(agentHref("#protocol", ORIGIN)).toBe("#protocol");
    expect(agentHref("https://modelcontextprotocol.io", ORIGIN)).toBe("https://modelcontextprotocol.io");
  });

  it("are rewritten outside code only", () => {
    const md = "[a](x.md) `[b](x.md)`\n\n```md\n[c](x.md)\n```\n\n````\n```\n[d](x.md)\n````\n[e](x.md)\n";
    expect(mapLinks(md, (h) => h.toUpperCase())).toBe(
      "[a](X.MD) `[b](x.md)`\n\n```md\n[c](x.md)\n```\n\n````\n```\n[d](x.md)\n````\n[e](X.MD)\n",
    );
  });
});

describe("over MCP", () => {
  // The server's links point at the deployment it runs on.
  let served: Record<DocPage, string>;
  beforeAll(async () => {
    served = await render(APP_URL);
  });

  it("get_docs returns each page", async () => {
    for (const page of PAGES) {
      const res = await mcp.call("get_docs", { page });
      expect(res.isError, page).toBe(false);
      expect(res.text, page).toBe(served[page]);
    }
  });

  it("each page is also a markdown resource", async () => {
    const { resources } = await mcp.client.listResources();
    for (const p of DOC_PAGES) {
      const uri = `archer://docs/${p.page}`;
      expect(resources).toContainEqual(expect.objectContaining({ uri, mimeType: "text/markdown", title: `Docs: ${p.title}` }));
      const { contents } = await mcp.client.readResource({ uri });
      expect(contents).toEqual([{ uri, mimeType: "text/markdown", text: served[p.page] }]);
    }
  });

  it("tells agents where the guide and the docs are when they connect", () => {
    const instructions = mcp.client.getInstructions() ?? "";
    expect(instructions).toContain("get_guide");
    expect(instructions).toContain("get_docs");
    expect(instructions).toContain("archer://docs/");
  });
});
