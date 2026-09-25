import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsNav } from "@/components/docs/DocsNav";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { readDoc, renderDocs } from "@/lib/docs";

export const metadata = {
  title: "CLI · Archer",
  alternates: { types: { "text/markdown": "/docs/cli.md" } },
};

export default function CliDocsPage() {
  const { html, toc } = renderDocs(readDoc("cli"));
  return (
    <SiteFrame>
      <DocsNav active="cli" />
      <DocsArticle toc={toc}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </DocsArticle>
    </SiteFrame>
  );
}
