"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addComponent,
  addConnection,
  autoLayout,
  compileForAgent,
  componentPaths,
  findComponent,
  format,
  moveComponent,
  parse,
  removeComponent,
  removeConnection,
  reparentComponent,
} from "@archer/lang";
import Link from "next/link";
import { lookupType } from "@archer/catalog";
import { SAMPLE } from "@/lib/sample";
import { toFlow } from "@/lib/toFlow";
import { resolveDropTarget } from "@/lib/dropTarget";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import { useUserLibrary } from "@/lib/userLibrary";
import { useIsDark } from "@/lib/useIsDark";
import { ArchCanvas, type CanvasCallbacks } from "./ArchCanvas";
import { CodePane } from "./CodePane";
import { DetailPanel, connectionKey, type Selection } from "./DetailPanel";
import { Palette } from "./Palette";

/** Drop paths that sit inside another path in the same set (delete parent deletes them). */
const outermostOnly = (paths: string[]): string[] =>
  paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q + ".")));

export function Editor({
  initialSource = SAMPLE,
  onPersist,
}: {
  initialSource?: string;
  onPersist?: (source: string, title: string) => Promise<void> | void;
}) {
  const { source, setSource, mutate, undo, redo, canUndo, canRedo } =
    useArchDoc(initialSource);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const library = useUserLibrary();
  const isDark = useIsDark();
  const customTags = useMemo(
    () => new Set(library.items.map((t) => t.tag)),
    [library.items],
  );
  const resolveType = useCallback(
    (tag: string) => {
      const custom = library.items.find((t) => t.tag === tag);
      if (custom) return { color: custom.color, glyph: custom.glyph };
      const entry = lookupType(tag);
      return entry ? { color: entry.color, glyph: entry.glyph } : undefined;
    },
    [library.items],
  );
  const derived = useMemo(() => deriveDoc(source, customTags), [source, customTags]);
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [codeOpen, setCodeOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("archer.codeOpen") === "0") setCodeOpen(false);
    } catch {}
  }, []);
  const toggleCode = useCallback(() => {
    setCodeOpen((open) => {
      try {
        localStorage.setItem("archer.codeOpen", open ? "0" : "1");
      } catch {}
      return !open;
    });
  }, []);

  // A focus that stopped resolving (component deleted/renamed) falls back to root.
  const liveFocus = useMemo(
    () =>
      focus.length > 0 && !componentPaths(derived.doc).has(focus.join("."))
        ? []
        : focus,
    [focus, derived],
  );

  const flow = useMemo(
    () => toFlow(derived.laidOut, { focus: liveFocus, resolveType, isDark }),
    [derived, liveFocus, resolveType, isDark],
  );

  const callbacks: CanvasCallbacks = useMemo(
    () => ({
      onNodeDragEnd: (path, info) =>
        mutate((d) => {
          const segs = path.split(".");
          const target = resolveDropTarget(d, info.center, {
            base: liveFocus,
            exclude: segs,
            topLeft: info.topLeft,
            sizeGrid: info.sizeGrid,
          });
          const currentParent = segs.slice(0, -1).join(".");
          if (target.parent.join(".") === currentParent)
            return moveComponent(d, segs, target.at);
          return reparentComponent(d, segs, target.parent, target.at);
        }),
      onDrillIn: (path) => {
        const segs = path.split(".");
        const node = findComponent(derived.doc, segs);
        if (node && node.children.length > 0) {
          setFocus(segs);
          setSelection(null);
        }
      },
      onSelectNode: (path) => setSelection({ kind: "component", path }),
      onSelectEdge: (index) => {
        const conn = derived.doc.connections[index];
        setSelection(conn ? { kind: "connection", key: connectionKey(conn) } : null);
      },
      onClearSelection: () => setSelection(null),
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
          const target = resolveDropTarget(d, pos, { base: liveFocus });
          return addComponent(d, target.parent, { type: tag, at: target.at }).doc;
        }),
    }),
    [mutate, derived, liveFocus],
  );

  // Drop a selection that no longer resolves (component deleted, connection edited away).
  const liveSelection: Selection = useMemo(() => {
    if (selection === null) return null;
    if (selection.kind === "component") {
      return componentPaths(derived.doc).has(selection.path) ? selection : null;
    }
    return derived.doc.connections.some((c) => connectionKey(c) === selection.key)
      ? selection
      : null;
  }, [selection, derived]);

  const addFromPalette = useCallback(
    (tag: string | undefined) =>
      mutate((d) => addComponent(d, liveFocus, { type: tag }).doc),
    [mutate, liveFocus],
  );

  // Debounced autosave of the source text.
  const titleForSave = derived.doc.title;
  useEffect(() => {
    if (!onPersist || source === initialSource) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      void Promise.resolve(onPersist(source, titleForSave)).then(() =>
        setSaveState("saved"),
      );
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, onPersist]);

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
      if (e.key === "Escape") setFocus((f) => f.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const errors = derived.diagnostics.filter((d) => d.severity === "error");

  const relayout = () =>
    mutate((d) => autoLayout({ ...parse(format(d)).doc, layout: [] }));

  const [copied, setCopied] = useState<"code" | "agent" | null>(null);
  const copy = (kind: "code" | "agent") => {
    const text =
      kind === "agent" ? compileForAgent(derived.doc) : format(derived.doc);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-4 py-2.5">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-bold tracking-tight hover:opacity-80"
        >
          <img src="/icon.svg" alt="" className="h-5 w-5 rounded-md" />
          Archer
        </Link>
        <span className="truncate text-sm text-slate-500">{derived.doc.title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            derived.valid
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:text-red-300 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {derived.valid
            ? "valid"
            : `${errors.length} error${errors.length === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {onPersist && (
            <span className="pr-1 text-[11px] text-slate-400">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : ""}
            </span>
          )}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40"
          >
            Redo
          </button>
          <button
            onClick={relayout}
            className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100"
          >
            Auto-layout
          </button>
          <span className="h-5 w-px bg-slate-200" />
          <button
            onClick={() => copy("code")}
            className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {copied === "code" ? "Copied!" : "Copy code"}
          </button>
          <button
            onClick={() => copy("agent")}
            disabled={!derived.valid}
            title={
              derived.valid
                ? "Copy the architecture as an agent-ready spec (layout stripped, guide prepended)"
                : "Fix validation errors before exporting for an agent"
            }
            style={{ backgroundColor: "var(--accent)" }}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40"
          >
            {copied === "agent" ? "Copied!" : "Copy for agent"}
          </button>
          <a
            href="/language"
            target="_blank"
            className="pl-1 text-xs font-medium text-slate-400 hover:text-[#0d9373]"
          >
            Docs ↗
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Palette onAdd={addFromPalette} library={library} />
        <CodePane
          source={source}
          onChange={setSource}
          diagnostics={derived.diagnostics}
          open={codeOpen}
          onToggle={toggleCode}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {liveFocus.length > 0 && (
            <nav className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151c] px-3 py-1.5 text-[12px]">
              <button
                onClick={() => setFocus([])}
                className="rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {derived.doc.title}
              </button>
              {liveFocus.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-slate-300">/</span>
                  <button
                    onClick={() => setFocus(liveFocus.slice(0, i + 1))}
                    className={`rounded px-1.5 py-0.5 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      i === liveFocus.length - 1 ? "text-slate-800 dark:text-slate-200" : "text-slate-500"
                    }`}
                  >
                    {seg}
                  </button>
                </span>
              ))}
              <span className="ml-auto text-[11px] text-slate-400">
                esc to go up · double-click a container to drill in
              </span>
            </nav>
          )}
          <div className="min-h-0 flex-1">
            <ArchCanvas
              key={liveFocus.join(".")}
              nodes={flow.nodes}
              edges={flow.edges}
              title={derived.doc.title}
              callbacks={callbacks}
              isDark={isDark}
            />
          </div>
        </main>
        <DetailPanel
          doc={derived.laidOut}
          selection={liveSelection}
          mutate={mutate}
          onSelect={setSelection}
        />
      </div>
    </div>
  );
}
