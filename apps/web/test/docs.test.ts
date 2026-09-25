import { beforeAll, describe, expect, it } from "vitest";
import { DOC_PAGES } from "@archer/mcp/docs";
import { createSlugger, readDoc, renderDocs, renderInline, siteHref } from "../lib/docs";
import { loadMcpDocs, type McpDocs } from "../lib/mcpDocs";

// The docs pages render docs/mcp.md, docs/cli.md and docs/language-spec.md,
// with links rewritten for the site and GitHub-style heading ids. These keep
// every link between and within those pages pointing at a heading that exists.

const idsIn = (html: string) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
const hrefsIn = (html: string) => [...html.matchAll(/ href="([^"]+)"/g)].map((m) => m[1]!);

interface Page {
  ids: Set<string>;
  hrefs: string[];
}

let pages: Record<string, Page>;
let mcp: McpDocs;

beforeAll(async () => {
  mcp = await loadMcpDocs();
  const referenceIds = [
    ...mcp.reference.groups.flatMap((g) => [g.id, ...g.tools.map((t) => t.id)]),
    mcp.reference.resourcesId,
  ];
  // The generated part's own links are built from these ids; its prose (intros, notes) is markdown.
  const referenceProse = mcp.reference.groups
    .flatMap((g) => [g.intro, ...g.tools.flatMap((t) => t.notes)])
    .map(renderInline)
    .join("\n");
  const cli = renderDocs(readDoc("cli")).html;
  const language = renderDocs(readDoc("language")).html;
  pages = {
    "/docs/mcp": {
      ids: new Set([...idsIn(mcp.intro), ...idsIn(mcp.outro), ...referenceIds]),
      hrefs: hrefsIn(mcp.intro + mcp.outro + referenceProse),
    },
    "/docs/cli": { ids: new Set(idsIn(cli)), hrefs: hrefsIn(cli) },
    "/language": { ids: new Set(idsIn(language)), hrefs: hrefsIn(language) },
  };
});

describe("docs pages", () => {
  it("link only to headings that exist, on the same page or another docs page", () => {
    const broken: string[] = [];
    for (const [path, page] of Object.entries(pages)) {
      for (const href of page.hrefs) {
        const [target, anchor] = href.startsWith("#") ? [path, href.slice(1)] : href.split("#");
        if (anchor === undefined || !(target! in pages)) continue;
        if (!pages[target!]!.ids.has(anchor)) broken.push(`${path}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("don't link to repository files, only to the markdown the site serves", () => {
    const served = new Set(DOC_PAGES.map((p) => `${p.path}.md`));
    for (const [path, page] of Object.entries(pages))
      expect(page.hrefs.filter((h) => /\.md($|#)/.test(h) && !served.has(h.split("#")[0]!)), path).toEqual([]);
  });

  it("leave the development sections out", () => {
    expect(readDoc("mcp")).not.toContain("## Development");
    expect(readDoc("cli")).not.toContain("## Development");
  });

  it("put the generated tool reference where docs/mcp.md marks it", () => {
    expect(mcp.intro).toContain('id="tool-reference"');
    expect(mcp.reference.toolCount).toBe(mcp.reference.groups.flatMap((g) => g.tools).length);
    expect(mcp.toc.map((e) => e.text)).toContain("Tool reference");
  });
});

describe("heading ids", () => {
  it("are GitHub's, so links work in the repository too", () => {
    const slug = createSlugger();
    expect(slug("archer check")).toBe("archer-check");
    expect(slug("8. Validation")).toBe("8-validation");
    expect(slug(".mcp.json")).toBe("mcpjson");
    expect(slug("Claude (web and desktop)")).toBe("claude-web-and-desktop");
    expect(slug("get_project")).toBe("get_project");
    expect(slug("archer check")).toBe("archer-check-1");
  });

  it("come from the heading's text, not its markdown", () => {
    expect(renderDocs("### `archer push`").html).toContain('id="archer-push"');
  });
});

describe("links", () => {
  it("go from docs files to their pages, and from the public site to this deployment", () => {
    expect(siteHref("cli.md#archer-push")).toBe("/docs/cli#archer-push");
    expect(siteHref("mcp.md")).toBe("/docs/mcp");
    expect(siteHref("language-spec.md#8-validation")).toBe("/language#8-validation");
    expect(siteHref("https://archer.tombyrne.dev/language/examples")).toBe("/language/examples");
    expect(siteHref("https://archer.tombyrne.dev")).toBe("/");
    expect(siteHref("https://code.claude.com/docs/en/mcp")).toBe("https://code.claude.com/docs/en/mcp");
  });
});
