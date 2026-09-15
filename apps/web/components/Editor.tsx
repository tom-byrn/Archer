"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CommandPalette } from "./CommandPalette";
import { DetailPanel, connectionKey, type Selection } from "./DetailPanel";
import { Palette } from "./Palette";
import { Button, Chip, Icon, IconButton, Input, Kbd, Menu, cx } from "./ui";

/** Drop paths that sit inside another path in the same set (delete parent deletes them). */
const outermostOnly = (paths: string[]): string[] =>
  paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q + ".")));

/** Click-to-edit document title. Commits on blur / Enter, reverts on Escape. */
function TitleField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename document"
        className="h-7 max-w-[320px] truncate rounded-md px-2 text-base font-medium text-ink transition-colors hover:bg-surface-2"
      >
        {value}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        setEditing(false);
        const v = draft.trim();
        if (v !== "" && v !== value) onCommit(v);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-[260px] font-medium"
    />
  );
}

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);

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
  const selectedPath = liveSelection?.kind === "component" ? liveSelection.path : null;

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

  // Global shortcuts: undo/redo (except while typing), ⌘K, Escape to go up a level.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable ||
        !!el.closest?.(".cm-editor");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing) return;
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
  const warnings = derived.diagnostics.length - errors.length;

  const relayout = () =>
    mutate((d) => autoLayout({ ...parse(format(d)).doc, layout: [] }));

  const [toast, setToast] = useState<string | null>(null);
  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };
  const copy = (kind: "code" | "agent") => {
    const text =
      kind === "agent" ? compileForAgent(derived.doc) : format(derived.doc);
    void navigator.clipboard.writeText(text).then(() =>
      notify(kind === "agent" ? "Copied for agent" : "Copied .arch source"),
    );
  };

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
        <Link
          href="/"
          className="flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface-2"
          title="All documents"
        >
          <img src="/icon.svg" alt="" className="h-5 w-5 rounded-[5px]" />
          <span className="font-display text-[17px] leading-none">Archer</span>
        </Link>
        <span className="mx-1 h-4 w-px bg-line" />
        <TitleField
          value={derived.doc.title}
          onCommit={(title) => mutate((d) => ({ ...d, title }))}
        />
        <button
          type="button"
          onClick={() => {
            if (!codeOpen) toggleCode();
          }}
          title={
            derived.valid
              ? warnings > 0
                ? `Valid · ${warnings} warning${warnings === 1 ? "" : "s"}`
                : "Valid — every edit is compiled back to .arch"
              : "Show errors in the code pane"
          }
          className="ml-1 flex h-7 items-center rounded-md px-1 transition-colors hover:bg-surface-2"
        >
          {derived.valid ? (
            <span className={cx("flex items-center gap-1 text-xs", warnings > 0 ? "text-warn" : "text-accent")}>
              <Icon.CheckCircle className="h-3.5 w-3.5" />
              {warnings > 0 && <span className="font-medium">{warnings}</span>}
            </span>
          ) : (
            <Chip tone="danger">
              <Icon.Warning className="h-3 w-3" />
              {errors.length} error{errors.length === 1 ? "" : "s"}
            </Chip>
          )}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {toast ? (
            <span className="pr-2 text-xs text-accent">{toast}</span>
          ) : onPersist && saveState !== "idle" ? (
            <span className="pr-2 text-xs text-ink-3">
              {saveState === "saving" ? "Saving…" : "Saved"}
            </span>
          ) : null}
          <IconButton label="Undo (⌘Z)" onClick={undo} disabled={!canUndo}>
            <Icon.Undo />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo}>
            <Icon.Redo />
          </IconButton>
          <IconButton label="Auto-layout" onClick={relayout}>
            <Icon.Layout />
          </IconButton>
          <IconButton label="Add component (⌘K)" onClick={() => setPaletteOpen(true)}>
            <Icon.Plus />
          </IconButton>
          <span className="mx-1.5 h-4 w-px bg-line" />
          <IconButton label={codeOpen ? "Hide code" : "Show code"} onClick={toggleCode} active={codeOpen}>
            <Icon.Code />
          </IconButton>
          <Menu
            width={260}
            items={[
              {
                label: "Copy for agent",
                hint: derived.valid
                  ? "Layout stripped, language guide prepended"
                  : "Fix validation errors first",
                icon: <Icon.Sparkle />,
                disabled: !derived.valid,
                onSelect: () => copy("agent"),
              },
              {
                label: "Copy .arch source",
                hint: "Exactly what the code pane shows",
                icon: <Icon.Copy />,
                onSelect: () => copy("code"),
              },
              "separator",
              {
                label: "Download PNG",
                hint: "Current view, theme colors",
                icon: <Icon.Download />,
                onSelect: () => exportRef.current?.(),
              },
            ]}
            trigger={({ open, toggle }) => (
              <Button
                variant="primary"
                size="sm"
                onClick={toggle}
                aria-expanded={open}
                className="ml-1 pr-2"
              >
                Export
                <Icon.ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}
          />
          <a
            href="/language"
            target="_blank"
            rel="noreferrer"
            title="Language reference"
            className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink [&>svg]:h-4 [&>svg]:w-4"
          >
            <Icon.External />
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Palette onAdd={addFromPalette} library={library} />
        <CodePane
          source={source}
          onChange={setSource}
          diagnostics={derived.diagnostics}
          doc={derived.doc}
          open={codeOpen}
          onToggle={toggleCode}
          selectedPath={selectedPath}
          onSelectPath={(path) =>
            setSelection(path === null ? null : { kind: "component", path })
          }
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          {liveFocus.length > 0 && (
            <nav className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line bg-surface px-2 text-sm">
              <button
                type="button"
                onClick={() => setFocus([])}
                className="rounded-sm px-1.5 py-0.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {derived.doc.title}
              </button>
              {liveFocus.map((seg, i) => (
                <span key={i} className="flex items-center gap-0.5">
                  <Icon.ChevronRight className="h-3 w-3 text-ink-3" />
                  <button
                    type="button"
                    onClick={() => setFocus(liveFocus.slice(0, i + 1))}
                    className={cx(
                      "rounded-sm px-1.5 py-0.5 transition-colors hover:bg-surface-2",
                      i === liveFocus.length - 1 ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {seg}
                  </button>
                </span>
              ))}
              <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
                <Kbd>esc</Kbd> up a level
              </span>
            </nav>
          )}
          <div className="min-h-0 flex-1 bg-ground">
            <ArchCanvas
              key={liveFocus.join(".")}
              nodes={flow.nodes}
              edges={flow.edges}
              title={derived.doc.title}
              callbacks={callbacks}
              isDark={isDark}
              selectedPath={selectedPath}
              exportRef={exportRef}
            />
          </div>
        </main>
        <DetailPanel
          doc={derived.laidOut}
          selection={liveSelection}
          mutate={mutate}
          onSelect={setSelection}
          library={library}
        />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAdd={addFromPalette}
        library={library}
      />
    </div>
  );
}
