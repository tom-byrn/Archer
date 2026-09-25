import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsNav } from "@/components/docs/DocsNav";
import { ToolReference } from "@/components/docs/ToolReference";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { loadMcpDocs } from "@/lib/mcpDocs";

export const metadata = {
  title: "MCP server · Archer",
  alternates: { types: { "text/markdown": "/docs/mcp.md" } },
};

export default async function McpDocsPage() {
  const { intro, reference, outro, toc } = await loadMcpDocs();
  return (
    <SiteFrame>
      <DocsNav active="mcp" />
      <DocsArticle toc={toc}>
        <div dangerouslySetInnerHTML={{ __html: intro }} />
        <ToolReference reference={reference} />
        <div dangerouslySetInnerHTML={{ __html: outro }} />
      </DocsArticle>
    </SiteFrame>
  );
}
