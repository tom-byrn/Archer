import { parseDocument } from "yaml";
import {
  componentPaths,
  findComponent,
  forEachScope,
  planePaths,
  scopeAt,
} from "./scope";
import { SHAPES, isShape } from "./shapes";
import { COLORS, isColor } from "./colors";
import { messageConnection, sequenceRows } from "./sequence";
import {
  pathToString,
  type ArchDoc,
  type Diagnostic,
  type ItemNode,
  type PayloadNode,
} from "./types";

export { componentPaths, findComponent } from "./scope";

export interface ValidateOptions {
  /** Catalog type tags (without `@`). When provided, unresolved types produce W301. */
  knownTypes?: ReadonlySet<string>;
  /** Known connection type tags. Falls back to knownTypes when absent. */
  knownConnectionTypes?: ReadonlySet<string>;
  /** Icon names (`@archer/catalog/icons` ICON_NAMES). When provided, unknown icons produce W305. */
  knownIcons?: ReadonlySet<string>;
}

/**
 * What an unresolved connection end most likely meant. Planes aren't part of
 * paths, so `backend.api` for an `api` on plane `backend` names nothing;
 * dropping the plane ids finds it. Undefined when that finds nothing either.
 */
function withoutPlanes(doc: ArchDoc, path: readonly string[]): string[] | undefined {
  const out: string[] = [];
  for (const seg of path) {
    const scope = scopeAt(doc, out);
    if (!scope) return undefined;
    if (scope.components.some((c) => c.id === seg)) out.push(seg);
    else if (!scope.planes.some((p) => p.id === seg)) return undefined;
  }
  return out.length > 0 && out.length < path.length && findComponent(doc, out) ? out : undefined;
}

/** GitHub-flavored-Markdown table check: header row, separator row, consistent columns. */
export function validateTable(content: string): string | null {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length < 2) return "A table needs a header row and a separator row.";
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith("|") || !line.endsWith("|")) {
      return `Table line ${i + 1} must start and end with '|'.`;
    }
  }
  const cols = (line: string) => line.slice(1, -1).split("|").length;
  const headerCols = cols(lines[0]!);
  const sep = lines[1]!;
  if (!/^\|(\s*:?-+:?\s*\|)+$/.test(sep)) {
    return "Table line 2 must be a separator row like | --- | --- |.";
  }
  for (const [i, line] of lines.entries()) {
    if (cols(line) !== headerCols) {
      return `Table line ${i + 1} has ${cols(line)} columns; the header has ${headerCols}.`;
    }
  }
  return null;
}

/** Check payload content against its format. Returns a problem string, or null when valid. */
export function checkPayload(
  format: "json" | "yaml" | "table" | "markdown",
  content: string,
): string | null {
  if (format === "json") {
    try {
      JSON.parse(content);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  if (format === "yaml") {
    const parsed = parseDocument(content);
    return parsed.errors.length > 0 ? parsed.errors[0]!.message : null;
  }
  if (format === "table") return validateTable(content);
  return null;
}

export function validate(doc: ArchDoc, opts: ValidateOptions = {}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const paths = componentPaths(doc);
  const planes = planePaths(doc);

  // E003 (unique payload names per owner), E201 (payload formats) — shared by
  // components and connections.
  const checkPayloads = (payloads: readonly PayloadNode[], owner: string) => {
    const names = new Set<string>();
    for (const payload of payloads) {
      if (names.has(payload.name)) {
        diagnostics.push({
          code: "E003",
          severity: "error",
          message: `Duplicate payload name '${payload.name}' on ${owner}.`,
          span: payload.span,
        });
      }
      names.add(payload.name);

      const problem = checkPayload(payload.format, payload.content);
      if (problem !== null) {
        diagnostics.push({
          code: "E201",
          severity: "error",
          message: `Payload '${payload.name}' on ${owner} is not valid ${payload.format}: ${problem}`,
          span: payload.span,
        });
      }
    }
  };

  // E002 (unique ids per scope, components and planes alike), E003 (unique
  // payload names), E201 (payload formats), W301 (types), W304 (shapes),
  // W305 (icons), W306 (colors)
  forEachScope(doc, (scopePath, scope) => {
    const prefix = scopePath.join(".");
    const where = prefix === "" ? "the top level" : `'${prefix}'`;
    // In document order, so the second of two clashing declarations is the one flagged.
    const items: ItemNode[] = [...scope.components, ...scope.planes].sort(
      (a, b) => a.span.start.offset - b.span.start.offset,
    );
    const seen = new Map<string, ItemNode>();
    for (const n of items) {
      const first = seen.get(n.id);
      if (first) {
        const clash =
          first.kind === n.kind
            ? `Duplicate ${n.kind} id '${n.id}' in ${where}.`
            : `Duplicate id '${n.id}' in ${where}: a component and a plane in one scope need different ids.`;
        diagnostics.push({ code: "E002", severity: "error", message: clash, span: n.span });
      } else seen.set(n.id, n);
    }

    for (const plane of scope.planes) {
      if (plane.type && opts.knownTypes && !opts.knownTypes.has(plane.type)) {
        diagnostics.push({
          code: "W301",
          severity: "warning",
          message: `Unknown type '@${plane.type}' on plane '${prefix === "" ? plane.id : `${prefix}.${plane.id}`}' — drawing it as a plain plane.`,
          span: plane.span,
        });
      }
    }

    for (const n of scope.components) {
      const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
      checkPayloads(n.payloads, `'${p}'`);

      if (n.type && opts.knownTypes && !opts.knownTypes.has(n.type)) {
        diagnostics.push({
          code: "W301",
          severity: "warning",
          message: `Unknown type '@${n.type}' on '${p}' — rendering as a generic component.`,
          span: n.span,
        });
      }

      if (n.shape !== undefined && !isShape(n.shape)) {
        diagnostics.push({
          code: "W304",
          severity: "warning",
          message: `Unknown shape '${n.shape}' on '${p}' — drawing it as a box. Shapes: ${SHAPES.join(", ")}.`,
          span: n.span,
        });
      }

      if (n.icon !== undefined && opts.knownIcons && !opts.knownIcons.has(n.icon)) {
        diagnostics.push({
          code: "W305",
          severity: "warning",
          message: `Unknown icon '${n.icon}' on '${p}' — ignoring it. Icons are Phosphor names in snake case (list_types lists them).`,
          span: n.span,
        });
      }

      if (n.color !== undefined && !isColor(n.color)) {
        diagnostics.push({
          code: "W306",
          severity: "warning",
          message: `Unknown color '${n.color}' on '${p}' — ignoring it. Colors: ${COLORS.join(", ")}, or "#rrggbb".`,
          span: n.span,
        });
      }
    }
  });

  // E101 (endpoints resolve), W302 (duplicate connections), W301 for connection types
  const seenConnections = new Set<string>();
  const connectionTypes = opts.knownConnectionTypes ?? opts.knownTypes;
  for (const c of doc.connections) {
    for (const [end, path] of [
      ["source", c.source],
      ["target", c.target],
    ] as const) {
      const key = pathToString(path);
      if (paths.has(key)) continue;
      const meant = withoutPlanes(doc, path);
      diagnostics.push({
        code: "E101",
        severity: "error",
        message: planes.has(key)
          ? `Connection ${end} '${key}' is a plane: connections join components, so point it at a component on the plane.`
          : meant
            ? `Connection ${end} '${key}' does not resolve to a declared component. Planes aren't part of paths: did you mean '${pathToString(meant)}'?`
            : `Connection ${end} '${key}' does not resolve to a declared component.`,
        span: c.span,
      });
    }
    const key = [
      pathToString(c.source),
      c.arrow,
      pathToString(c.target),
      c.type ?? "",
      c.label ?? "",
    ].join(" ");
    if (seenConnections.has(key)) {
      diagnostics.push({
        code: "W302",
        severity: "warning",
        message: `Duplicate connection ${pathToString(c.source)} ${c.arrow} ${pathToString(c.target)}.`,
        span: c.span,
      });
    }
    seenConnections.add(key);
    checkPayloads(
      c.payloads,
      `connection ${pathToString(c.source)} ${c.arrow} ${pathToString(c.target)}`,
    );
    if (c.type && connectionTypes && !connectionTypes.has(c.type)) {
      diagnostics.push({
        code: "W301",
        severity: "warning",
        message: `Unknown connection type '@${c.type}'.`,
        span: c.span,
      });
    }
  }

  // E002 (unique sequence ids), E101 (participants resolve), W307 (every call
  // travels on a connection), W301 for message types
  const seqIds = new Set<string>();
  for (const seq of doc.sequences) {
    if (seqIds.has(seq.id)) {
      diagnostics.push({
        code: "E002",
        severity: "error",
        message: `Duplicate sequence id '${seq.id}'.`,
        span: seq.span,
      });
    }
    seqIds.add(seq.id);
    const resolves = (path: readonly string[], span: Diagnostic["span"]): boolean => {
      const key = pathToString(path);
      if (paths.has(key)) return true;
      const meant = withoutPlanes(doc, path);
      diagnostics.push({
        code: "E101",
        severity: "error",
        message: planes.has(key)
          ? `Sequence '${seq.id}': '${key}' is a plane, and only components take part in sequences.`
          : meant
            ? `Sequence '${seq.id}': '${key}' does not resolve to a declared component. Planes aren't part of paths: did you mean '${pathToString(meant)}'?`
            : `Sequence '${seq.id}': '${key}' does not resolve to a declared component.`,
        ...(span ? { span } : {}),
      });
      return false;
    };
    for (const row of sequenceRows(seq)) {
      if (row.kind === "note") {
        for (const p of row.step.over) resolves(p, row.step.span);
        continue;
      }
      if (row.kind !== "message") continue;
      const m = row.step;
      const ok = [resolves(m.from, m.span), resolves(m.to, m.span)].every(Boolean);
      if (m.type && connectionTypes && !connectionTypes.has(m.type)) {
        diagnostics.push({
          code: "W301",
          severity: "warning",
          message: `Unknown connection type '@${m.type}' in sequence '${seq.id}'.`,
          span: m.span,
        });
      }
      if (!ok || m.arrow === "-->" || pathToString(m.from) === pathToString(m.to)) continue;
      if (messageConnection(doc.connections, m) === -1) {
        const from = pathToString(m.from);
        const to = pathToString(m.to);
        diagnostics.push({
          code: "W307",
          severity: "warning",
          message: `Sequence '${seq.id}', step ${row.number}: ${from} calls ${to}, but no connection joins them. Add one (${from} -> ${to}) so the architecture shows it.`,
          span: m.span,
        });
      }
    }
  }

  // W303 (layout entries reference declared components and planes)
  for (const entry of doc.layout) {
    const key = pathToString(entry.path);
    if (!paths.has(key) && !planes.has(key)) {
      diagnostics.push({
        code: "W303",
        severity: "warning",
        message: `Layout entry for '${key}' does not match a declared component or plane (it will be dropped).`,
        span: entry.span,
      });
    }
  }

  return diagnostics;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");

/**
 * Drop layout entries that don't resolve (W303) and collapse duplicates (last wins).
 * Returns a new doc; never mutates.
 */
export function normalizeLayout(doc: ArchDoc): ArchDoc {
  const paths = componentPaths(doc);
  const planes = planePaths(doc);
  const byPath = new Map<string, (typeof doc.layout)[number]>();
  for (const entry of doc.layout) {
    const key = pathToString(entry.path);
    if (paths.has(key) || planes.has(key)) byPath.set(key, entry);
  }
  return { ...doc, layout: [...byPath.values()] };
}
