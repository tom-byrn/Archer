"use client";

import { useEffect, useMemo, useState } from "react";
import {
  autoLayout,
  format,
  hasErrors,
  parse,
  validate,
  type Diagnostic,
} from "@archlang/lang";
import { knownConnectionTypes, knownTypes } from "@archlang/catalog";
import { SAMPLE } from "@/lib/sample";
import { toFlow } from "@/lib/toFlow";
import { ArchCanvas } from "./ArchCanvas";

const KNOWN_TYPES = knownTypes();
const KNOWN_CONNECTION_TYPES = knownConnectionTypes();

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function DiagnosticRow({ d }: { d: Diagnostic }) {
  const isError = d.severity === "error";
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <span
        className={`mono mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
          isError ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {d.code}
        {d.span ? ` · L${d.span.start.line}` : ""}
      </span>
      <span className="text-slate-600">{d.message}</span>
    </li>
  );
}

export function Editor() {
  const [source, setSource] = useState(SAMPLE);
  const debounced = useDebounced(source, 250);

  const { doc, diagnostics, flow } = useMemo(() => {
    const parsed = parse(debounced);
    const diagnostics = [
      ...parsed.diagnostics,
      ...validate(parsed.doc, {
        knownTypes: KNOWN_TYPES,
        knownConnectionTypes: KNOWN_CONNECTION_TYPES,
      }),
    ];
    const laidOut = autoLayout(parsed.doc);
    return { doc: parsed.doc, diagnostics, flow: toFlow(laidOut) };
  }, [debounced]);

  const errors = diagnostics.filter((d) => d.severity === "error");
  const valid = !hasErrors(diagnostics);

  const relayout = () => {
    const parsed = parse(source);
    setSource(format(autoLayout({ ...parsed.doc, layout: [] })));
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-[15px] font-bold tracking-tight">Archlang</span>
        <span className="truncate text-sm text-slate-500">{doc.title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            valid ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {valid ? "valid" : `${errors.length} error${errors.length === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={relayout}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Auto-layout
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="mono min-h-0 flex-1 resize-none p-3 text-[12px] leading-relaxed text-slate-800 outline-none"
          />
          {diagnostics.length > 0 && (
            <ul className="max-h-40 overflow-y-auto border-t border-slate-200 px-3 py-1.5">
              {diagnostics.map((d, i) => (
                <DiagnosticRow key={i} d={d} />
              ))}
            </ul>
          )}
        </div>
        <main className="min-w-0 flex-1">
          <ArchCanvas nodes={flow.nodes} edges={flow.edges} title={doc.title} />
        </main>
      </div>
    </div>
  );
}
