import {
  autoLayout,
  format,
  layoutMap,
  normalizeLayout,
  parse,
  pathToString,
  validate,
  type ArchDoc,
  type Diagnostic,
} from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";

// Validation and write preparation shared by the hosted MCP tools and the CLI,
// so both report identical diagnostics. Pure: no backend, no filesystem.

export const formatDiagnostic = (d: Diagnostic): string =>
  `${d.code} [${d.severity}]${d.span ? ` line ${d.span.start.line}` : ""}: ${d.message}`;

/** The built-in catalog's type tags plus a workspace's custom ones. */
export function typeTags(custom: Iterable<string> = []): Set<string> {
  const types = knownTypes();
  for (const tag of custom) types.add(tag);
  return types;
}

export interface Analysis {
  doc: ArchDoc;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export function analyzeSource(source: string, types: Set<string>): Analysis {
  const parsed = parse(source);
  const diagnostics = [
    ...parsed.diagnostics,
    ...validate(parsed.doc, { knownTypes: types, knownConnectionTypes: knownConnectionTypes() }),
  ];
  return {
    doc: parsed.doc,
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === "error"),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
  };
}

/**
 * Carry the previous document's layout over to a new revision: any component
 * that still exists and has no explicit entry in the new source keeps its old
 * position/size/display. Then auto-layout completes whatever is left.
 */
export function mergeLayout(previous: ArchDoc, next: ArchDoc): ArchDoc {
  const nextEntries = new Set(next.layout.map((e) => pathToString(e.path)));
  const inherited = [...layoutMap(normalizeLayout(previous)).values()].filter(
    (e) => !nextEntries.has(pathToString(e.path)),
  );
  return autoLayout({ ...next, layout: [...next.layout, ...inherited] });
}

export type PreparedWrite =
  | { ok: true; text: string; title: string; warnings: Diagnostic[] }
  | { ok: false; errors: Diagnostic[]; warnings: Diagnostic[] };

/** Validate-gate a write; returns canonical text or the blocking errors. */
export function prepareSource(
  source: string,
  types: Set<string>,
  previousSource?: string,
): PreparedWrite {
  const analysis = analyzeSource(source, types);
  if (analysis.errors.length > 0) {
    return { ok: false, errors: analysis.errors, warnings: analysis.warnings };
  }
  const laidOut = previousSource
    ? mergeLayout(parse(previousSource).doc, analysis.doc)
    : autoLayout(analysis.doc);
  return {
    ok: true,
    text: format(laidOut),
    title: analysis.doc.title,
    warnings: analysis.warnings,
  };
}
