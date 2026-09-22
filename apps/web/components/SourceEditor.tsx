"use client";

/**
 * CodeEditor for `.arch` source or a payload, with the grammar picked by name.
 * Pages load this module with next/dynamic so CodeMirror stays out of their
 * first load. Payload grammars then load per format on first use: markdown's
 * alone pulls in the HTML, CSS and JavaScript grammars.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PayloadFormat } from "@archer/lang";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { archLanguage } from "@/lib/archLanguage";
import { CodeEditor, type CodeEditorProps } from "./CodeMirror";

export type SourceLanguage = "arch" | PayloadFormat;

/** Grammars ready to use. `.arch` ships with this module; tables are plain text. */
const grammars = new Map<SourceLanguage, Extension>([
  ["arch", archLanguage()],
  ["table", []],
]);

const loadGrammar = (format: "json" | "yaml" | "markdown"): Promise<Extension> =>
  format === "json"
    ? import("@codemirror/lang-json").then((m) => m.json())
    : format === "yaml"
      ? import("@codemirror/lang-yaml").then((m) => m.yaml())
      : import("@codemirror/lang-markdown").then((m) => m.markdown());

const PLAIN: Extension = [];

/** The grammar for `language`: plain text until it has loaded. */
function useGrammar(language: SourceLanguage): Extension {
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (language === "arch" || language === "table" || grammars.has(language)) return;
    let live = true;
    loadGrammar(language)
      .then((grammar) => {
        grammars.set(language, grammar);
        if (live) setLoaded((n) => n + 1);
      })
      // Offline: stay plain text; the next editor to mount tries again.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [language]);
  return grammars.get(language) ?? PLAIN;
}

export default function SourceEditor({
  language,
  onBlur,
  ...props
}: Omit<CodeEditorProps, "extensions"> & {
  language: SourceLanguage;
  /** Called when the editor loses focus. */
  onBlur?: () => void;
}) {
  const grammar = useGrammar(language);
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const extensions = useMemo(
    () => [
      grammar,
      EditorView.domEventHandlers({
        blur: () => {
          onBlurRef.current?.();
          return false;
        },
      }),
    ],
    [grammar],
  );
  return <CodeEditor {...props} extensions={extensions} />;
}
