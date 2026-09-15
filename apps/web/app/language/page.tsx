import Link from "next/link";
import { marked } from "marked";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archer — Language reference" };

export default function LanguagePage() {
  const html = marked.parse(LANGUAGE_SPEC, { async: false });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="flex items-center gap-2 pb-8 text-sm">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md py-1 pr-2 transition-opacity hover:opacity-80"
        >
          <img src="/icon.svg" alt="" className="h-5 w-5 rounded-[5px]" />
          <span className="font-display text-[17px] leading-none">Archer</span>
        </Link>
        <span className="text-ink-3">/</span>
        <span className="text-ink-2">Language reference</span>
      </nav>
      <article className="spec" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
