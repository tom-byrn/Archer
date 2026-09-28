"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  autoLayout,
  format,
  parse,
  validate,
  type ArchDoc,
  type Diagnostic,
} from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { ICON_NAMES } from "@archer/catalog/icons";

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
  /** Replace the text (code pane edits, remote saves, reset) as one undoable step. */
  setSource: (text: string) => void;
  /**
   * Apply an AST transform to the laid-out doc and commit the formatted result
   * as one undoable step. Returns false if the transform threw.
   */
  mutate: (fn: (doc: ArchDoc) => ArchDoc) => boolean;
  /**
   * `mutate` for transforms that also produce something the caller needs
   * (the paths of what they created). Applied synchronously, so the value
   * comes back right away; undefined if the transform threw.
   */
  mutateWith: <T>(fn: (doc: ArchDoc) => { doc: ArchDoc; value: T }) => T | undefined;
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
  // The latest state, updated as each change is committed, so edits apply in
  // order and can return results without waiting for a render.
  const latest = useRef(state);
  const commit = useCallback((next: HistoryState) => {
    latest.current = next;
    setState(next);
  }, []);
  const push = useCallback(
    (text: string) => {
      const s = latest.current;
      if (text === s.source) return;
      commit({ source: text, past: [...s.past.slice(-HISTORY_LIMIT), s.source], future: [] });
    },
    [commit],
  );

  const mutateWith = useCallback(
    <T,>(fn: (doc: ArchDoc) => { doc: ArchDoc; value: T }): T | undefined => {
      try {
        const laidOut = autoLayout(parse(latest.current.source).doc);
        const { doc, value } = fn(laidOut);
        push(format(doc));
        return value;
      } catch (e) {
        console.warn("[archer] transform rejected:", e);
        return undefined;
      }
    },
    [push],
  );

  const mutate = useCallback(
    (fn: (doc: ArchDoc) => ArchDoc) => mutateWith((d) => ({ doc: fn(d), value: true })) ?? false,
    [mutateWith],
  );

  const undo = useCallback(() => {
    const s = latest.current;
    const prev = s.past[s.past.length - 1];
    if (prev === undefined) return;
    commit({ source: prev, past: s.past.slice(0, -1), future: [s.source, ...s.future] });
  }, [commit]);

  const redo = useCallback(() => {
    const s = latest.current;
    const [next, ...rest] = s.future;
    if (next === undefined) return;
    commit({ source: next, past: [...s.past, s.source], future: rest });
  }, [commit]);

  return {
    source: state.source,
    setSource: push,
    mutate,
    mutateWith,
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

export function deriveDoc(source: string, extraTypes?: ReadonlySet<string>): DerivedDoc {
  const parsed = parse(source);
  const knownTypes =
    extraTypes && extraTypes.size > 0
      ? new Set([...KNOWN_TYPES, ...extraTypes])
      : KNOWN_TYPES;
  const diagnostics = [
    ...parsed.diagnostics,
    ...validate(parsed.doc, {
      knownTypes,
      knownConnectionTypes: KNOWN_CONNECTION_TYPES,
      knownIcons: ICON_NAMES,
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
