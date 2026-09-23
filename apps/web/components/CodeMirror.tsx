"use client";

/**
 * Thin CodeMirror 6 wrapper used by the code pane and the payload editors.
 * Theme + highlight style are driven entirely by the CSS tokens in globals.css
 * so light/dark follow the OS automatically.
 */

import { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const archerHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--tok-kw)", fontWeight: "600" },
  { tag: t.string, color: "var(--tok-string)" },
  { tag: t.typeName, color: "var(--tok-type)" },
  { tag: t.operator, color: "var(--tok-arrow)", fontWeight: "700" },
  { tag: t.number, color: "var(--tok-num)" },
  { tag: t.comment, color: "var(--tok-comment)", fontStyle: "italic" },
  { tag: t.meta, color: "var(--tok-fence)" },
  { tag: t.content, color: "var(--tok-payload)" },
  { tag: t.special(t.string), color: "var(--tok-version)" },
  // JSON / YAML / Markdown
  { tag: t.propertyName, color: "var(--tok-type)" },
  { tag: t.bool, color: "var(--tok-kw)" },
  { tag: t.null, color: "var(--tok-kw)" },
  { tag: t.heading, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.link, color: "var(--tok-version)", textDecoration: "underline" },
  { tag: t.monospace, color: "var(--tok-string)" },
  { tag: t.atom, color: "var(--tok-num)" },
  { tag: t.punctuation, color: "var(--code-fg)" },
]);

export const archerTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-fg)",
    fontSize: "12px",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "var(--code-caret)",
  },
  ".cm-line": { padding: "0 12px 0 8px" },
  // Focus rings the whole editor box; globals.css keeps the contenteditable
  // itself bare. The ring sits on an overlay above the sticky gutter
  // (z-index 200), which would otherwise paint over its left edge.
  "&.cm-focused": { outline: "none" },
  "&.cm-focused::after": {
    content: '""',
    position: "absolute",
    inset: "0",
    zIndex: "300",
    pointerEvents: "none",
    outline: "2px solid var(--accent)",
    outlineOffset: "-2px",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-caret)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--code-selection) !important" },
  ".cm-activeLine": { backgroundColor: "var(--code-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--code-line)" },
  ".cm-gutters": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-gutter)",
    border: "none",
    paddingLeft: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px", padding: "0 6px 0 0" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--accent-soft)",
    outline: "1px solid var(--accent)",
    borderRadius: "2px",
  },
  ".cm-placeholder": { color: "var(--ink-3)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    boxShadow: "var(--shadow-md)",
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
  },
  ".cm-diagnostic": { padding: "4px 8px", borderLeft: "none" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--danger)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warn)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--warn)",
    textUnderlineOffset: "3px",
  },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0 2px 0 4px" },
  ".cm-lint-marker": { width: "8px", height: "8px", borderRadius: "50%", content: "none" },
  ".cm-lint-marker-error": { backgroundColor: "var(--danger)" },
  ".cm-lint-marker-warning": { backgroundColor: "var(--warn)" },
  ".cm-lint-marker svg": { display: "none" },
});

/** Sensible editing defaults shared by every editor instance. */
export const baseExtensions = (opts: { lineNumbers?: boolean } = {}): Extension => [
  ...(opts.lineNumbers === false ? [] : [lineNumbers(), highlightActiveLineGutter()]),
  history(),
  drawSelection(),
  indentOnInput(),
  bracketMatching(),
  highlightActiveLine(),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  syntaxHighlighting(archerHighlightStyle),
  archerTheme,
  EditorState.tabSize.of(2),
];

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Called on every view update (selection changes included). */
  onUpdate?: (view: EditorView) => void;
  onViewReady?: (view: EditorView) => void;
  /** Static extensions (language, lint, etc). Recreated when identity changes. */
  extensions?: Extension;
  readOnly?: boolean;
  lineNumbers?: boolean;
  placeholder?: string;
  className?: string;
  /** Extra styles for the outer element. */
  style?: React.CSSProperties;
}

/**
 * Controlled CodeMirror editor. External `value` changes are applied without
 * resetting the undo history or cursor unless the document actually differs.
 */
export function CodeEditor({
  value,
  onChange,
  onUpdate,
  onViewReady,
  extensions,
  readOnly,
  lineNumbers: showLines,
  placeholder,
  className,
  style,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onUpdateRef = useRef(onUpdate);
  onChangeRef.current = onChange;
  onUpdateRef.current = onUpdate;
  const extCompartment = useRef(new Compartment());
  const roCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          baseExtensions({ lineNumbers: showLines }),
          ...(placeholder ? [cmPlaceholder(placeholder)] : []),
          extCompartment.current.of(extensions ?? []),
          roCompartment.current.of(EditorState.readOnly.of(!!readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
            onUpdateRef.current?.(u.view);
          }),
        ],
      }),
    });
    viewRef.current = view;
    onViewReady?.(view);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: extCompartment.current.reconfigure(extensions ?? []) });
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: roCompartment.current.reconfigure(EditorState.readOnly.of(!!readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={hostRef} className={className} style={style} />;
}
