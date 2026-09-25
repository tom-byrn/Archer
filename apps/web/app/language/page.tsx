import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsNav } from "@/components/docs/DocsNav";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { readDoc, renderDocs } from "@/lib/docs";

export const metadata = {
  title: "Archer",
  alternates: { types: { "text/markdown": "/language.md" } },
};

export default function LanguagePage() {
  const { html, toc } = renderDocs(readDoc("language"));
  return (
    <SiteFrame>
      <DocsNav active="reference" />
      <DocsArticle toc={toc}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </DocsArticle>
    </SiteFrame>
  );
}
