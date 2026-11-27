"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkFiles,
  dirOf,
  expandFiles,
  fileOf,
  format,
  mountsOf,
  parse,
  splitFiles,
  type ArchDoc,
  type Diagnostic,
  type ValidateOptions,
} from "@archer/lang";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, EditorSelection } from "@codemirror/state";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { CodeDialog } from "./CodeDialog";
import { CodeEditor } from "./CodeMirror";
import { Button, Chip, Icon, SwapIcon, cx } from "./ui";
import {
  archLanguage,
  archerLinter,
  itemAtPath,
  itemPathAtOffset,
} from "@/lib/archLanguage";

/* ------------------------------------------------- selected-item highlight */

const setSelectedLines = StateEffect.define<{ from: number; to: number } | null>();

const selectedLineDeco = Decoration.line({ class: "cm-archSelected" });

const selectedLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setSelectedLines)) continue;
      if (e.value === null) {
        next = Decoration.none;
        continue;
      }
      const { from, to } = e.value;
      const doc = tr.state.doc;
      const first = doc.lineAt(Math.min(from, doc.length)).number;
      const last = doc.lineAt(Math.min(to, doc.length)).number;
      const marks = [];
      for (let n = first; n <= last; n++) {
        marks.push(selectedLineDeco.range(doc.line(n).from));
      }
      next = Decoration.set(marks);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const selectedLinesTheme = EditorView.baseTheme({
  ".cm-archSelected": { backgroundColor: "var(--accent-soft)" },
});

/* ------------------------------------------------------------- component */

export interface CodePaneProps {
  source: string;
  onChange: (text: string) => void;
  diagnostics: Diagnostic[];
  doc: ArchDoc;
  open: boolean;
  onToggle: () => void;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  /** Document title, shown in the modal's top bar. */
  title: string;
  /** Agent export is only offered for valid documents. */
  valid: boolean;
  /** Copy buttons; each is left out when its handler is (no export). */
  onCopyCode?: () => void;
  onCopyForAgent?: () => void;
  /**
   * The document's root file (spec §2.2): its repository path, or a name for
   * a document kept in Archer. When components keep their insides in other
   * files (`use`, `import`), the code view has a tab per file.
   */
  rootFile: string;
  /** The file to show; null: the root, or the file the selection is in. */
  file: string | null;
  onFileChange: (file: string | null) => void;
  /** What files are checked with (the editor's types). */
  validateOptions: ValidateOptions;
  /** The code shows but can't be typed in (the editor in view mode). */
  readOnly?: boolean;
}

/** A file's name and the folder it's in, for its tab. */
const fileLabel = (file: string) => ({ name: file.slice(file.lastIndexOf("/") + 1), dir: dirOf(file) });

/** A new file `use` names before it exists: an empty document titled after it. */
const blankFile = (file: string) => {
  const name = fileLabel(file).name.replace(/\.arch$/, "").replace(/[-_]+/g, " ");
  return `arch "${name.charAt(0).toUpperCase()}${name.slice(1)}" v0.2\n`;
};

export function CodePane({
  source,
  onChange,
  diagnostics,
  doc,
  open,
  onToggle,
  title,
  valid,
  onCopyCode,
  onCopyForAgent,
  selectedPath,
  onSelectPath,
  rootFile,
  file: fileProp,
  onFileChange,
  validateOptions,
  readOnly = false,
}: CodePaneProps) {
  const viewRef = useRef<EditorView | null>(null);

  /* ---------------------------------------------------- several files */
  // With components kept in other files, each tab shows one file's own text
  // (splitFiles). Typing edits a draft of that file; whenever every file
  // still parses, the document is put back together (expandFiles) and saved,
  // while the tab keeps showing what was typed.
  const mounts = useMemo(() => mountsOf(doc, rootFile), [doc, rootFile]);
  const split = useMemo(
    () => (mounts.length > 0 ? splitFiles(doc, rootFile, { layout: true }) : null),
    [doc, rootFile, mounts],
  );
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map());
  const emitted = useRef<string | null>(null);
  // A change from anywhere else (the canvas, undo) replaces the drafts.
  useEffect(() => {
    if (source !== emitted.current) setDrafts(new Map());
  }, [source]);
  const files = useMemo(() => {
    const list = split ? [...split.keys()] : [rootFile];
    for (const f of drafts.keys()) if (!list.includes(f)) list.push(f);
    return list;
  }, [split, drafts, rootFile]);
  const file = fileProp !== null && files.includes(fileProp) ? fileProp : rootFile;
  const textOf = useCallback(
    (f: string): string | undefined => drafts.get(f) ?? split?.get(f) ?? (f === rootFile ? source : undefined),
    [drafts, split, rootFile, source],
  );
  const tabbed = split !== null || drafts.size > 1;
  const shown = tabbed ? (textOf(file) ?? "") : source;
  /** The tab's own document, for selection: where the file's paths start. */
  const tabDoc = useMemo(() => (tabbed ? parse(shown).doc : doc), [tabbed, shown, doc]);
  const prefix = useMemo(() => {
    if (!tabbed || file === rootFile) return [];
    return mountsOf(doc, rootFile).find((m) => m.file === file)?.path ?? [];
  }, [tabbed, file, rootFile, doc]);
  const checked = useMemo(
    () => (tabbed ? checkFiles(rootFile, (f) => textOf(f) ?? blankFile(f), validateOptions).diagnostics : null),
    [tabbed, rootFile, textOf, validateOptions],
  );
  const shownDiagnostics = checked ? checked.filter((d) => d.file === file) : diagnostics;

  const edit = (text: string) => {
    if (!tabbed) {
      onChange(text);
      return;
    }
    const next = new Map(drafts).set(file, text);
    setDrafts(next);
    const read = (f: string) => next.get(f) ?? split?.get(f) ?? blankFile(f);
    const whole = expandFiles(rootFile, read);
    if (whole.diagnostics.some((d) => d.severity === "error")) return; // a file doesn't parse yet: keep typing
    // A `use` that names a new file opens it, empty, as a tab of its own.
    for (const f of whole.files) if (!next.has(f) && !split?.has(f)) next.set(f, read(f));
    setDrafts(new Map(next));
    const text2 = format(whole.doc);
    emitted.current = text2;
    onChange(text2);
  };
  const toPath = (rel: string | null) => (rel === null ? null : [...prefix, ...rel.split(".")].join("."));
  const fromPath = (path: string) => {
    const p = path.split(".");
    return p.slice(0, prefix.length).join(".") === prefix.join(".") ? p.slice(prefix.length).join(".") : null;
  };
  // The canvas selects something kept in another file: show that file.
  useEffect(() => {
    if (!open || !split || selectedPath === null) return;
    const where = fileOf(doc, rootFile, selectedPath.split("."));
    if (where !== file) onFileChange(where);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, open]);
  const lastEmittedPath = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const selectedPathRef = useRef(selectedPath);
  selectedPathRef.current = selectedPath;
  const onSelectPathRef = useRef(onSelectPath);
  onSelectPathRef.current = onSelectPath;

  const extensions = useMemo(
    () => [archLanguage(), lintGutter(), selectedLinesField, selectedLinesTheme],
    [],
  );

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.length - errorCount;
  const tabDocRef = useRef(tabDoc);
  tabDocRef.current = tabDoc;
  const toPathRef = useRef(toPath);
  toPathRef.current = toPath;

  // Diagnostics come from props, not a linter source.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !open) return;
    view.dispatch(setDiagnostics(view.state, archerLinter(shownDiagnostics, view.state.doc)));
  }, [shownDiagnostics, open, file]);

  // Canvas → code: highlight the selected component's or plane's lines and
  // scroll to it, unless this selection originated from the editor's own cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !open) return;
    if (selectedPath === null) {
      lastEmittedPath.current = null;
      view.dispatch({ effects: setSelectedLines.of(null) });
      return;
    }
    const rel = tabbed ? fromPath(selectedPath) : selectedPath;
    const node = rel === null || rel === "" ? undefined : itemAtPath(tabDoc, rel);
    if (!node) {
      view.dispatch({ effects: setSelectedLines.of(null) });
      return;
    }
    const from = Math.min(node.span.start.offset, view.state.doc.length);
    const to = Math.min(node.span.end.offset, view.state.doc.length);
    const fromEditor = lastEmittedPath.current === selectedPath;
    view.dispatch({
      effects: [
        setSelectedLines.of({ from, to }),
        ...(fromEditor ? [] : [EditorView.scrollIntoView(from, { y: "center" })]),
      ],
    });
    if (!fromEditor) lastEmittedPath.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, tabDoc, open]);

  const diagnosticsRef = useRef(shownDiagnostics);
  diagnosticsRef.current = shownDiagnostics;

  const onViewReady = useCallback((view: EditorView) => {
    viewRef.current = view;
    view.dispatch(setDiagnostics(view.state, archerLinter(diagnosticsRef.current, view.state.doc)));
  }, []);

  // Code → canvas: cursor moved by the user into a component or plane.
  // Registered as an extension so we see the real ViewUpdate (user-event flags).
  const selectionListener = useMemo(
    () =>
      EditorView.updateListener.of((u) => {
        if (!u.selectionSet) return;
        const userDriven = u.transactions.some(
          (tr) => tr.isUserEvent("select") || tr.isUserEvent("input") || tr.isUserEvent("delete"),
        );
        if (!userDriven) return;
        const offset = u.state.selection.main.head;
        const path = toPathRef.current(itemPathAtOffset(tabDocRef.current, offset));
        if (path === null || path === selectedPathRef.current) return;
        lastEmittedPath.current = path;
        onSelectPathRef.current(path);
      }),
    [],
  );

  const allExtensions = useMemo(
    () => [extensions, selectionListener],
    [extensions, selectionListener],
  );

  const jumpTo = (d: Diagnostic) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = Math.min(d.span?.start.offset ?? 0, view.state.doc.length);
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
  };

  const [copied, setCopied] = useState<"code" | "agent" | null>(null);
  const flash = (kind: "code" | "agent", run: () => void) => {
    run();
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <CodeDialog
      open={open}
      onClose={onToggle}
      title={title}
      status={
        <>
          {errorCount > 0 && (
            <Chip tone="danger">
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </Chip>
          )}
          {warnCount > 0 && (
            <Chip tone="warn">
              {warnCount} warning{warnCount === 1 ? "" : "s"}
            </Chip>
          )}
        </>
      }
      actions={
        (onCopyCode || onCopyForAgent) && (
          <>
            {onCopyCode && (
              <Button
                size="sm"
                icon={<SwapIcon swapped={copied === "code"} from={<Icon.Copy />} to={<Icon.Check />} />}
                onClick={() => flash("code", onCopyCode)}
                title="Copy code"
              >
                <span className="hidden md:inline">Copy code</span>
              </Button>
            )}
            {onCopyForAgent && (
              <Button
                size="sm"
                icon={<SwapIcon swapped={copied === "agent"} from={<Icon.Sparkle />} to={<Icon.Check />} />}
                disabled={!valid}
                title={
                  valid
                    ? "Layout included, language guide prepended — paste it to an agent"
                    : "Fix validation errors first"
                }
                onClick={() => flash("agent", onCopyForAgent)}
              >
                <span className="hidden md:inline">Copy for agent</span>
              </Button>
            )}
          </>
        )
      }
    >
      {tabbed && (
        <div role="tablist" aria-label="Files" className="flex h-10 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-surface px-2">
          {files.map((f) => {
            const { name, dir } = fileLabel(f);
            const errors = checked?.filter((d) => d.file === f && d.severity === "error").length ?? 0;
            const on = f === file;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={on}
                title={f}
                onClick={() => onFileChange(f === rootFile ? null : f)}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors duration-100",
                  on ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink",
                )}
              >
                <Icon.File className="h-3.5 w-3.5" />
                <span className="mono">{name}</span>
                {dir && <span className="hidden text-xs text-ink-3 md:inline">{dir}</span>}
                {errors > 0 && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <CodeEditor
          key={tabbed ? file : "doc"}
          value={shown}
          onChange={edit}
          readOnly={readOnly}
          onViewReady={onViewReady}
          extensions={allExtensions}
          className="h-full"
        />
      </div>
      {shownDiagnostics.length > 0 && (
        <ul className="max-h-40 shrink-0 overflow-y-auto border-t border-line bg-surface py-1">
          {shownDiagnostics.map((d, i) => {
            const isError = d.severity === "error";
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jumpTo(d)}
                  className={cx(
                    "flex h-[26px] w-full items-center gap-2 px-3 text-left transition-colors duration-75 hover:bg-surface-2",
                  )}
                >
                  <Chip tone={isError ? "danger" : "warn"} className="mono shrink-0">
                    {d.code}
                  </Chip>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{d.message}</span>
                  {d.span && (
                    <span className="mono shrink-0 text-xs text-ink-3">L{d.span.start.line}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </CodeDialog>
  );
}
