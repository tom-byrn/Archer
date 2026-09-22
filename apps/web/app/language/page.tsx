import { marked } from "marked";
import { DocsNav } from "@/components/docs/DocsNav";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archer" };

export default function LanguagePage() {
  const html = marked.parse(LANGUAGE_SPEC, { async: false });
  return (
    <SiteFrame>
      <DocsNav active="reference" />
      <div className="px-5 py-12 sm:px-10 sm:py-16">
        <article className="spec max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </SiteFrame>
  );
}
