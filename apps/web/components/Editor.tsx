"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  addComponent,
  addConnection,
  autoLayout,
  format,
  moveComponent,
  parse,
  removeComponent,
  removeConnection,
  type Diagnostic,
} from "@archlang/lang";
import { SAMPLE } from "@/lib/sample";
import { toFlow } from "@/lib/toFlow";
import { resolveDropTarget } from "@/lib/dropTarget";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import { ArchCanvas, type CanvasCallbacks } from "./ArchCanvas";
import { Palette } from "./Palette";

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

/** Drop paths that sit inside another path in the same set (delete parent deletes them). */
const outermostOnly = (paths: string[]): string[] =>
  paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q + ".")));

export function Editor() {
  const { source, setSource, mutate, undo, redo, canUndo, canRedo } =
    useArchDoc(SAMPLE);
  const derived = useMemo(() => deriveDoc(source), [source]);
  const flow = useMemo(() => toFlow(derived.laidOut), [derived]);

  const callbacks: CanvasCallbacks = useMemo(
    () => ({
      onMove: (path, at) => mutate((d) => moveComponent(d, path.split("."), at)),
      onConnect: (s, t) => mutate((d) => addConnection(d, s.split("."), t.split("."))),
      onDeleteNodes: (paths) =>
        mutate((d) =>
          outermostOnly(paths).reduce((acc, p) => removeComponent(acc, p.split(".")), d),
        ),
      onDeleteEdges: (indices) =>
        mutate((d) =>
          [...indices].sort((a, b) => b - a).reduce((acc, i) => removeConnection(acc, i), d),
        ),
      onDropType: (tag, pos) =>
        mutate((d) => {
          const target = resolveDropTarget(d, pos);
          return addComponent(d, target.parent, { type: tag, at: target.at }).doc;
        }),
    }),
    [mutate],
  );

  const addFromPalette = useCallback(
    (tag: string | undefined) =>
      mutate((d) => addComponent(d, [], { type: tag }).doc),
    [mutate],
  );

  // Global undo/redo, except while typing in a text field (native undo there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const errors = derived.diagnostics.filter((d) => d.severity === "error");

  const relayout = () =>
    mutate((d) => autoLayout({ ...parse(format(d)).doc, layout: [] }));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-[15px] font-bold tracking-tight">Archlang</span>
        <span className="truncate text-sm text-slate-500">{derived.doc.title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            derived.valid
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {derived.valid
            ? "valid"
            : `${errors.length} error${errors.length === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Redo
          </button>
          <button
            onClick={relayout}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Auto-layout
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Palette onAdd={addFromPalette} />
        <div className="flex w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="mono min-h-0 flex-1 resize-none p-3 text-[12px] leading-relaxed text-slate-800 outline-none"
          />
          {derived.diagnostics.length > 0 && (
            <ul className="max-h-40 overflow-y-auto border-t border-slate-200 px-3 py-1.5">
              {derived.diagnostics.map((d, i) => (
                <DiagnosticRow key={i} d={d} />
              ))}
            </ul>
          )}
        </div>
        <main className="min-w-0 flex-1">
          <ArchCanvas
            nodes={flow.nodes}
            edges={flow.edges}
            title={derived.doc.title}
            callbacks={callbacks}
          />
        </main>
      </div>
    </div>
  );
}
