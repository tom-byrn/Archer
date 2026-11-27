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
import { VIEW_LABELS, allViews, placeableIds } from "./views";
import { resolveFile } from "./files";
import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
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
  // Views share one id namespace (E002).
  const viewIds = new Map<string, string>();
  for (const v of allViews(doc)) {
    const first = viewIds.get(v.node.id);
    if (first !== undefined) {
      diagnostics.push({
        code: "E002",
        severity: "error",
        message:
          first === v.kind
            ? `Duplicate ${VIEW_LABELS[v.kind].one} id '${v.node.id}'.`
            : `Duplicate view id '${v.node.id}': a ${VIEW_LABELS[first as keyof typeof VIEW_LABELS].one} and a ${VIEW_LABELS[v.kind].one} need different ids.`,
        span: v.node.span,
      });
    } else viewIds.set(v.node.id, v.kind);
  }

  /** E101 for a component a view names (a lane, what a machine or model is of). */
  const component = (path: readonly string[], where: string, span: Diagnostic["span"]) => {
    const key = pathToString(path);
    if (paths.has(key)) return;
    const meant = withoutPlanes(doc, path);
    diagnostics.push({
      code: "E101",
      severity: "error",
      message: planes.has(key)
        ? `${where}: '${key}' is a plane, and views name components.`
        : meant
          ? `${where}: '${key}' does not resolve to a declared component. Planes aren't part of paths: did you mean '${pathToString(meant)}'?`
          : `${where}: '${key}' does not resolve to a declared component.`,
      ...(span ? { span } : {}),
    });
  };
  /** E002 within a view: its nodes, states, entities or fields. */
  const unique = <T>(items: readonly T[], idOf: (x: T) => string, spanOf: (x: T) => Diagnostic["span"], what: string) => {
    const seen = new Set<string>();
    for (const x of items) {
      const id = idOf(x);
      if (seen.has(id)) {
        const span = spanOf(x);
        diagnostics.push({ code: "E002", severity: "error", message: `Duplicate ${what} '${id}'.`, ...(span ? { span } : {}) });
      }
      seen.add(id);
    }
    return seen;
  };
  /** E102: a reference inside a view that names nothing in it. */
  const dangling = (message: string, span: Diagnostic["span"]) =>
    diagnostics.push({ code: "E102", severity: "error", message, ...(span ? { span } : {}) });

  for (const f of doc.flows) {
    const where = `Flow '${f.id}'`;
    const ids = unique(f.nodes, (n) => n.id, (n) => n.span, `node id in flow '${f.id}'`);
    for (const n of f.nodes) if (n.lane) component(n.lane, `${where}, node '${n.id}'`, n.span);
    for (const e of f.edges)
      for (const end of [e.from, e.to])
        if (!ids.has(end)) dangling(`${where}: '${end}' is not a node of this flow.`, e.span);
  }

  for (const m of doc.machines) {
    const where = `State machine '${m.id}'`;
    if (m.of) component(m.of, where, m.span);
    const ids = unique(m.states, (st) => st.id, (st) => st.span, `state id in '${m.id}'`);
    for (const t of m.transitions)
      for (const end of [t.from, t.to])
        if (!ids.has(end)) dangling(`${where}: '${end}' is not a state of this machine.`, t.span);
    if (m.states.length > 0 && !m.states.some((st) => st.initial)) {
      diagnostics.push({
        code: "W308",
        severity: "warning",
        message: `${where} has no initial state. Mark the one it starts in: state <id> initial.`,
        span: m.span,
      });
    }
  }

  for (const m of doc.models) {
    const where = `Data model '${m.id}'`;
    if (m.on) component(m.on, where, m.span);
    unique(m.entities, (e) => e.id, (e) => e.span, `entity id in '${m.id}'`);
    for (const e of m.entities) {
      unique(e.fields, (f) => f.name, () => e.span, `field name on '${m.id}.${e.id}'`);
      for (const f of e.fields) {
        if (!f.ref) continue;
        const target = m.entities.find((x) => x.id === f.ref!.entity);
        if (!target) dangling(`${where}: '${e.id}.${f.name}' refers to '${f.ref.entity}', which is not an entity of this model.`, e.span);
        else if (f.ref.field !== undefined && !target.fields.some((x) => x.name === f.ref!.field))
          dangling(`${where}: '${e.id}.${f.name}' refers to '${f.ref.entity}.${f.ref.field}', which is not a field of '${f.ref.entity}'.`, e.span);
      }
    }
  }

  for (const seq of doc.sequences) {
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

  // W303 for placed view nodes too.
  for (const e of doc.viewLayout) {
    if (placeableIds(doc, e.view).has(e.node)) continue;
    diagnostics.push({
      code: "W303",
      severity: "warning",
      message: `Layout entry for '${e.node}' in view '${e.view}' does not match a node of that view (it will be dropped).`,
      span: e.span,
    });
  }

  // E403/E405: the files components keep their insides in (spec §2.2), as
  // seen from a root file at the top of the folder.
  {
    const seen = new Map<string, string>();
    const visit = (components: readonly ComponentNode[], path: string[], file: string) => {
      for (const c of components) {
        const p = [...path, c.id];
        let inner = file;
        if (c.use !== undefined) {
          const target = resolveFile(file, c.use);
          if (target === null || !c.use.endsWith(".arch")) {
            diagnostics.push({
              code: "E405",
              severity: "error",
              message: `Component '${p.join(".")}' uses '${c.use}': name an .arch file by a relative path inside the folder, like "./billing/billing.arch".`,
              span: c.span,
            });
          } else if (seen.has(target)) {
            diagnostics.push({
              code: "E403",
              severity: "error",
              message: `Components '${seen.get(target)}' and '${p.join(".")}' both use ${target}: a file describes one component.`,
              span: c.span,
            });
          } else {
            seen.set(target, p.join("."));
            inner = target;
          }
        }
        visit(c.children, p, inner);
      }
    };
    visit(doc.components, [], "document.arch");
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
  const byNode = new Map<string, (typeof doc.viewLayout)[number]>();
  for (const e of doc.viewLayout) if (placeableIds(doc, e.view).has(e.node)) byNode.set(`${e.view} ${e.node}`, e);
  return { ...doc, layout: [...byPath.values()], viewLayout: [...byNode.values()] };
}
