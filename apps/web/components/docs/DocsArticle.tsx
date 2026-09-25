import type { ReactNode } from "react";
import type { TocEntry } from "@/lib/docs";

/**
 * A docs page's body: the `.spec` article, and beside it on wide screens an
 * "On this page" list of its sections that stays in view while you scroll.
 */
export function DocsArticle({ toc, children }: { toc: TocEntry[]; children: ReactNode }) {
  return (
    <div className="flex items-start gap-12 px-5 py-12 sm:px-10 sm:py-16">
      <article className="spec min-w-0 max-w-3xl flex-1">{children}</article>
      {toc.length > 1 && (
        <nav aria-label="On this page" className="sticky top-8 hidden w-52 shrink-0 xl:block">
          <p className="eyebrow pb-3">On this page</p>
          <ul className="flex flex-col gap-2 border-l border-line">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className="-ml-px block border-l border-transparent pl-3 text-sm text-ink-2 transition-colors duration-100 hover:border-ink-3 hover:text-ink"
                >
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
