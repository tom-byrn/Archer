import { format } from "./format";
import { parse } from "./parser";
import { componentPaths, findComponent, planePaths, planeTree, scopeAt } from "./scope";
import { removeComponent, removeView, renameComponent } from "./transform";
import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type Diagnostic,
  type ViewKind,
  type ViewNode,
} from "./types";
import { allViews, findView, viewName, viewsOf, viewsWith } from "./views";

/**
 * Parts: one component (with everything nested in it) or one view, read and
 * written on its own, so an agent can work on a large document without
 * reading or resending all of it.
 *
 * A component part's text is its declaration as it reads in the document
 * (de-indented to the top) followed by every connection that has an end in it,
 * the ones that leave it included. Paths are full dot-paths from the root,
 * exactly as in the whole document. A view part's text is the view. Neither
 * carries the header or the layout block.
 */

/** A document with nothing in it, fresh each time (callers fill its arrays). */
const empty = (title: string, version: string): ArchDoc => ({
  kind: "doc",
  title,
  version,
  components: [],
  planes: [],
  connections: [],
  sequences: [],
  flows: [],
  machines: [],
  models: [],
  layout: [],
  viewLayout: [],
});

const clone = <T>(v: T): T => structuredClone(v);

const under = (p: readonly string[], prefix: readonly string[]): boolean =>
  p.length >= prefix.length && prefix.every((seg, i) => p[i] === seg);

/** Does the connection have an end in the component at `path` (or in it)? */
const touches = (c: ConnectionNode, path: readonly string[]): boolean =>
  under(c.source, path) || under(c.target, path);

/** Format a document's body: everything after the header line. */
const body = (doc: ArchDoc): string => {
  const text = format({ ...doc, layout: [], viewLayout: [] }, { stripLayout: true });
  return text.slice(text.indexOf("\n") + 1).replace(/^\n+/, "");
};

export interface ComponentPart {
  path: string[];
  /** The component's declaration, then the connections with an end in it. */
  source: string;
  /** How many of those connections have their other end outside it. */
  boundary: number;
  /** Ids of the views that name it or anything nested in it. */
  views: string[];
}

export function readComponentPart(doc: ArchDoc, path: readonly string[]): ComponentPart {
  const node = findComponent(doc, path);
  if (!node) throw new Error(`No component at '${pathToString(path)}'.`);
  const { plane: _plane, ...rest } = clone(node);
  const connections = doc.connections.filter((c) => touches(c, path));
  return {
    path: [...path],
    source: body({ ...empty(doc.title, doc.version), components: [rest], connections: clone(connections) }),
    boundary: connections.filter((c) => !under(c.source, path) || !under(c.target, path)).length,
    views: viewsWith(doc, path).map((v) => v.node.id),
  };
}

export interface ViewPart {
  id: string;
  kind: ViewKind;
  source: string;
}

export function readViewPart(doc: ArchDoc, id: string): ViewPart {
  const v = findView(doc, id);
  if (!v) throw new Error(`No view '${id}'.`);
  const only = empty(doc.title, doc.version);
  (viewsOf(only, v.kind) as ViewNode[]).push(clone(v.node));
  return { id, kind: v.kind, source: body(only) };
}

/**
 * Parse a part's text. It needn't start with a header; one is supplied on the
 * same line, so diagnostics keep the part's own line numbers.
 */
export function parsePart(source: string): { doc: ArchDoc; diagnostics: Diagnostic[] } {
  const text = /^\s*arch\b/.test(source) ? source : `arch "part" v0.2 ${source}`;
  return parse(text);
}

const isEmptyPart = (source: string) => source.replace(/#.*$/gm, "").trim() === "";

const viewCount = (doc: ArchDoc) => allViews(doc).length;

export interface PartWrite {
  doc: ArchDoc;
  /** Where the component is now (after a rename), or null when it was deleted. */
  path: string[] | null;
}

/**
 * Write a component part back: `source` is the component's declaration plus
 * every connection with an end in it, in the form readComponentPart gives.
 * It replaces the component where it is (on the same plane) and every
 * connection that touches it; the rest of the document is left as it is.
 * A different id at the top renames the component (connections elsewhere,
 * views and positions follow). A path that names nothing yet adds the
 * component to its parent's canvas. An empty source deletes it, as the
 * canvas does: with its connections, and out of the views that name it.
 *
 * Throws with a message for the agent when the part isn't one component and
 * its connections. Whether the result is valid (every path resolves) is for
 * the caller to check, on the whole document.
 */
export function writeComponentPart(doc: ArchDoc, path: readonly string[], source: string): PartWrite {
  if (path.length === 0) throw new Error("A part needs a component path; use the whole document for the top level.");
  const parentPath = path.slice(0, -1);
  const scope = scopeAt(doc, parentPath);
  if (!scope) throw new Error(`No component at '${pathToString(parentPath)}' to hold '${pathToString(path)}'.`);
  const existing = findComponent(doc, path);

  if (isEmptyPart(source)) {
    if (!existing) throw new Error(`No component at '${pathToString(path)}' to delete.`);
    return { doc: removeComponent(doc, path), path: null };
  }

  const { doc: frag, diagnostics } = parsePart(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new PartError(errors);
  if (frag.components.length !== 1 || frag.planes.length > 0)
    throw new Error(
      `A part is exactly one component declaration (then its connections); this one declares ${frag.components.length} component(s) and ${frag.planes.length} plane(s) at the top. Put new parts inside the component, or write a part for each.`,
    );
  if (viewCount(frag) > 0) throw new Error("Views aren't part of a component part: write each one as a view part.");
  if (frag.layout.length > 0 || frag.viewLayout.length > 0)
    throw new Error("Leave the layout block out of a part: positions are kept for you.");

  const node = frag.components[0]!;
  let next = clone(doc);
  let target = [...path];
  if (existing && node.id !== existing.id) {
    next = renameComponent(next, path, node.id);
    target = [...parentPath, node.id];
  } else if (!existing && node.id !== path[path.length - 1]) {
    throw new Error(
      `The part declares '${node.id}' but the path names '${path[path.length - 1]}': to add a component, give its path; to rename one, give its current path.`,
    );
  }

  const outside = frag.connections.filter((c) => !touches(c, target));
  if (outside.length > 0)
    throw new Error(
      `Every connection in a part needs an end in ${pathToString(target)} (full paths from the root); these don't: ${outside
        .map((c) => `${pathToString(c.source)} ${c.arrow} ${pathToString(c.target)}`)
        .join(", ")}.`,
    );

  const holder = scopeAt(next, parentPath)!;
  const i = holder.components.findIndex((c) => c.id === node.id);
  if (i >= 0) {
    const old = holder.components[i]!;
    holder.components[i] = { ...node, ...(old.plane !== undefined ? { plane: old.plane } : {}) };
  } else {
    if (holder.planes.some((p) => p.id === node.id))
      throw new Error(`'${pathToString(target)}' is a plane, not a component.`);
    const { plane: _p, ...added } = node;
    holder.components.push(added);
  }
  next.connections = [...next.connections.filter((c) => !touches(c, target)), ...frag.connections];

  // Positions inside the component that's gone stay only for paths that remain.
  const paths = componentPaths(next);
  const planes = planePaths(next);
  next.layout = next.layout.filter((e) => paths.has(pathToString(e.path)) || planes.has(pathToString(e.path)));
  return { doc: next, path: target };
}

/**
 * Write a view part back: `source` is one view. It replaces the view with that
 * id where it is, or adds it after the others of its kind. An empty source
 * deletes the view `id`.
 */
export function writeViewPart(doc: ArchDoc, id: string, source: string): ArchDoc {
  if (isEmptyPart(source)) return removeView(doc, id);
  const { doc: frag, diagnostics } = parsePart(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new PartError(errors);
  const views = allViews(frag);
  if (views.length !== 1 || frag.components.length > 0 || frag.planes.length > 0 || frag.connections.length > 0)
    throw new Error("A view part is exactly one view (sequence, flow, states or entities) and nothing else.");
  const v = views[0]!;
  if (v.node.id !== id)
    throw new Error(`The part declares view '${v.node.id}' but you named '${id}': views keep their ids.`);
  const next = clone(doc);
  const current = findView(next, id);
  if (current && current.kind !== v.kind)
    throw new Error(`'${id}' is a ${current.kind} view; delete it and add a new one to change its kind.`);
  const list = viewsOf(next, v.kind) as ViewNode[];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = v.node;
  else list.push(v.node);
  return next;
}

/** A part that doesn't parse: its diagnostics, with the part's own line numbers. */
export class PartError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => d.message).join(" "));
  }
}

export interface OutlineOptions {
  /** Levels of nesting to show (1: the top level only). Default: all. */
  depth?: number;
}

/**
 * The document as a map: one line per component, indented by nesting, each
 * with its full path, name, type, the plane it sits on, how many parts and
 * connections it has; then one line per view. Small enough to read whole,
 * and it names every path a part can be read by.
 */
export function outline(doc: ArchDoc, opts: OutlineOptions = {}): string {
  const depth = opts.depth ?? Infinity;
  const lines: string[] = [];
  const degree = (path: readonly string[]) => doc.connections.filter((c) => touches(c, path)).length;
  const count = (c: ComponentNode): number => c.children.reduce((n, k) => n + 1 + count(k), 0);
  const walk = (path: string[], components: ComponentNode[], planes: ComponentNode["planes"], level: number) => {
    const tree = planeTree({ components, planes });
    const ordered: ComponentNode[] = [];
    const visit = (on: (typeof planes)[number] | undefined) => {
      for (const x of tree.itemsOn(on)) {
        if (x.kind === "component") ordered.push(x);
        else visit(x);
      }
    };
    visit(undefined);
    for (const c of ordered) {
      const p = [...path, c.id];
      let line = `${"  ".repeat(level)}${pathToString(p)}`;
      if (c.name !== undefined) line += ` "${c.name}"`;
      if (c.type !== undefined) line += ` @${c.type}`;
      const on = tree.planeOf(c);
      const facts: string[] = [];
      if (on) facts.push(`on ${on.name ?? on.id}`);
      const n = count(c);
      if (n > 0) facts.push(`${n} part${n === 1 ? "" : "s"}${level + 1 >= depth ? " (not shown)" : ""}`);
      const d = degree(p);
      if (d > 0) facts.push(`${d} connection${d === 1 ? "" : "s"}`);
      if (facts.length > 0) line += ` — ${facts.join(", ")}`;
      lines.push(line);
      if (level + 1 < depth) walk(p, c.children, c.planes, level + 1);
    }
  };
  walk([], doc.components, doc.planes, 0);
  const views = allViews(doc);
  if (views.length > 0) {
    lines.push("");
    for (const v of views) lines.push(`${v.kind} ${v.node.id}${v.node.name !== undefined ? ` "${viewName(v.node)}"` : ""}`);
  }
  return lines.join("\n");
}
