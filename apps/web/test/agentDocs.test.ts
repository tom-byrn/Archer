import { existsSync } from "node:fs";
import { NextRequest, type NextFetchEvent } from "next/server";
import { describe, expect, it } from "vitest";
import { CLI_DOC, LANGUAGE_DOC, MCP_DOC } from "@archer/mcp/docFiles";
import { DOC_PAGES } from "@archer/mcp/docs";
import * as cliMd from "../app/docs/cli.md/route";
import * as mcpMd from "../app/docs/mcp.md/route";
import * as examplesMd from "../app/language/examples.md/route";
import * as languageMd from "../app/language.md/route";
import * as llmsFull from "../app/llms-full.txt/route";
import * as llms from "../app/llms.txt/route";
import { pageMarkdown, readDocs } from "../lib/docs";
import { llmsFullTxt, llmsTxt } from "../lib/llms";
import { markdownTwin, prefersMarkdown } from "../lib/negotiate";
import { SITE_URL } from "../lib/site";
import middleware from "../middleware";

// Agents that come from the web get the docs as markdown: each page's `.md`,
// /llms.txt and /llms-full.txt, and the page itself when they ask for
// text/markdown. It's the same markdown the MCP server's get_docs returns.

/** The route modules, by the path each serves. */
const ROUTES: Record<string, { GET: () => Promise<Response>; dynamic: string }> = {
  "/language.md": languageMd,
  "/language/examples.md": examplesMd,
  "/docs/mcp.md": mcpMd,
  "/docs/cli.md": cliMd,
  "/llms.txt": llms,
  "/llms-full.txt": llmsFull,
};

describe("the docs' markdown", () => {
  it("is what the MCP server serves: its bundled docs files are the site's", () => {
    expect(readDocs()).toEqual({ language: LANGUAGE_DOC, mcp: MCP_DOC, cli: CLI_DOC });
  });

  it.each(DOC_PAGES.map((p) => [p.path, p] as const))("%s.md serves the page's markdown", async (path, p) => {
    expect(existsSync(new URL(`../app${path}.md/route.ts`, import.meta.url))).toBe(true);
    const { GET, dynamic } = ROUTES[`${path}.md`]!;
    expect(dynamic).toBe("force-static");
    const res = await GET();
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("link")).toBe(`<${SITE_URL}${path}>; rel="canonical"`);
    expect(await res.text()).toBe(await pageMarkdown(p.page));
  });
});

describe("llms.txt", () => {
  it("says what Archer is and links every page's markdown", async () => {
    const text = llmsTxt();
    expect(text).toMatch(/^# Archer\n\n> Archer is /);
    for (const p of DOC_PAGES) expect(text).toContain(`- [${p.title}](${SITE_URL}${p.path}.md): ${p.summary}`);
    expect(text).toContain(`(${SITE_URL}/llms-full.txt)`);
    const res = await ROUTES["/llms.txt"]!.GET();
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(text);
  });

  it("has a full version with every page in it", async () => {
    const full = await llmsFullTxt();
    for (const p of DOC_PAGES) expect(full).toContain((await pageMarkdown(p.page)).trimEnd());
    expect(await (await ROUTES["/llms-full.txt"]!.GET()).text()).toBe(full);
  });
});

describe("content negotiation", () => {
  it("prefers markdown only when the request ranks it at least as high as HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9, */*;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.5, */*")).toBe(false);
    expect(prefersMarkdown("text/html, text/markdown;q=0.9")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
    // A browser, and curl.
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });

  it("knows each docs page's markdown, and the landing page's", () => {
    for (const p of DOC_PAGES) expect(markdownTwin(p.path)).toBe(`${p.path}.md`);
    expect(markdownTwin("/")).toBe("/llms.txt");
    expect(markdownTwin("/documents/abc")).toBeNull();
    expect(markdownTwin("/language.md")).toBeNull();
  });

  const request = (path: string, accept: string) =>
    middleware(new NextRequest(`https://archer.test${path}`, { headers: { accept } }), {} as NextFetchEvent);

  it("answers a docs page with its markdown when the request asks for it", async () => {
    const res = (await request("/docs/cli", "text/markdown, text/html;q=0.9"))!;
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://archer.test/docs/cli.md");
    expect(res.headers.get("vary")).toBe("Accept");
    const home = (await request("/", "text/markdown"))!;
    expect(home.headers.get("x-middleware-rewrite")).toBe("https://archer.test/llms.txt");
  });

  it("leaves browsers on the page", async () => {
    const res = await request("/docs/cli", "text/html,application/xhtml+xml,*/*;q=0.8");
    expect(res?.headers.get("x-middleware-rewrite") ?? null).toBeNull();
  });
});
