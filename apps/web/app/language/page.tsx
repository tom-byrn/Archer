import Link from "next/link";
import { marked } from "marked";
import { LANGUAGE_SPEC } from "@/lib/languageSpec";

export const metadata = { title: "Archlang — Language Reference" };

export default function LanguagePage() {
  const html = marked.parse(LANGUAGE_SPEC, { async: false });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="pb-6 text-sm">
        <Link href="/" className="font-bold tracking-tight hover:text-slate-600">
          Archlang
        </Link>
        <span className="px-2 text-slate-300">/</span>
        <span className="text-slate-500">Language reference</span>
      </nav>
      <article
        className="spec prose-slate"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
