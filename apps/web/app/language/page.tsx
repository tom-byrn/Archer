import Link from "next/link";
import { marked } from "marked";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archer — Archlang Language Reference" };

export default function LanguagePage() {
  const html = marked.parse(LANGUAGE_SPEC, { async: false });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="flex items-center pb-6 text-sm">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight hover:opacity-80">
          <img src="/icon.svg" alt="" className="h-5 w-5 rounded-md" />
          Archer
        </Link>
        <span className="px-2 text-slate-300">/</span>
        <span className="text-slate-500">Archlang language reference</span>
      </nav>
      <article
        className="spec prose-slate"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
