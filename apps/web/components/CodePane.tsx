"use client";

import { useMemo, useRef } from "react";
import type { Diagnostic } from "@archer/lang";
import { highlightArcher } from "@/lib/highlight";

function DiagnosticRow({ d }: { d: Diagnostic }) {
  const isError = d.severity === "error";
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <span
        className={`mono mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
          isError ? "bg-red-100 text-red-700 dark:text-red-300 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        }`}
      >
        {d.code}
        {d.span ? ` · L${d.span.start.line}` : ""}
      </span>
      <span className="text-slate-600 dark:text-slate-400">{d.message}</span>
    </li>
  );
}

export function CodePane({
  source,
  onChange,
  diagnostics,
  open,
  onToggle,
}: {
  source: string;
  onChange: (text: string) => void;
  diagnostics: Diagnostic[];
  open: boolean;
  onToggle: () => void;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const html = useMemo(() => highlightArcher(source), [source]);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;

  if (!open) {
    return (
      <button
        onClick={onToggle}
        title="Show code"
        className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] pt-3 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span className="mono text-[13px] font-bold text-slate-500">{"</>"}</span>
        {errorCount > 0 && (
          <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700 dark:text-red-300">
            {errorCount}
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-widest text-slate-400"
          style={{ writingMode: "vertical-rl" }}
        >
          Code
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-[var(--code-bg)]">
      <div className="flex items-center border-b border-[var(--code-border)] px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Code
        </span>
        <span className="mono pl-2 text-[10px] text-slate-400 dark:text-slate-600">.arch</span>
        <button
          onClick={onToggle}
          title="Hide code"
          className="ml-auto rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ⟨
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden
          className="hl-pre mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <textarea
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (preRef.current) {
              preRef.current.scrollTop = el.scrollTop;
              preRef.current.scrollLeft = el.scrollLeft;
            }
          }}
          spellCheck={false}
          wrap="off"
          autoCapitalize="off"
          autoCorrect="off"
          className="hl-textarea mono"
        />
      </div>
      {diagnostics.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3 py-1.5">
          {diagnostics.map((d, i) => (
            <DiagnosticRow key={i} d={d} />
          ))}
        </ul>
      )}
    </div>
  );
}
