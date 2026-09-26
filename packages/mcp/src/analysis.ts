import {
  autoLayout,
  format,
  layoutMap,
  normalizeLayout,
  parse,
  pathToString,
  validate,
  type ArchDoc,
  type ComponentNode,
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
  /** How the document will read on the canvas (`readabilityAdvice`); never blocks anything. */
  advice: string[];
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
    advice: readabilityAdvice(parsed.doc),
  };
}

/** Components directly in one level (the top, or one container) before it stops reading at a glance. */
export const CROWDED_LEVEL = 12;
/** Connections into a library-looking component before it's called a hub. */
const HUB_CONNECTIONS = 5;
/** A connection label longer than this is a sentence, not a label. */
const LONG_LABEL = 40;
const LIBRARY_TYPES = new Set(["library", "lib", "package", "module", "sdk"]);
const LIBRARY_NAME = /(^|[^a-z])(shared|common|core|utils?|libs?|packages?|library)([^a-z]|$)/i;

/**
 * Advice on how a document will read, for whoever wrote it — agents mostly,
 * which tend to put everything they found on one level. Never an error: the
 * document is valid either way. The canvas already opens a big document as an
 * overview (collapsed containers, one edge per pair of boxes), but it can't
 * fix a level that has too much directly in it, or a code library drawn as a
 * hub everything connects to.
 */
export function readabilityAdvice(doc: ArchDoc): string[] {
  const advice: string[] = [];
  const label = (c: ComponentNode) => (c.name && c.name !== c.id ? ` (${c.name})` : "");

  const levels = (items: readonly ComponentNode[], path: string, owner?: ComponentNode) => {
    if (items.length > CROWDED_LEVEL)
      advice.push(
        owner
          ? `'${path}'${label(owner)} has ${items.length} components directly inside it. Group them into sub-containers: a level reads at a glance with 5–9 things on it.`
          : `The top level has ${items.length} components. Group related ones into containers (a service's parts inside the service, say): the top level reads at a glance with 5–9 things on it.`,
      );
    for (const c of items) levels(c.children, path === "" ? c.id : `${path}.${c.id}`, c);
  };
  levels(doc.components, "");

  // A code library as a box that everything connects into.
  const hubs = (items: readonly ComponentNode[], pre: string) => {
    for (const c of items) {
      const path = pre === "" ? c.id : `${pre}.${c.id}`;
      const looksLikeLibrary =
        (c.type !== undefined && LIBRARY_TYPES.has(c.type.split(".").pop()!)) ||
        LIBRARY_NAME.test(c.id) ||
        LIBRARY_NAME.test(c.name ?? "");
      if (looksLikeLibrary) {
        const inside = (p: string[]) => p.join(".") === path || p.join(".").startsWith(path + ".");
        const touching = doc.connections.filter((k) => inside(k.source) !== inside(k.target)).length;
        if (touching >= HUB_CONNECTIONS) {
          advice.push(
            `'${path}'${label(c)} looks like a code library, and ${touching} connections go in or out of it. A library runs inside the components that import it: connect those to what it talks to (databases, queues, APIs), and name the library in their desc or src instead.`,
          );
          continue;
        }
      }
      hubs(c.children, path);
    }
  };
  hubs(doc.components, "");

  const long = doc.connections.filter((c) => (c.label?.length ?? 0) > LONG_LABEL);
  if (long.length > 0)
    advice.push(
      `${long.length} connection label${long.length === 1 ? " is" : "s are"} over ${LONG_LABEL} characters (${long
        .slice(0, 2)
        .map((c) => `"${c.label}"`)
        .join(", ")}${long.length > 2 ? ", …" : ""}). Keep a label to a few words and put the detail in a payload on the connection.`,
    );
  return advice;
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
  | { ok: true; text: string; title: string; warnings: Diagnostic[]; advice: string[] }
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
    advice: analysis.advice,
  };
}
