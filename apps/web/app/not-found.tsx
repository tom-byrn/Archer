import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { NotFound } from "@/components/NotFound";
import { Chip } from "@/components/ui";
import { highlightArch, type HighlightToken } from "@/lib/highlightArch";
import { NOT_FOUND_SOURCE, notFoundProblems, type NotFoundProblem } from "@/lib/notFound";

export const metadata: Metadata = { title: "Page not found · Archer" };

/**
 * One line of highlighted source. On a line with a problem, the first
 * whole-word `missing` in the plain (untokenized) text gets the editor's
 * error squiggle.
 */
function Line({ tokens, missing }: { tokens: HighlightToken[]; missing?: string }) {
  const word = missing ? new RegExp(`\\b${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : null;
  let marked = false;
  return tokens.map((t, i): ReactNode => {
    if (t.className) {
      return (
        <span key={i} className={t.className}>
          {t.text}
        </span>
      );
    }
    const at = word && !marked ? t.text.search(word) : -1;
    if (at < 0) return <Fragment key={i}>{t.text}</Fragment>;
    marked = true;
    return (
      <Fragment key={i}>
        {t.text.slice(0, at)}
        <span className="underline decoration-danger decoration-wavy underline-offset-[3px]">
          {missing}
        </span>
        {t.text.slice(at + missing!.length)}
      </Fragment>
    );
  });
}

/**
 * The request as a document, highlighted by the editor's tokenizer, with the
 * validator's problems listed under it the way the code pane lists them.
 */
function RequestDocument() {
  const lines = highlightArch(NOT_FOUND_SOURCE);
  const problems = notFoundProblems();
  const byLine = new Map<number, NotFoundProblem>(
    problems.flatMap((p) => (p.diagnostic.span ? [[p.diagnostic.span.start.line, p]] : [])),
  );

  return (
    <figure className="overflow-hidden border border-line-2 bg-[var(--code-bg)] shadow-md">
      <div className="flex h-10 items-center gap-2 border-b border-line bg-surface pl-4 pr-3">
        <span className="mono text-xs text-ink-3">request.arch</span>
        <Chip tone="danger" className="ml-auto">
          {problems.length} error{problems.length === 1 ? "" : "s"}
        </Chip>
      </div>
      <pre className="mono overflow-x-auto py-3 text-sm leading-[20px] text-[var(--code-fg)]">
        <code>
          {lines.map((tokens, i) => {
            const problem = byLine.get(i + 1);
            return (
              <span
                key={i}
                className={`grid grid-cols-[3ch_minmax(0,1fr)] gap-3 pl-3 pr-4 ${problem ? "bg-danger-soft" : ""}`}
              >
                <span className="select-none text-right text-[var(--code-gutter)]" aria-hidden>
                  {i + 1}
                </span>
                <span className="whitespace-pre">
                  <Line tokens={tokens} missing={problem?.missing} />
                </span>
              </span>
            );
          })}
        </code>
      </pre>
      <figcaption>
        <ul className="border-t border-line bg-surface py-1">
          {problems.map(({ diagnostic: d }, i) => (
            <li key={i} className="flex min-h-[26px] items-center gap-2 px-3 py-1">
              <Chip tone="danger" className="mono shrink-0">
                {d.code}
              </Chip>
              <span className="min-w-0 flex-1 text-sm text-ink-2">{d.message}</span>
              {d.span && <span className="mono shrink-0 text-xs text-ink-3">L{d.span.start.line}</span>}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export default function NotFoundPage() {
  return (
    <NotFound>
      <RequestDocument />
    </NotFound>
  );
}
