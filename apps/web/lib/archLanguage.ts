/**
 * CodeMirror language support for `.arch` source, plus helpers that map
 * Archer diagnostics and the spans of components and planes onto editor
 * positions.
 *
 * The tokenizer lives in `lib/archTokens.ts`, shared with
 * `lib/highlightArch.ts` (static code blocks).
 */

import { StreamLanguage, LanguageSupport, type StreamParser } from "@codemirror/language";
import type { Diagnostic as CmDiagnostic } from "@codemirror/lint";
import type { Text } from "@codemirror/state";
import { findItem, type ArchDoc, type Diagnostic, type ItemNode, type Scope } from "@archer/lang";
import { archTokenizer, type ArchState } from "./archTokens";

export const archStreamParser: StreamParser<ArchState> = {
  name: "arch",
  ...archTokenizer,
  languageData: {
    commentTokens: { line: "#" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
};

export const archStreamLanguage = StreamLanguage.define<ArchState>(archStreamParser);

export function archLanguage(): LanguageSupport {
  return new LanguageSupport(archStreamLanguage);
}

/* ------------------------------------------------------------ diagnostics */

/** Map Archer diagnostics to CodeMirror lint diagnostics for `doc`. */
export function archerLinter(diagnostics: Diagnostic[], doc: Text): CmDiagnostic[] {
  const len = doc.length;
  const out: CmDiagnostic[] = [];
  for (const d of diagnostics) {
    let from = Math.min(d.span?.start.offset ?? 0, len);
    let to = Math.min(d.span?.end.offset ?? from, len);
    if (to <= from) {
      const line = doc.lineAt(from);
      to = Math.max(from + 1, line.to);
      to = Math.min(to, len);
      if (to <= from) {
        from = Math.max(0, from - 1);
        to = Math.max(from + 1, Math.min(len, from + 1));
      }
    }
    if (to <= from) continue;
    out.push({
      from,
      to,
      severity: d.severity === "error" ? "error" : "warning",
      message: `${d.code}: ${d.message}`,
    });
  }
  return out;
}

/* --------------------------------------------------------------- spans */

/** Find a component or plane by dotted path. */
export const itemAtPath = (doc: ArchDoc, path: string): ItemNode | undefined =>
  findItem(doc, path.split("."));

/**
 * Dotted path of the innermost component or plane whose span contains
 * `offset`: a component on a plane wins over the plane, a plane inside a
 * plane over the outer one.
 */
export function itemPathAtOffset(doc: ArchDoc, offset: number): string | null {
  const within = (x: ItemNode) => offset >= x.span.start.offset && offset <= x.span.end.offset;
  const size = (x: ItemNode) => x.span.end.offset - x.span.start.offset;
  let best: string | null = null;
  let scope: Scope = doc;
  let prefix = "";
  for (;;) {
    const c = scope.components.find(within);
    if (c) {
      best = prefix === "" ? c.id : `${prefix}.${c.id}`;
      prefix = best;
      scope = { components: c.children, planes: c.planes };
      continue;
    }
    const inner = scope.planes.filter(within).sort((a, b) => size(a) - size(b))[0];
    if (inner) best = prefix === "" ? inner.id : `${prefix}.${inner.id}`;
    return best;
  }
}
