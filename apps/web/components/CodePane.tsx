"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchDoc, Diagnostic } from "@archer/lang";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, EditorSelection } from "@codemirror/state";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { CodeDialog } from "./CodeDialog";
import { CodeEditor } from "./CodeMirror";
import { Button, Chip, Icon, cx } from "./ui";
import {
  archLanguage,
  archerLinter,
  componentAtPath,
  componentPathAtOffset,
} from "@/lib/archLanguage";

/* ---------------------------------------------- selected-component highlight */

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
}

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
}: CodePaneProps) {
  const viewRef = useRef<EditorView | null>(null);
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

  // Diagnostics come from props, not a linter source.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !open) return;
    view.dispatch(setDiagnostics(view.state, archerLinter(diagnostics, view.state.doc)));
  }, [diagnostics, open]);

  // Canvas → code: highlight the selected component's lines and scroll to it,
  // unless this selection originated from the editor's own cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !open) return;
    if (selectedPath === null) {
      lastEmittedPath.current = null;
      view.dispatch({ effects: setSelectedLines.of(null) });
      return;
    }
    const node = componentAtPath(doc, selectedPath);
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
  }, [selectedPath, doc, open]);

  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  const onViewReady = useCallback((view: EditorView) => {
    viewRef.current = view;
    view.dispatch(setDiagnostics(view.state, archerLinter(diagnosticsRef.current, view.state.doc)));
  }, []);

  // Code → canvas: cursor moved by the user into a component. Registered as
  // an extension so we see the real ViewUpdate (user-event flags).
  const selectionListener = useMemo(
    () =>
      EditorView.updateListener.of((u) => {
        if (!u.selectionSet) return;
        const userDriven = u.transactions.some(
          (tr) => tr.isUserEvent("select") || tr.isUserEvent("input") || tr.isUserEvent("delete"),
        );
        if (!userDriven) return;
        const offset = u.state.selection.main.head;
        const path = componentPathAtOffset(docRef.current, offset);
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
                icon={copied === "code" ? <Icon.Check /> : <Icon.Copy />}
                onClick={() => flash("code", onCopyCode)}
                title="Copy code"
              >
                <span className="hidden md:inline">{copied === "code" ? "Copied" : "Copy code"}</span>
              </Button>
            )}
            {onCopyForAgent && (
              <Button
                size="sm"
                icon={copied === "agent" ? <Icon.Check /> : <Icon.Sparkle />}
                disabled={!valid}
                title={
                  valid
                    ? "Layout stripped, language guide prepended — paste it to an agent"
                    : "Fix validation errors first"
                }
                onClick={() => flash("agent", onCopyForAgent)}
              >
                <span className="hidden md:inline">{copied === "agent" ? "Copied" : "Copy for agent"}</span>
              </Button>
            )}
          </>
        )
      }
    >
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={source}
          onChange={onChange}
          onViewReady={onViewReady}
          extensions={allExtensions}
          className="h-full"
        />
      </div>
      {diagnostics.length > 0 && (
        <ul className="max-h-40 shrink-0 overflow-y-auto border-t border-line bg-surface py-1">
          {diagnostics.map((d, i) => {
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
