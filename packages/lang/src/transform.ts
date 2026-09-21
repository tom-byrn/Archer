import {
  pathToString,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type DisplayMode,
  type LayoutEntry,
  type PayloadFormat,
  type PayloadNode,
} from "./types";
import { componentPaths, findComponent } from "./validate";
import { LEAF_SIZE, PLANE_INNER_ORIGIN, layoutMap } from "./layout";

/**
 * Pure AST transforms — the single mutation path for every canvas edit.
 * All functions return a new doc and never mutate the input. Callers run the
 * result through format() to produce the next source text.
 */

const ZERO_SPAN = {
  start: { line: 0, col: 0, offset: 0 },
  end: { line: 0, col: 0, offset: 0 },
} as const;

const clone = <T>(v: T): T => structuredClone(v);

const childrenAt = (doc: ArchDoc, parent: readonly string[]): ComponentNode[] => {
  if (parent.length === 0) return doc.components;
  const node = findComponent(doc, parent);
  if (!node) throw new Error(`No component at '${parent.join(".")}'`);
  return node.children;
};

/** Generate a fresh snake_case id in a scope, seeded from a type tag or name. */
export function freshId(
  doc: ArchDoc,
  parent: readonly string[],
  seed: string,
): string {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[0-9]+/, "") || "component";
  const siblings = new Set(childrenAt(doc, parent).map((c) => c.id));
  if (!siblings.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!siblings.has(`${base}_${i}`)) return `${base}_${i}`;
  }
}

export interface AddComponentOptions {
  id?: string;
  name?: string;
  type?: string;
  at?: [number, number];
  size?: [number, number];
}

export function addComponent(
  doc: ArchDoc,
  parent: readonly string[],
  opts: AddComponentOptions = {},
): { doc: ArchDoc; path: string[] } {
  const next = clone(doc);
  const seed = opts.id ?? opts.name ?? opts.type?.split(".").pop() ?? "component";
  const id = opts.id ?? freshId(next, parent, seed);
  const siblings = childrenAt(next, parent);
  if (siblings.some((c) => c.id === id))
    throw new Error(`Duplicate id '${id}' in '${parent.join(".")}'`);
  siblings.push({
    kind: "component",
    id,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    payloads: [],
    children: [],
    span: ZERO_SPAN,
  });
  const path = [...parent, id];
  if (opts.at) {
    next.layout.push({
      kind: "layout-entry",
      path,
      at: opts.at,
      size: opts.size ?? LEAF_SIZE,
      span: ZERO_SPAN,
    });
    growAncestors(next, path);
  }
  return { doc: next, path };
}

const isUnder = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((seg, i) => path[i] === seg);

export function removeComponent(doc: ArchDoc, path: readonly string[]): ArchDoc {
  const next = clone(doc);
  const parent = path.slice(0, -1);
  const siblings = childrenAt(next, parent);
  const idx = siblings.findIndex((c) => c.id === path[path.length - 1]);
  if (idx === -1) throw new Error(`No component at '${path.join(".")}'`);
  siblings.splice(idx, 1);
  next.connections = next.connections.filter(
    (c) => !isUnder(c.source, path) && !isUnder(c.target, path),
  );
  next.layout = next.layout.filter((e) => !isUnder(e.path, path));
  return next;
}

export function renameComponent(
  doc: ArchDoc,
  path: readonly string[],
  newId: string,
): ArchDoc {
  if (!/^[a-z][a-z0-9_]*$/.test(newId))
    throw new Error(`Invalid id '${newId}' (need snake_case).`);
  const next = clone(doc);
  const parent = path.slice(0, -1);
  const siblings = childrenAt(next, parent);
  const node = siblings.find((c) => c.id === path[path.length - 1]);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  if (siblings.some((c) => c !== node && c.id === newId))
    throw new Error(`Duplicate id '${newId}' in '${parent.join(".")}'`);
  node.id = newId;
  const renamed = (p: string[]): string[] =>
    isUnder(p, path) ? [...parent, newId, ...p.slice(path.length)] : p;
  for (const c of next.connections) {
    c.source = renamed(c.source);
    c.target = renamed(c.target);
  }
  for (const e of next.layout) e.path = renamed(e.path);
  return next;
}

export interface ComponentMeta {
  /** undefined = leave alone; null = clear. */
  name?: string | null;
  type?: string | null;
  desc?: string | null;
  src?: string | null;
}

export function setComponentMeta(
  doc: ArchDoc,
  path: readonly string[],
  meta: ComponentMeta,
): ArchDoc {
  const next = clone(doc);
  const node = findComponent(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  for (const key of ["name", "type", "desc", "src"] as const) {
    const v = meta[key];
    if (v === undefined) continue;
    if (v === null) delete node[key];
    else node[key] = v;
  }
  return next;
}

/** Create or update a named payload on anything that carries payloads. */
function upsertPayload(
  owner: { payloads: PayloadNode[] },
  name: string,
  format: PayloadFormat,
  content: string,
): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error(`Invalid payload name '${name}' (need snake_case).`);
  const existing = owner.payloads.find((p) => p.name === name);
  if (existing) {
    existing.format = format;
    existing.content = content;
  } else {
    owner.payloads.push({ kind: "payload", name, format, content, span: ZERO_SPAN });
  }
}

export function setPayload(
  doc: ArchDoc,
  path: readonly string[],
  name: string,
  format: PayloadFormat,
  content: string,
): ArchDoc {
  const next = clone(doc);
  const node = findComponent(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  upsertPayload(node, name, format, content);
  return next;
}

export function removePayload(
  doc: ArchDoc,
  path: readonly string[],
  name: string,
): ArchDoc {
  const next = clone(doc);
  const node = findComponent(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  node.payloads = node.payloads.filter((p) => p.name !== name);
  return next;
}

/** Create or update a payload on the connection at `index` (see removeConnection). */
export function setConnectionPayload(
  doc: ArchDoc,
  index: number,
  name: string,
  format: PayloadFormat,
  content: string,
): ArchDoc {
  const next = clone(doc);
  const conn = next.connections[index];
  if (!conn) throw new Error(`No connection at index ${index}.`);
  upsertPayload(conn, name, format, content);
  return next;
}

export function removeConnectionPayload(
  doc: ArchDoc,
  index: number,
  name: string,
): ArchDoc {
  const next = clone(doc);
  const conn = next.connections[index];
  if (!conn) throw new Error(`No connection at index ${index}.`);
  conn.payloads = conn.payloads.filter((p) => p.name !== name);
  return next;
}

const entryFor = (doc: ArchDoc, path: readonly string[]): LayoutEntry => {
  let entry = doc.layout.find(
    (e) => pathToString(e.path) === pathToString(path),
  );
  if (!entry) {
    entry = { kind: "layout-entry", path: [...path], span: ZERO_SPAN };
    doc.layout.push(entry);
  }
  return entry;
};

/** Expand ancestor planes so `path`'s rect fits inside them. */
function growAncestors(doc: ArchDoc, path: readonly string[]): void {
  for (let depth = path.length - 1; depth >= 1; depth--) {
    const childPath = path.slice(0, depth + 1);
    const parentPath = path.slice(0, depth);
    const child = entryFor(doc, childPath);
    const parent = entryFor(doc, parentPath);
    if (!child.at) continue;
    const childSize = child.size ?? LEAF_SIZE;
    const needW = child.at[0] + childSize[0] + 1;
    const needH = child.at[1] + childSize[1] + 1;
    const size = parent.size ?? [
      PLANE_INNER_ORIGIN[0] + needW,
      PLANE_INNER_ORIGIN[1] + needH,
    ];
    parent.size = [Math.max(size[0], needW), Math.max(size[1], needH)];
  }
}

export function moveComponent(
  doc: ArchDoc,
  path: readonly string[],
  at: [number, number],
): ArchDoc {
  const next = clone(doc);
  const entry = entryFor(next, path);
  // Children never sit above/left of the plane's inner origin.
  const min = path.length > 1 ? PLANE_INNER_ORIGIN : [-Infinity, -Infinity];
  entry.at = [Math.max(at[0], min[0]!), Math.max(at[1], min[1]!)];
  growAncestors(next, path);
  return next;
}

export function resizeComponent(
  doc: ArchDoc,
  path: readonly string[],
  size: [number, number],
): ArchDoc {
  const next = clone(doc);
  entryFor(next, path).size = [Math.max(size[0], 2), Math.max(size[1], 2)];
  growAncestors(next, path);
  return next;
}

export function setDisplay(
  doc: ArchDoc,
  path: readonly string[],
  display: DisplayMode,
): ArchDoc {
  const next = clone(doc);
  const entry = entryFor(next, path);
  entry.display = display;
  if (display === "icon" && !entry.size) entry.size = LEAF_SIZE;
  if (display === "icon") entry.size = LEAF_SIZE;
  return next;
}

export interface ConnectionOptions {
  arrow?: Arrow;
  type?: string;
  label?: string;
}

export function addConnection(
  doc: ArchDoc,
  source: readonly string[],
  target: readonly string[],
  opts: ConnectionOptions = {},
): ArchDoc {
  const paths = componentPaths(doc);
  for (const p of [source, target]) {
    if (!paths.has(pathToString(p)))
      throw new Error(`Connection endpoint '${pathToString(p)}' does not exist.`);
  }
  if (pathToString(source) === pathToString(target))
    throw new Error("A component cannot connect to itself.");
  const next = clone(doc);
  next.connections.push({
    kind: "connection",
    source: [...source],
    target: [...target],
    arrow: opts.arrow ?? "->",
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(opts.label !== undefined ? { label: opts.label } : {}),
    payloads: [],
    span: ZERO_SPAN,
  });
  return next;
}

/** Connections are addressed by index into doc.connections (stable per parse). */
export function removeConnection(doc: ArchDoc, index: number): ArchDoc {
  const next = clone(doc);
  if (index < 0 || index >= next.connections.length)
    throw new Error(`No connection at index ${index}.`);
  next.connections.splice(index, 1);
  return next;
}

export interface ConnectionMeta {
  arrow?: Arrow;
  type?: string | null;
  label?: string | null;
}

export function setConnectionMeta(
  doc: ArchDoc,
  index: number,
  meta: ConnectionMeta,
): ArchDoc {
  const next = clone(doc);
  const conn = next.connections[index];
  if (!conn) throw new Error(`No connection at index ${index}.`);
  if (meta.arrow !== undefined) conn.arrow = meta.arrow;
  for (const key of ["type", "label"] as const) {
    const v = meta[key];
    if (v === undefined) continue;
    if (v === null) delete conn[key];
    else conn[key] = v;
  }
  return next;
}

/** Move a component under a new parent (or the root), keeping connections. */
export function reparentComponent(
  doc: ArchDoc,
  path: readonly string[],
  newParent: readonly string[],
  at?: [number, number],
): ArchDoc {
  const targetPath = [...newParent, path[path.length - 1]!];
  if (isUnder(newParent, path))
    throw new Error("Cannot move a component into its own subtree.");
  const next = clone(doc);
  const oldParent = path.slice(0, -1);
  const siblings = childrenAt(next, oldParent);
  const idx = siblings.findIndex((c) => c.id === path[path.length - 1]);
  if (idx === -1) throw new Error(`No component at '${path.join(".")}'`);
  const [node] = siblings.splice(idx, 1);
  const newSiblings = childrenAt(next, newParent);
  if (newSiblings.some((c) => c.id === node!.id)) {
    node!.id = freshId(next, newParent, node!.id);
    targetPath[targetPath.length - 1] = node!.id;
  }
  newSiblings.push(node!);
  const remap = (p: string[]): string[] =>
    isUnder(p, path) ? [...targetPath, ...p.slice(path.length)] : p;
  for (const c of next.connections) {
    c.source = remap(c.source);
    c.target = remap(c.target);
  }
  for (const e of next.layout) e.path = remap(e.path);
  const moved =
    at !== undefined
      ? moveComponent(next, targetPath, at)
      : (() => {
          // Position unknown: drop stale coords so auto-layout re-places it.
          const entry = layoutMap(next).get(pathToString(targetPath));
          if (entry) delete entry.at;
          return next;
        })();
  return moved;
}
