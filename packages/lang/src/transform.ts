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
import {
  LEAF_SIZE,
  PLANE_INNER_MARGIN,
  PLANE_INNER_ORIGIN,
  autoLayout,
  effectiveDisplay,
  layoutMap,
} from "./layout";

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

/** A snake_case id from `seed` that isn't in `taken` (suffixing _2, _3…). */
function uniqueId(taken: ReadonlySet<string>, seed: string): string {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[0-9]+/, "") || "component";
  if (!taken.has(base)) return base;
  // A clash on an id that already ends in a number counts on from it (app_2 → app_3).
  const numbered = /^(.*[a-z])_(\d+)$/.exec(base);
  const stem = numbered ? numbered[1]! : base;
  for (let i = numbered ? Number(numbered[2]) + 1 : 2; ; i++) {
    if (!taken.has(`${stem}_${i}`)) return `${stem}_${i}`;
  }
}

/** Generate a fresh snake_case id in a scope, seeded from a type tag or name. */
export function freshId(
  doc: ArchDoc,
  parent: readonly string[],
  seed: string,
): string {
  return uniqueId(new Set(childrenAt(doc, parent).map((c) => c.id)), seed);
}

export interface AddComponentOptions {
  id?: string;
  name?: string;
  type?: string;
  shape?: string;
  at?: [number, number];
  size?: [number, number];
}

const NAME_RE = /^[a-z][a-z0-9_]*$/;

const checkShape = (shape: string): void => {
  if (!NAME_RE.test(shape)) throw new Error(`Invalid shape '${shape}' (need snake_case).`);
};

export function addComponent(
  doc: ArchDoc,
  parent: readonly string[],
  opts: AddComponentOptions = {},
): { doc: ArchDoc; path: string[] } {
  if (opts.shape !== undefined) checkShape(opts.shape);
  const next = clone(doc);
  const seed =
    opts.id ?? opts.name ?? opts.type?.split(".").pop() ?? opts.shape ?? "component";
  const id = opts.id ?? freshId(next, parent, seed);
  const siblings = childrenAt(next, parent);
  if (siblings.some((c) => c.id === id))
    throw new Error(`Duplicate id '${id}' in '${parent.join(".")}'`);
  siblings.push({
    kind: "component",
    id,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(opts.shape !== undefined ? { shape: opts.shape } : {}),
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
  /** Clearing it (or setting "box") draws the default box. */
  shape?: string | null;
  desc?: string | null;
  src?: string | null;
}

export function setComponentMeta(
  doc: ArchDoc,
  path: readonly string[],
  meta: ComponentMeta,
): ArchDoc {
  if (typeof meta.shape === "string") checkShape(meta.shape);
  const next = clone(doc);
  const node = findComponent(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  for (const key of ["name", "type", "shape", "desc", "src"] as const) {
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
  // An icon is leaf-sized; an expanded plane drops that size so auto-layout
  // fits it around its children instead of leaving them spilling out.
  if (display === "icon") entry.size = LEAF_SIZE;
  else delete entry.size;
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

/** Point the connection at `index` at new endpoints (dragging either end of an edge). */
export function setConnectionEndpoints(
  doc: ArchDoc,
  index: number,
  source: readonly string[],
  target: readonly string[],
): ArchDoc {
  if (!doc.connections[index]) throw new Error(`No connection at index ${index}.`);
  const paths = componentPaths(doc);
  for (const p of [source, target]) {
    if (!paths.has(pathToString(p)))
      throw new Error(`Connection endpoint '${pathToString(p)}' does not exist.`);
  }
  if (pathToString(source) === pathToString(target))
    throw new Error("A component cannot connect to itself.");
  const next = clone(doc);
  const conn = next.connections[index]!;
  conn.source = [...source];
  conn.target = [...target];
  return next;
}

/* ------------------------------------------------ Multi-component edits */

type Paths = readonly (readonly string[])[];

/** Existing paths, deduped, minus any nested under another one in the set. */
function outermost(doc: ArchDoc, paths: Paths): string[][] {
  const all = componentPaths(doc);
  const keys = [...new Set(paths.map((p) => pathToString(p)))].filter((k) => all.has(k));
  return keys
    .filter((k) => !keys.some((q) => q !== k && k.startsWith(q + ".")))
    .map((k) => k.split("."));
}

/** Grid position in the root's frame: plane children are parent-relative, so sum `at` down the path. */
function absoluteAt(
  layout: Map<string, LayoutEntry>,
  path: readonly string[],
): [number, number] {
  let x = 0;
  let y = 0;
  for (let i = 1; i <= path.length; i++) {
    const at = layout.get(pathToString(path.slice(0, i)))?.at;
    if (at) {
      x += at[0];
      y += at[1];
    }
  }
  return [x, y];
}

const commonPrefix = (a: readonly string[], b: readonly string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i]!);
  return out;
};

const topLeft = (ats: readonly (readonly [number, number])[]): [number, number] => [
  Math.min(...ats.map((a) => a[0])),
  Math.min(...ats.map((a) => a[1])),
];

/** Rewrite `p` if it sits under one of the moved roots (`[from, to]` pairs); null otherwise. */
const remapUnder = (
  p: readonly string[],
  moves: readonly (readonly [readonly string[], readonly string[]])[],
): string[] | null => {
  for (const [from, to] of moves) if (isUnder(p, from)) return [...to, ...p.slice(from.length)];
  return null;
};

/**
 * Copy components, with everything inside them, into a standalone document:
 * the clipboard format. The selected components become its roots (ids
 * de-duplicated), connections between them come along and connections that
 * leave the selection don't, and the layout keeps their arrangement with the
 * top-left one at [0, 0]. Paths nested under another selected path are
 * ignored (they come with their parent).
 */
export function extractFragment(doc: ArchDoc, paths: Paths): ArchDoc {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermost(laid, paths);
  const out: ArchDoc = {
    kind: "doc",
    title: doc.title,
    version: doc.version,
    components: [],
    connections: [],
    layout: [],
  };
  if (roots.length === 0) return out;
  const abs = roots.map((p) => absoluteAt(layout, p));
  const [minX, minY] = topLeft(abs);
  const taken = new Set<string>();
  const moves: [string[], string[]][] = [];
  roots.forEach((path, i) => {
    const node = clone(findComponent(laid, path)!);
    node.id = uniqueId(taken, node.id);
    taken.add(node.id);
    out.components.push(node);
    moves.push([path, [node.id]]);
    const own = layout.get(pathToString(path));
    out.layout.push({
      kind: "layout-entry",
      path: [node.id],
      at: [abs[i]![0] - minX, abs[i]![1] - minY],
      ...(own?.size ? { size: [own.size[0], own.size[1]] as [number, number] } : {}),
      ...(own?.display ? { display: own.display } : {}),
      span: ZERO_SPAN,
    });
  });
  for (const e of laid.layout) {
    const to = remapUnder(e.path, moves);
    if (to && to.length > 1) out.layout.push({ ...clone(e), path: to, span: ZERO_SPAN });
  }
  for (const c of laid.connections) {
    const source = remapUnder(c.source, moves);
    const target = remapUnder(c.target, moves);
    if (source && target) out.connections.push({ ...clone(c), source, target, span: ZERO_SPAN });
  }
  return out;
}

/**
 * Paste a fragment (any document; normally one from extractFragment) into
 * `parent`. Root ids that clash with a sibling get fresh ones, connections
 * whose ends don't resolve inside the fragment are dropped, and the roots
 * keep their arrangement with the top-left one at `at` (default: where the
 * fragment's own layout has it). Returns the pasted roots' paths.
 */
export function insertFragment(
  doc: ArchDoc,
  fragment: ArchDoc,
  parent: readonly string[],
  at?: [number, number],
): { doc: ArchDoc; paths: string[][] } {
  const next = clone(doc);
  const siblings = childrenAt(next, parent);
  if (fragment.components.length === 0) return { doc: next, paths: [] };
  const frag = autoLayout(fragment);
  const fragLayout = layoutMap(frag);
  const fragPaths = componentPaths(frag);
  const [minX, minY] = topLeft(frag.components.map((c) => fragLayout.get(c.id)?.at ?? [0, 0]));
  let origin: [number, number] = at ?? [minX, minY];
  if (parent.length > 0)
    origin = [
      Math.max(origin[0], PLANE_INNER_ORIGIN[0]),
      Math.max(origin[1], PLANE_INNER_ORIGIN[1]),
    ];

  const taken = new Set(siblings.map((c) => c.id));
  const moves: [string[], string[]][] = [];
  const paths: string[][] = [];
  for (const c of frag.components) {
    const node = clone(c);
    node.id = uniqueId(taken, c.id);
    taken.add(node.id);
    siblings.push(node);
    const path = [...parent, node.id];
    moves.push([[c.id], path]);
    paths.push(path);
  }
  for (const e of frag.layout) {
    const to = remapUnder(e.path, moves);
    if (!to) continue;
    const entry: LayoutEntry = { ...clone(e), path: to, span: ZERO_SPAN };
    if (e.path.length === 1 && e.at)
      entry.at = [origin[0] + e.at[0] - minX, origin[1] + e.at[1] - minY];
    next.layout.push(entry);
  }
  for (const c of frag.connections) {
    if (!fragPaths.has(pathToString(c.source)) || !fragPaths.has(pathToString(c.target)))
      continue;
    next.connections.push({
      ...clone(c),
      source: remapUnder(c.source, moves)!,
      target: remapUnder(c.target, moves)!,
      span: ZERO_SPAN,
    });
  }
  for (const p of paths) growAncestors(next, p);
  return { doc: next, paths };
}

export interface GroupOptions {
  id?: string;
  /** Display name; defaults to "Group". */
  name?: string;
  type?: string;
}

/**
 * Wrap components in a new container, created in their closest common parent
 * (where the first of them sat) and sized around them. Everything keeps its
 * place on the canvas and its connections. Returns the container's path.
 */
export function groupComponents(
  doc: ArchDoc,
  paths: Paths,
  opts: GroupOptions = {},
): { doc: ArchDoc; path: string[] } {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermost(laid, paths);
  if (roots.length === 0) throw new Error("Nothing to group.");
  const parent = roots.map((p) => p.slice(0, -1)).reduce(commonPrefix);
  const base = absoluteAt(layout, parent);
  const rects = roots.map((p) => {
    const [x, y] = absoluteAt(layout, p);
    return {
      path: p,
      at: [x - base[0], y - base[1]] as [number, number],
      size: layout.get(pathToString(p))?.size ?? LEAF_SIZE,
    };
  });
  const [minX, minY] = topLeft(rects.map((r) => r.at));
  const maxX = Math.max(...rects.map((r) => r.at[0] + r.size[0]));
  const maxY = Math.max(...rects.map((r) => r.at[1] + r.size[1]));
  let at: [number, number] = [minX - PLANE_INNER_ORIGIN[0], minY - PLANE_INNER_ORIGIN[1]];
  if (parent.length > 0)
    at = [Math.max(at[0], PLANE_INNER_ORIGIN[0]), Math.max(at[1], PLANE_INNER_ORIGIN[1])];
  const size: [number, number] = [
    maxX - at[0] + PLANE_INNER_MARGIN[0],
    maxY - at[1] + PLANE_INNER_MARGIN[1],
  ];

  const name = opts.name ?? "Group";
  const { doc: withGroup, path } = addComponent(laid, parent, {
    id: opts.id ?? freshId(laid, parent, name),
    name,
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    at,
    size,
  });
  // Take the place of the first grouped sibling, so document order reads naturally.
  const siblings = childrenAt(withGroup, parent);
  const first = siblings.findIndex((c) =>
    roots.some((r) => r.length === parent.length + 1 && r[parent.length] === c.id),
  );
  if (first >= 0) siblings.splice(first, 0, siblings.pop()!);

  let next = withGroup;
  for (const r of rects)
    next = reparentComponent(next, r.path, path, [r.at[0] - at[0], r.at[1] - at[1]]);
  return { doc: next, path };
}

/**
 * Re-run auto-layout on components and everything inside them, leaving the
 * rest of the canvas where it is. Siblings are arranged among themselves and
 * keep their top-left corner; when they're every child of their parent they
 * start at its origin instead, and a parent plane is resized to fit them.
 * Containers keep their icon/plane display.
 */
export function relayoutComponents(doc: ArchDoc, paths: Paths): ArchDoc {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const byParent = new Map<string, Set<string>>();
  for (const r of outermost(laid, paths)) {
    const key = pathToString(r.slice(0, -1));
    byParent.set(key, (byParent.get(key) ?? new Set()).add(r[r.length - 1]!));
  }

  const next = clone(laid);
  for (const [key, ids] of byParent) {
    const parent = key === "" ? [] : key.split(".");
    const siblings = childrenAt(laid, parent);
    const chosen = siblings.filter((c) => ids.has(c.id));
    const all = chosen.length === siblings.length;
    const chosenPaths = chosen.map((c) => [...parent, c.id]);
    const under = (p: readonly string[]) => chosenPaths.some((cp) => isUnder(p, cp));
    const strip = (p: readonly string[]) => p.slice(parent.length);

    const out = autoLayout({
      ...laid,
      components: clone(chosen),
      connections: laid.connections
        .filter((c) => under(c.source) && under(c.target))
        .map((c) => ({ ...clone(c), source: strip(c.source), target: strip(c.target) })),
      layout: laid.layout
        .filter((e) => e.display !== undefined && under(e.path))
        .map((e) => ({ kind: "layout-entry", path: strip(e.path), display: e.display, span: ZERO_SPAN })),
    });
    const outLayout = layoutMap(out);
    const before = topLeft(chosenPaths.map((p) => layout.get(pathToString(p))?.at ?? [0, 0]));
    const after = topLeft(chosen.map((c) => outLayout.get(c.id)?.at ?? [0, 0]));
    const anchor: readonly [number, number] = all
      ? parent.length > 0
        ? PLANE_INNER_ORIGIN
        : [0, 0]
      : before;

    next.layout = next.layout.filter((e) => !under(e.path));
    for (const e of out.layout) {
      const entry: LayoutEntry = { ...e, path: [...parent, ...e.path], span: ZERO_SPAN };
      if (e.path.length === 1 && e.at)
        entry.at = [e.at[0] - after[0] + anchor[0], e.at[1] - after[1] + anchor[1]];
      next.layout.push(entry);
    }

    if (all && parent.length > 0) {
      const entry = entryFor(next, parent);
      if (effectiveDisplay(findComponent(next, parent)!, entry) === "plane") {
        const placed = layoutMap(next);
        let w = 0;
        let h = 0;
        for (const p of chosenPaths) {
          const e = placed.get(pathToString(p))!;
          w = Math.max(w, e.at![0] + e.size![0]);
          h = Math.max(h, e.at![1] + e.size![1]);
        }
        entry.size = [w + PLANE_INNER_MARGIN[0], h + PLANE_INNER_MARGIN[1]];
      }
      growAncestors(next, parent);
    } else {
      for (const p of chosenPaths) growAncestors(next, p);
    }
  }
  return next;
}

/**
 * Copy components (with everything inside them and the connections between
 * them) next to the originals: into their closest common parent, shifted by
 * `offset` grid cells. Returns the copies' paths.
 */
export function duplicateComponents(
  doc: ArchDoc,
  paths: Paths,
  offset: [number, number] = [1, 1],
): { doc: ArchDoc; paths: string[][] } {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermost(laid, paths);
  if (roots.length === 0) return { doc: laid, paths: [] };
  const parent = roots.map((p) => p.slice(0, -1)).reduce(commonPrefix);
  const base = absoluteAt(layout, parent);
  const [x, y] = topLeft(roots.map((p) => absoluteAt(layout, p)));
  return insertFragment(laid, extractFragment(laid, roots), parent, [
    x - base[0] + offset[0],
    y - base[1] + offset[1],
  ]);
}
