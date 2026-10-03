import {
  autoLayout,
  forEachScope,
  format,
  layoutMap,
  normalizeLayout,
  parse,
  pathToString,
  planeTree,
  validate,
  type ArchDoc,
  type Diagnostic,
  type LayoutEntry,
} from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { ICON_NAMES } from "@archer/catalog/icons";

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
    ...validate(parsed.doc, {
      knownTypes: types,
      knownConnectionTypes: knownConnectionTypes(),
      knownIcons: ICON_NAMES,
    }),
  ];
  return {
    doc: parsed.doc,
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === "error"),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
  };
}

/**
 * How much one canvas can show and still read at a glance. Past either, write
 * results carry a hint to nest (see "Keep every canvas readable" in the
 * guide). The guide asks for about 5–9 components; these are the ceilings.
 */
export const CANVAS_BUDGET = { components: 12, connections: 16 };

/**
 * Readability hints for a document: one per canvas (the top level, or the
 * inside of a component) that holds more components, or draws more lines
 * between them, than CANVAS_BUDGET. A connection to a nested part is drawn on
 * every canvas above it, to the box holding it, so lines count per pair of
 * boxes. Advice only: nothing is blocked, and it isn't a diagnostic.
 */
export function readabilityHints(doc: ArchDoc): string[] {
  const hints: string[] = [];
  forEachScope(doc, (path, scope) => {
    const n = scope.components.length;
    const inside = (p: readonly string[]) =>
      p.length > path.length && path.every((seg, i) => p[i] === seg);
    const pairs = new Set<string>();
    for (const c of doc.connections) {
      if (!inside(c.source) || !inside(c.target)) continue;
      const a = c.source[path.length]!;
      const b = c.target[path.length]!;
      if (a !== b) pairs.add(a < b ? `${a} ${b}` : `${b} ${a}`);
    }
    if (n <= CANVAS_BUDGET.components && pairs.size <= CANVAS_BUDGET.connections) return;
    const where = path.length === 0 ? "The top level" : `The inside of ${path.join(".")}`;
    hints.push(
      `${where} shows ${n} component${n === 1 ? "" : "s"} and ${pairs.size} line${pairs.size === 1 ? "" : "s"} between them; ` +
        `a canvas reads at a glance with about 5–9. Nest the parts that work together inside a component named for what they do ` +
        `(any depth; planes don't help, they stay on the same canvas), so this canvas shows only the main pieces. ` +
        `See "Keep every canvas readable" in get_guide. If you are only making a small edit to the user's document, tell them instead of restructuring it unasked.`,
    );
  });
  return hints;
}

/** The plane each component and plane sits on, by path ("" for none). */
function planesOf(doc: ArchDoc): Map<string, string> {
  const out = new Map<string, string>();
  forEachScope(doc, (path, scope) => {
    const tree = planeTree(scope);
    for (const x of [...scope.components, ...scope.planes])
      out.set([...path, x.id].join("."), tree.planeOf(x)?.id ?? "");
  });
  return out;
}

/**
 * Carry the previous document's layout over to a new revision: any component
 * or plane that still exists and has no explicit entry in the new source keeps
 * its old position and size. An `at` is relative to the plane an item sits on,
 * so one that moved onto another plane (or off one) keeps only its size and is
 * placed afresh. Then auto-layout completes whatever is left.
 */
export function mergeLayout(previous: ArchDoc, next: ArchDoc): ArchDoc {
  const nextEntries = new Set(next.layout.map((e) => pathToString(e.path)));
  const before = planesOf(previous);
  const after = planesOf(next);
  const inherited = [...layoutMap(normalizeLayout(previous)).values()]
    .filter((e) => !nextEntries.has(pathToString(e.path)))
    .map((e): LayoutEntry => {
      const key = pathToString(e.path);
      if (!after.has(key) || before.get(key) === after.get(key)) return e;
      const { at: _moved, ...rest } = e;
      return rest;
    });
  return autoLayout({ ...next, layout: [...next.layout, ...inherited] });
}

export type PreparedWrite =
  | { ok: true; text: string; title: string; warnings: Diagnostic[]; hints: string[] }
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
    hints: readabilityHints(analysis.doc),
  };
}
