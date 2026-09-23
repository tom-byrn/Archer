"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addComponent,
  addConnection,
  autoLayout,
  compileForAgent,
  componentPaths,
  diffDocs,
  findComponent,
  format,
  mergeForDiff,
  moveComponent,
  parse,
  removeComponent,
  removeConnection,
  reparentComponent,
  type ArchDoc,
} from "@archer/lang";
import Link from "next/link";
import { lookupType } from "@archer/catalog";
import { ACME_SAAS } from "@/lib/samples/acme-saas";
import { toFlow } from "@/lib/toFlow";
import { resolveDropTarget } from "@/lib/dropTarget";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import { useUserLibrary } from "@/lib/userLibrary";
import { useIsDark } from "@/lib/useIsDark";
import type { Id } from "@/convex/_generated/dataModel";
import { authorLabel, useDocumentActivity } from "@/lib/activity";
import type { NodeMarks } from "@/lib/toFlow";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { RepoLink } from "@/lib/github";
import { AccountMenu } from "./AccountMenu";
import { RepoDialog } from "./RepoDialog";
import { ShareDialog } from "./ShareDialog";
import { ActivityPanel, type ActivityTab } from "./ActivityPanel";
import { ArchCanvas, type CanvasCallbacks } from "./ArchCanvas";
import { CodePane } from "./CodePane";
import { CommandPalette } from "./CommandPalette";
import { DetailPanel, connectionKey, type Selection } from "./DetailPanel";
import { Palette } from "./Palette";
import { Button, Chip, Icon, IconButton, Input, Kbd, Menu, cx, relativeTime, type MenuItem } from "./ui";

/** What the canvas is comparing against, when in diff mode. */
type DiffView =
  | { kind: "revision"; id: Id<"revisions"> }
  /** Everything agents changed since the user last reviewed. */
  | { kind: "sinceSeen" }
  | null;

const EMPTY_DOC = (like: ArchDoc): ArchDoc => ({
  ...like,
  components: [],
  connections: [],
  layout: [],
});

/** Return a component tree with `src` set on the node at `path`. */
function setSrc(
  items: ArchDoc["components"],
  path: readonly string[],
  src: string,
): ArchDoc["components"] {
  const [head, ...rest] = path;
  return items.map((c) =>
    c.id !== head
      ? c
      : rest.length === 0
        ? { ...c, src }
        : { ...c, children: setSrc(c.children, rest, src) },
  );
}

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
        className="h-7 max-w-[38vw] truncate rounded-md px-2 text-base font-medium text-ink transition-colors hover:bg-surface-2 md:max-w-[320px]"
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
      className="w-[38vw] font-medium md:w-[260px]"
    />
  );
}

export function Editor({
  initialSource = ACME_SAAS,
  onPersist,
  documentId = null,
  workspaceId = null,
  seenRevisionAt,
  publicSlug = null,
  repo = null,
}: {
  initialSource?: string;
  onPersist?: (source: string, title: string) => Promise<void> | void;
  /** Persisted documents get history and drift; unset = scratch editor. */
  documentId?: Id<"documents"> | null;
  workspaceId?: string | null;
  seenRevisionAt?: number;
  /** Share slug when "anyone with the link" is on. */
  publicSlug?: string | null;
  /** Linked GitHub repository (commit timeline, src deep links). */
  repo?: RepoLink | null;
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
  const [codeOpen, setCodeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const activity = useDocumentActivity(documentId, workspaceId, seenRevisionAt);
  const [panel, setPanel] = useState<ActivityTab | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const setRepo = useMutation(api.documents.setRepo);
  const [diffView, setDiffView] = useState<DiffView>(null);

  const toggleCode = useCallback(() => setCodeOpen((open) => !open), []);

  // A focus that stopped resolving (component deleted/renamed) falls back to root.
  const liveFocus = useMemo(
    () =>
      focus.length > 0 && !componentPaths(derived.doc).has(focus.join("."))
        ? []
        : focus,
    [focus, derived],
  );

  // Diff mode: the doc to draw plus per-path/per-connection statuses.
  const diff = useMemo(() => {
    if (!diffView) return null;
    let base: ArchDoc | null = null;
    let next: ArchDoc | null = null;
    if (diffView.kind === "revision") {
      const i = activity.revisions.findIndex((r) => r._id === diffView.id);
      const rev = activity.revisions[i];
      if (!rev) return null;
      next = parse(rev.source).doc;
      const older = activity.revisions[i + 1];
      base = older ? parse(older.source).doc : EMPTY_DOC(next);
    } else {
      if (!activity.baseline) return null;
      base = parse(activity.baseline.source).doc;
      next = derived.doc;
    }
    const merged = mergeForDiff(base, next);
    return {
      doc: autoLayout(merged.doc),
      components: merged.components,
      connections: merged.connections,
      summary: diffDocs(base, next),
    };
  }, [diffView, activity.revisions, activity.baseline, derived.doc]);

  // Agent edits since the user last reviewed → "touched" badges.
  const touched = useMemo(() => {
    if (activity.unseenAgentRevisions.length === 0 || !activity.baseline) return new Set<string>();
    const d = diffDocs(parse(activity.baseline.source).doc, derived.doc);
    return new Set(d.components.filter((c) => c.kind !== "removed").map((c) => c.path));
  }, [activity.unseenAgentRevisions.length, activity.baseline, derived.doc]);

  const marks = useCallback(
    (path: string, c: { src?: string }): NodeMarks | undefined => {
      const m: NodeMarks = {};
      const d = diff?.components.get(path);
      if (d) m.diff = d;
      if (!diff && touched.has(path)) m.touched = true;
      const f = activity.driftByPath.get(path);
      if (f && (f.status === "missing" || f.status === "changed")) m.drift = f.status;
      if (c.src) m.src = c.src;
      return Object.keys(m).length > 0 ? m : undefined;
    },
    [diff, touched, activity.driftByPath],
  );

  const displayDoc = diff ? diff.doc : derived.laidOut;
  const flow = useMemo(
    () =>
      toFlow(displayDoc, {
        focus: liveFocus,
        resolveType,
        isDark,
        marks,
        edgeDiff: diff ? diff.connections : undefined,
      }),
    [displayDoc, liveFocus, resolveType, isDark, marks, diff],
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

  // The last text known to be stored. Remote saves (an agent over MCP) arrive
  // as a new `initialSource`; adopt them so the canvas and banners stay live.
  const persisted = useRef(initialSource);
  useEffect(() => {
    if (initialSource === persisted.current) return;
    persisted.current = initialSource;
    setSource(initialSource);
  }, [initialSource, setSource]);

  // Debounced autosave of the source text.
  const titleForSave = derived.doc.title;
  useEffect(() => {
    if (!onPersist || source === persisted.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      const text = source;
      void Promise.resolve(onPersist(text, titleForSave)).then(() => {
        persisted.current = text;
        setSaveState("saved");
      });
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
      if (e.key === "Escape") {
        setDiffView((v) => {
          if (v) return null;
          setFocus((f) => f.slice(0, -1));
          return v;
        });
      }
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

  const restore = (text: string) => {
    mutate(() => parse(text).doc);
    setDiffView(null);
  };
  const addFromDrift = (name: string, src?: string) =>
    mutate((d) => {
      const { doc: next, path } = addComponent(d, liveFocus, { name });
      return src
        ? { ...next, components: setSrc(next.components, path, src) }
        : next;
    });
  const openPanel = (tab: ActivityTab) => {
    setPanel(tab);
    setSelection(null);
  };
  const exportItems: (MenuItem | "separator")[] = [
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
  ];
  const unseen = activity.unseenAgentRevisions;
  const latestAgent = unseen[0];
  const viewingRevisionId = diffView?.kind === "revision" ? diffView.id : null;

  return (
    <div className="flex h-dvh flex-col overscroll-none bg-bg">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
        <Link
          href="/"
          className="flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface-2"
          title="All documents"
        >
          <Icon.ChevronLeft className="h-4 w-4 text-ink-2 md:hidden" />
          <span className="hidden font-display text-[17px] leading-none md:inline">Archer</span>
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-line md:block" />
        <TitleField
          value={derived.doc.title}
          onCommit={(title) => mutate((d) => ({ ...d, title }))}
        />
        <IconButton
          label={
            derived.valid
              ? warnings > 0
                ? `Code · ${warnings} warning${warnings === 1 ? "" : "s"}`
                : "Code (.arch)"
              : `Code · ${errors.length} error${errors.length === 1 ? "" : "s"}`
          }
          onClick={toggleCode}
          active={codeOpen}
          className="relative ml-1"
        >
          <Icon.Code />
          {(!derived.valid || warnings > 0) && (
            <span
              className={cx(
                "absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-surface",
                derived.valid ? "bg-warn" : "bg-danger",
              )}
            />
          )}
        </IconButton>

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
          <span className="hidden md:contents">
            <IconButton label="Auto-layout" onClick={relayout}>
              <Icon.Layout />
            </IconButton>
          </span>
          <IconButton label="Add component (⌘K)" onClick={() => setPaletteOpen(true)}>
            <Icon.Plus />
          </IconButton>
          {documentId && (
            <IconButton
              label={`Activity · ${activity.revisions.length} revisions`}
              onClick={() => (panel ? setPanel(null) : openPanel("history"))}
              active={panel !== null}
              className="relative"
            >
              <Icon.History />
              {unseen.length > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
              )}
            </IconButton>
          )}
          <div className="hidden items-center gap-1.5 md:flex">
            <span className="mx-1.5 h-4 w-px bg-line" />
            {documentId && (
              <Button size="sm" icon={<Icon.Link />} onClick={() => setShareOpen(true)} className="ml-1">
                Share
              </Button>
            )}
            <Menu
              width={260}
              items={exportItems}
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
            {documentId && (
              <>
                <span className="mx-1 h-4 w-px bg-line" />
                <AccountMenu />
              </>
            )}
          </div>
          <div className="md:hidden">
            <Menu
              width={240}
              items={[
                { label: "Auto-layout", icon: <Icon.Layout />, onSelect: relayout },
                ...(documentId
                  ? [{ label: "Share", icon: <Icon.Link />, onSelect: () => setShareOpen(true) }]
                  : []),
                "separator",
                ...exportItems,
              ]}
              trigger={({ open, toggle }) => (
                <IconButton label="More" active={open} onClick={toggle} aria-expanded={open}>
                  <Icon.More />
                </IconButton>
              )}
            />
          </div>
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
          title={derived.doc.title}
          valid={derived.valid}
          onCopyCode={() => copy("code")}
          onCopyForAgent={() => copy("agent")}
          selectedPath={selectedPath}
          onSelectPath={(path) =>
            setSelection(path === null ? null : { kind: "component", path })
          }
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          {liveFocus.length > 0 && (
            <nav className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-line bg-surface px-2 text-sm">
              <button
                type="button"
                onClick={() => setFocus([])}
                className="shrink-0 rounded-sm px-1.5 py-0.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {derived.doc.title}
              </button>
              {liveFocus.map((seg, i) => (
                <span key={i} className="flex shrink-0 items-center gap-0.5">
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
              <span className="ml-auto hidden items-center gap-1.5 pl-2 text-xs text-ink-3 md:flex">
                <Kbd>esc</Kbd> up a level
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon.ChevronLeft />}
                className="ml-auto shrink-0 md:hidden"
                onClick={() => setFocus(liveFocus.slice(0, -1))}
              >
                Up
              </Button>
            </nav>
          )}
          <div className="relative min-h-0 flex-1 bg-ground">
            {diff ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-3 pr-1.5 shadow-md">
                  <Icon.Diff className="h-4 w-4 text-ink-2" />
                  <span className="text-sm text-ink md:whitespace-nowrap">
                    {diffView?.kind === "sinceSeen"
                      ? "Agent changes since you last reviewed"
                      : "Viewing a past revision"}
                  </span>
                  <span className="flex items-center gap-1">
                    {diff.summary.components.filter((c) => c.kind === "added").length > 0 && (
                      <Chip tone="accent">+{diff.summary.components.filter((c) => c.kind === "added").length}</Chip>
                    )}
                    {diff.summary.components.filter((c) => c.kind === "removed").length > 0 && (
                      <Chip tone="danger">−{diff.summary.components.filter((c) => c.kind === "removed").length}</Chip>
                    )}
                    {diff.summary.components.filter((c) => c.kind === "changed").length > 0 && (
                      <Chip tone="warn">~{diff.summary.components.filter((c) => c.kind === "changed").length}</Chip>
                    )}
                  </span>
                  <span className="mx-1 h-4 w-px bg-line" />
                  {diffView?.kind === "sinceSeen" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void activity.markSeen();
                        setDiffView(null);
                      }}
                    >
                      Mark reviewed
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDiffView(null)}>
                    Exit
                    <Kbd>esc</Kbd>
                  </Button>
                </div>
              </div>
            ) : latestAgent ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2 pr-1.5 shadow-md">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Icon.Bot className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-ink md:whitespace-nowrap">
                    <span className="font-medium">{authorLabel(latestAgent.author)}</span>
                    {" "}made {unseen.length} change{unseen.length === 1 ? "" : "s"}
                    <span className="text-ink-3"> · {relativeTime(latestAgent.createdAt)}</span>
                  </span>
                  <span className="mx-1 h-4 w-px bg-line" />
                  <Button size="sm" variant="secondary" onClick={() => setDiffView({ kind: "sinceSeen" })}>
                    Review
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void activity.markSeen()}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}
            <ArchCanvas
              key={liveFocus.join(".")}
              nodes={flow.nodes}
              edges={flow.edges}
              title={derived.doc.title}
              callbacks={callbacks}
              isDark={isDark}
              selectedPath={selectedPath}
              exportRef={exportRef}
              readOnly={diff !== null}
            />
          </div>
        </main>
        {panel && documentId && workspaceId ? (
          <ActivityPanel
            tab={panel}
            onTabChange={setPanel}
            onClose={() => setPanel(null)}
            activity={activity}
            documentId={documentId}
            title={derived.doc.title}
            viewingRevisionId={viewingRevisionId}
            onViewRevision={(id) => setDiffView(id ? { kind: "revision", id } : null)}
            onRestore={restore}
            onSelectPath={(path) => setSelection({ kind: "component", path })}
            onAddComponent={addFromDrift}
            repo={repo}
            onLinkRepo={() => setRepoOpen(true)}
          />
        ) : (
          <DetailPanel
            doc={derived.laidOut}
            selection={liveSelection}
            mutate={mutate}
            onSelect={setSelection}
            onDrillIn={callbacks.onDrillIn}
            library={library}
            repo={repo}
          />
        )}
      </div>

      {documentId && workspaceId && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          documentId={documentId}
          workspaceId={workspaceId}
          publicSlug={publicSlug}
        />
      )}
      {documentId && workspaceId && (
        <RepoDialog
          open={repoOpen}
          onClose={() => setRepoOpen(false)}
          current={repo}
          onSave={(next) => setRepo({ id: documentId, workspaceId, repo: next })}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAdd={addFromPalette}
        library={library}
      />
    </div>
  );
}
