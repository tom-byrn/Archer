import { marked } from "marked";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archer" };

export default function LanguagePage() {
  const html = marked.parse(LANGUAGE_SPEC, { async: false });
  return (
    <SiteFrame>
      <div className="landing-joints border-b border-line px-5 py-5 sm:px-10">
        <span className="mono text-sm text-ink-2">Docs / Language reference</span>
      </div>
      <div className="px-5 py-12 sm:px-10 sm:py-16">
        <article className="spec max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </SiteFrame>
  );
}
