"use client";

import { useCallback, useMemo, useState } from "react";
import {
  autoLayout,
  format,
  parse,
  validate,
  type ArchDoc,
  type Diagnostic,
} from "@archlang/lang";
import { knownConnectionTypes, knownTypes } from "@archlang/catalog";

const KNOWN_TYPES = knownTypes();
const KNOWN_CONNECTION_TYPES = knownConnectionTypes();
const HISTORY_LIMIT = 100;

interface HistoryState {
  source: string;
  past: string[];
  future: string[];
}

export interface ArchDocState {
  source: string;
  /** Update from the code pane (no history entry — the textarea has its own). */
  setSource: (text: string) => void;
  /**
   * Apply an AST transform to the laid-out doc and commit the formatted result
   * as one undoable step. Returns false if the transform threw.
   */
  mutate: (fn: (doc: ArchDoc) => ArchDoc) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useArchDoc(initial: string): ArchDocState {
  const [state, setState] = useState<HistoryState>({
    source: initial,
    past: [],
    future: [],
  });

  const setSource = useCallback(
    (text: string) =>
      setState((s) =>
        text === s.source
          ? s
          : {
              source: text,
              past: [...s.past.slice(-HISTORY_LIMIT), s.source],
              future: [],
            },
      ),
    [],
  );

  const mutate = useCallback((fn: (doc: ArchDoc) => ArchDoc) => {
    setState((s) => {
      try {
        const laidOut = autoLayout(parse(s.source).doc);
        const text = format(fn(laidOut));
        if (text === s.source) return s;
        return {
          source: text,
          past: [...s.past.slice(-HISTORY_LIMIT), s.source],
          future: [],
        };
      } catch (e) {
        console.warn("[archlang] transform rejected:", e);
        return s;
      }
    });
  }, []);

  const undo = useCallback(
    () =>
      setState((s) => {
        const prev = s.past[s.past.length - 1];
        if (prev === undefined) return s;
        return {
          source: prev,
          past: s.past.slice(0, -1),
          future: [s.source, ...s.future],
        };
      }),
    [],
  );

  const redo = useCallback(
    () =>
      setState((s) => {
        const [next, ...rest] = s.future;
        if (next === undefined) return s;
        return { source: next, past: [...s.past, s.source], future: rest };
      }),
    [],
  );

  return {
    source: state.source,
    setSource,
    mutate,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

export interface DerivedDoc {
  doc: ArchDoc;
  laidOut: ArchDoc;
  diagnostics: Diagnostic[];
  valid: boolean;
}

export function deriveDoc(source: string): DerivedDoc {
  const parsed = parse(source);
  const diagnostics = [
    ...parsed.diagnostics,
    ...validate(parsed.doc, {
      knownTypes: KNOWN_TYPES,
      knownConnectionTypes: KNOWN_CONNECTION_TYPES,
    }),
  ];
  return {
    doc: parsed.doc,
    laidOut: autoLayout(parsed.doc),
    diagnostics,
    valid: !diagnostics.some((d) => d.severity === "error"),
  };
}

export function useDerivedDoc(source: string, delayMs = 250): DerivedDoc {
  const debounced = useDebounced(source, delayMs);
  return useMemo(() => deriveDoc(debounced), [debounced]);
}

import { useEffect } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
