import type { ArchDoc, ComponentNode, ItemNode, PlaneNode } from "./types";

/**
 * Scopes and planes. A scope is one canvas: the document's top level, or the
 * inside of a component (which the editor opens by drilling in). Its
 * components and planes share one namespace of ids. Planes group what's in a
 * scope and are transparent to paths: a component's path runs through the
 * components it is nested in, never through the planes it sits on.
 */

/** A scope's contents. The arrays are the document's own, so transforms can edit them. */
export interface Scope {
  components: ComponentNode[];
  planes: PlaneNode[];
}

/** Look up a component node by dot-path. */
export function findComponent(
  doc: ArchDoc,
  path: readonly string[],
): ComponentNode | undefined {
  let nodes = doc.components;
  let found: ComponentNode | undefined;
  for (const seg of path) {
    found = nodes.find((n) => n.id === seg);
    if (!found) return undefined;
    nodes = found.children;
  }
  return found;
}

/** The scope at a component path: [] is the top level. */
export function scopeAt(doc: ArchDoc, path: readonly string[]): Scope | undefined {
  if (path.length === 0) return { components: doc.components, planes: doc.planes };
  const c = findComponent(doc, path);
  return c ? { components: c.children, planes: c.planes } : undefined;
}

/** A component's inside, as a scope. */
export const scopeOf = (c: ComponentNode): Scope => ({ components: c.children, planes: c.planes });

/** Look up a plane by path: its scope's path, then its id. */
export function findPlane(doc: ArchDoc, path: readonly string[]): PlaneNode | undefined {
  if (path.length === 0) return undefined;
  const id = path[path.length - 1];
  return scopeAt(doc, path.slice(0, -1))?.planes.find((p) => p.id === id);
}

/** A component or a plane, by path. */
export function findItem(doc: ArchDoc, path: readonly string[]): ItemNode | undefined {
  if (path.length === 0) return undefined;
  const scope = scopeAt(doc, path.slice(0, -1));
  const id = path[path.length - 1];
  return scope?.components.find((c) => c.id === id) ?? scope?.planes.find((p) => p.id === id);
}

/** Visit every scope, top level first: its path, then its contents. */
export function forEachScope(doc: ArchDoc, fn: (path: string[], scope: Scope) => void): void {
  const walk = (path: string[], scope: Scope) => {
    fn(path, scope);
    for (const c of scope.components) walk([...path, c.id], scopeOf(c));
  };
  walk([], { components: doc.components, planes: doc.planes });
}

/** All component dot-paths declared in the document. */
export function componentPaths(doc: ArchDoc): Set<string> {
  const paths = new Set<string>();
  forEachScope(doc, (path, scope) => {
    for (const c of scope.components) paths.add([...path, c.id].join("."));
  });
  return paths;
}

/** All plane paths (scope path, then id). */
export function planePaths(doc: ArchDoc): Set<string> {
  const paths = new Set<string>();
  forEachScope(doc, (path, scope) => {
    for (const p of scope.planes) paths.add([...path, p.id].join("."));
  });
  return paths;
}

/**
 * How a scope's planes nest, resolved: which plane each item sits on and
 * what sits on each plane. Membership is by id, so a document can name a
 * plane that isn't there, or planes that sit on each other in a loop (only
 * ever from a bad edit, never from parsing); such an item sits on nothing.
 */
export interface PlaneTree {
  /** The plane an item sits on; undefined at the top of the scope. */
  planeOf(item: ItemNode): PlaneNode | undefined;
  /** Every plane an item sits on, innermost first. */
  chainOf(item: ItemNode): PlaneNode[];
  /**
   * What sits directly on a plane (undefined: the top of the scope), in
   * canonical order: each component or plane where its first component
   * appears in the scope's declaration order, planes with no components last.
   */
  itemsOn(plane: PlaneNode | undefined): ItemNode[];
  /** A plane by id (the first one, should ids repeat). */
  plane(id: string): PlaneNode | undefined;
}

export function planeTree(scope: Scope): PlaneTree {
  const byId = new Map<string, PlaneNode>();
  for (const p of scope.planes) if (!byId.has(p.id)) byId.set(p.id, p);

  // Accept each plane's link in declaration order unless it would close a
  // loop, so the links always form a forest.
  const parent = new Map<PlaneNode, PlaneNode>();
  for (const p of scope.planes) {
    const up = p.plane === undefined ? undefined : byId.get(p.plane);
    if (!up) continue;
    let cur: PlaneNode | undefined = up;
    while (cur && cur !== p) cur = parent.get(cur);
    if (cur !== p) parent.set(p, up);
  }

  const planeOf = (item: ItemNode): PlaneNode | undefined =>
    item.kind === "plane"
      ? parent.get(item)
      : item.plane === undefined
        ? undefined
        : byId.get(item.plane);
  const chainOf = (item: ItemNode): PlaneNode[] => {
    const out: PlaneNode[] = [];
    for (let p = planeOf(item); p; p = parent.get(p)) out.push(p);
    return out;
  };

  const kids = new Map<PlaneNode | undefined, ItemNode[]>();
  const placed = new Set<ItemNode>();
  const put = (on: PlaneNode | undefined, item: ItemNode) => {
    if (placed.has(item)) return;
    placed.add(item);
    const list = kids.get(on);
    if (list) list.push(item);
    else kids.set(on, [item]);
  };
  for (const c of scope.components) {
    const chain = chainOf(c);
    let on: PlaneNode | undefined;
    for (let i = chain.length - 1; i >= 0; i--) {
      put(on, chain[i]!);
      on = chain[i];
    }
    put(on, c);
  }
  for (const p of scope.planes) put(parent.get(p), p);

  return {
    planeOf,
    chainOf,
    itemsOn: (plane) => kids.get(plane) ?? [],
    plane: (id) => byId.get(id),
  };
}

/** Is `path` (dot-joined) `prefix` or inside it? */
export const isUnderPath = (path: string, prefix: string): boolean =>
  prefix === "" || path === prefix || path.startsWith(prefix + ".");
