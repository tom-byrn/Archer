import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsNav } from "@/components/docs/DocsNav";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { renderDocs } from "@/lib/docs";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archer" };

export default function LanguagePage() {
  const { html, toc } = renderDocs(LANGUAGE_SPEC);
  return (
    <SiteFrame>
      <DocsNav active="reference" />
      <DocsArticle toc={toc}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </DocsArticle>
    </SiteFrame>
  );
}
