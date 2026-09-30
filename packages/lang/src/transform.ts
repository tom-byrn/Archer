import {
  pathToString,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type ItemNode,
  type LayoutEntry,
  type PayloadFormat,
  type PayloadNode,
  type PlaneNode,
} from "./types";
import {
  componentPaths,
  findComponent,
  findItem,
  findPlane,
  planePaths,
  planeTree,
  scopeAt,
  scopeOf,
  type Scope,
} from "./scope";
import {
  EMPTY_PLANE_SIZE,
  LEAF_SIZE,
  PLANE_INNER_MARGIN,
  PLANE_INNER_ORIGIN,
  autoLayout,
  canvasAt,
  layoutMap,
  planeChainOf,
  planePathOf,
} from "./layout";
import { isColor } from "./colors";

/**
 * Pure AST transforms — the single mutation path for every canvas edit.
 * All functions return a new doc and never mutate the input. Callers run the
 * result through format() to produce the next source text.
 *
 * Paths address components (`backend.api`) and planes (their scope's path
 * plus their id). A component's scope is the canvas it's on: the top level,
 * or the component it's nested in. Planes group what's on a canvas; moving
 * something onto or off a plane never changes its path.
 */

const ZERO_SPAN = {
  start: { line: 0, col: 0, offset: 0 },
  end: { line: 0, col: 0, offset: 0 },
} as const;

const clone = <T>(v: T): T => structuredClone(v);

const scopeFor = (doc: ArchDoc, parent: readonly string[]): Scope => {
  const scope = scopeAt(doc, parent);
  if (!scope) throw new Error(`No component at '${parent.join(".")}'`);
  return scope;
};

/** Every id in use in a scope: its components' and its planes'. */
const idsIn = (scope: Scope): Set<string> =>
  new Set([...scope.components.map((c) => c.id), ...scope.planes.map((p) => p.id)]);

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
  return uniqueId(idsIn(scopeFor(doc, parent)), seed);
}

const NAME_RE = /^[a-z][a-z0-9_]*$/;

const checkShape = (shape: string): void => {
  if (!NAME_RE.test(shape)) throw new Error(`Invalid shape '${shape}' (need snake_case).`);
};

const checkIcon = (icon: string): void => {
  if (!NAME_RE.test(icon)) throw new Error(`Invalid icon '${icon}' (need snake_case).`);
};

const checkColor = (color: string): void => {
  if (!isColor(color)) throw new Error(`Invalid color '${color}' (need a palette name or #rrggbb).`);
};

const checkPlane = (scope: Scope, plane: string | undefined, where: readonly string[]) => {
  if (plane !== undefined && !scope.planes.some((p) => p.id === plane))
    throw new Error(`No plane '${plane}' in ${where.length === 0 ? "the top level" : `'${where.join(".")}'`}.`);
};

const isUnder = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((seg, i) => path[i] === seg);

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && isUnder(a, b);

export interface AddComponentOptions {
  id?: string;
  name?: string;
  type?: string;
  shape?: string;
  icon?: string;
  color?: string;
  /** Put it on this plane of the scope (by id). */
  plane?: string;
  /** Relative to the plane it's put on, else to its canvas. */
  at?: [number, number];
  size?: [number, number];
}

export function addComponent(
  doc: ArchDoc,
  parent: readonly string[],
  opts: AddComponentOptions = {},
): { doc: ArchDoc; path: string[] } {
  if (opts.shape !== undefined) checkShape(opts.shape);
  if (opts.icon !== undefined) checkIcon(opts.icon);
  if (opts.color !== undefined) checkColor(opts.color);
  const next = clone(doc);
  const scope = scopeFor(next, parent);
  checkPlane(scope, opts.plane, parent);
  const seed =
    opts.id ?? opts.name ?? opts.type?.split(".").pop() ?? opts.shape ?? "component";
  const id = opts.id ?? uniqueId(idsIn(scope), seed);
  if (idsIn(scope).has(id)) throw new Error(`Duplicate id '${id}' in '${parent.join(".")}'`);
  scope.components.push({
    kind: "component",
    id,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(opts.shape !== undefined ? { shape: opts.shape } : {}),
    ...(opts.icon !== undefined ? { icon: opts.icon } : {}),
    ...(opts.color !== undefined ? { color: opts.color } : {}),
    ...(opts.plane !== undefined ? { plane: opts.plane } : {}),
    payloads: [],
    children: [],
    planes: [],
    span: ZERO_SPAN,
  });
  const path = [...parent, id];
  if (opts.at) {
    next.layout.push({
      kind: "layout-entry",
      path,
      at: clampOnPlane(next, path, opts.at),
      size: opts.size ?? LEAF_SIZE,
      span: ZERO_SPAN,
    });
    growPlanes(next, path);
  }
  return { doc: next, path };
}

export interface AddPlaneOptions {
  id?: string;
  name?: string;
  type?: string;
  desc?: string;
  /** Put it on this plane of the scope (by id). */
  plane?: string;
  /** Relative to the plane it's put on, else to its canvas. */
  at?: [number, number];
  /** Defaults to EMPTY_PLANE_SIZE. */
  size?: [number, number];
}

/** Add a plane to the canvas at `parent` (the top level, or inside a component). */
export function addPlane(
  doc: ArchDoc,
  parent: readonly string[],
  opts: AddPlaneOptions = {},
): { doc: ArchDoc; path: string[] } {
  const next = clone(doc);
  const scope = scopeFor(next, parent);
  checkPlane(scope, opts.plane, parent);
  const seed = opts.id ?? opts.name ?? opts.type?.split(".").pop() ?? "plane";
  const id = opts.id ?? uniqueId(idsIn(scope), seed);
  if (!NAME_RE.test(id)) throw new Error(`Invalid id '${id}' (need snake_case).`);
  if (idsIn(scope).has(id)) throw new Error(`Duplicate id '${id}' in '${parent.join(".")}'`);
  scope.planes.push({
    kind: "plane",
    id,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(opts.desc !== undefined ? { desc: opts.desc } : {}),
    ...(opts.plane !== undefined ? { plane: opts.plane } : {}),
    span: ZERO_SPAN,
  });
  const path = [...parent, id];
  if (opts.at) {
    next.layout.push({
      kind: "layout-entry",
      path,
      at: clampOnPlane(next, path, opts.at),
      size: opts.size ?? EMPTY_PLANE_SIZE,
      span: ZERO_SPAN,
    });
    growPlanes(next, path);
  }
  return { doc: next, path };
}

/** Remove components (with everything nested in them), their connections and layout, in place. */
function dropComponents(doc: ArchDoc, paths: readonly (readonly string[])[]): void {
  for (const path of paths) {
    const scope = scopeAt(doc, path.slice(0, -1));
    const idx = scope?.components.findIndex((c) => c.id === path[path.length - 1]) ?? -1;
    if (idx >= 0) scope!.components.splice(idx, 1);
  }
  const gone = (p: readonly string[]) => paths.some((d) => isUnder(p, d));
  doc.connections = doc.connections.filter((c) => !gone(c.source) && !gone(c.target));
  doc.layout = doc.layout.filter((e) => !gone(e.path));
}

export function removeComponent(doc: ArchDoc, path: readonly string[]): ArchDoc {
  const next = clone(doc);
  if (!findComponent(next, path)) throw new Error(`No component at '${path.join(".")}'`);
  dropComponents(next, [path]);
  return next;
}

export interface RemovePlaneOptions {
  /**
   * Keep what's on the plane: it moves onto the plane underneath (or off
   * planes altogether), where it already is on the canvas. Otherwise it's
   * deleted with the plane.
   */
  keepContents?: boolean;
}

export function removePlane(
  doc: ArchDoc,
  path: readonly string[],
  opts: RemovePlaneOptions = {},
): ArchDoc {
  const next = clone(doc);
  const scopePath = path.slice(0, -1);
  const scope = scopeFor(next, scopePath);
  const plane = scope.planes.find((p) => p.id === path[path.length - 1]);
  if (!plane) throw new Error(`No plane at '${path.join(".")}'`);
  const tree = planeTree(scope);
  const layout = layoutMap(next);
  const key = pathToString(path);
  const pathOf = (item: ItemNode) => [...scopePath, item.id];

  if (opts.keepContents) {
    const under = tree.planeOf(plane);
    const shift = layout.get(key)?.at ?? [0, 0];
    for (const item of tree.itemsOn(plane)) {
      if (under) item.plane = under.id;
      else delete item.plane;
      const e = layout.get(pathToString(pathOf(item)));
      if (e?.at) e.at = [e.at[0] + shift[0], e.at[1] + shift[1]];
    }
    scope.planes.splice(scope.planes.indexOf(plane), 1);
    next.layout = next.layout.filter((e) => pathToString(e.path) !== key);
    return next;
  }

  const planes: PlaneNode[] = [];
  const components: string[][] = [];
  const collect = (p: PlaneNode) => {
    planes.push(p);
    for (const item of tree.itemsOn(p)) {
      if (item.kind === "plane") collect(item);
      else components.push(pathOf(item));
    }
  };
  collect(plane);
  scope.planes = scope.planes.filter((p) => !planes.includes(p));
  if (scopePath.length === 0) next.planes = scope.planes;
  else findComponent(next, scopePath)!.planes = scope.planes;
  const planeKeys = new Set(planes.map((p) => pathToString(pathOf(p))));
  next.layout = next.layout.filter((e) => !planeKeys.has(pathToString(e.path)));
  dropComponents(next, components);
  return next;
}

export function renameComponent(
  doc: ArchDoc,
  path: readonly string[],
  newId: string,
): ArchDoc {
  if (!NAME_RE.test(newId)) throw new Error(`Invalid id '${newId}' (need snake_case).`);
  const next = clone(doc);
  const parent = path.slice(0, -1);
  const scope = scopeFor(next, parent);
  const node = scope.components.find((c) => c.id === path[path.length - 1]);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  if (newId !== node.id && idsIn(scope).has(newId))
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

/** Change a plane's id; what sits on it follows. */
export function renamePlane(doc: ArchDoc, path: readonly string[], newId: string): ArchDoc {
  if (!NAME_RE.test(newId)) throw new Error(`Invalid id '${newId}' (need snake_case).`);
  const next = clone(doc);
  const parent = path.slice(0, -1);
  const scope = scopeFor(next, parent);
  const old = path[path.length - 1]!;
  const plane = scope.planes.find((p) => p.id === old);
  if (!plane) throw new Error(`No plane at '${path.join(".")}'`);
  if (newId === old) return next;
  if (idsIn(scope).has(newId)) throw new Error(`Duplicate id '${newId}' in '${parent.join(".")}'`);
  plane.id = newId;
  for (const item of [...scope.components, ...scope.planes]) if (item.plane === old) item.plane = newId;
  for (const e of next.layout) if (samePath(e.path, path)) e.path = [...parent, newId];
  return next;
}

export interface ComponentMeta {
  /** undefined = leave alone; null = clear. */
  name?: string | null;
  type?: string | null;
  /** Clearing it (or setting "box") draws the default box. */
  shape?: string | null;
  /** Clearing it shows the type's glyph again, or no icon on an untyped component. */
  icon?: string | null;
  /** A palette name or #rrggbb; clearing it takes the type's color again. */
  color?: string | null;
  desc?: string | null;
  /**
   * Every place the component lives, in order: repo paths (files or folders)
   * or URLs. Entries are trimmed, and blanks and repeats dropped; null or a
   * list with nothing left clears them.
   */
  src?: readonly string[] | null;
}

export function setComponentMeta(
  doc: ArchDoc,
  path: readonly string[],
  meta: ComponentMeta,
): ArchDoc {
  if (typeof meta.shape === "string") checkShape(meta.shape);
  if (typeof meta.icon === "string") checkIcon(meta.icon);
  if (typeof meta.color === "string") checkColor(meta.color);
  const next = clone(doc);
  const node = findComponent(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'`);
  for (const key of ["name", "type", "shape", "icon", "color", "desc"] as const) {
    const v = meta[key];
    if (v === undefined) continue;
    if (v === null) delete node[key];
    else node[key] = v;
  }
  if (meta.src !== undefined) {
    const src = [...new Set((meta.src ?? []).map((s) => s.trim()).filter((s) => s !== ""))];
    if (src.length === 0) delete node.src;
    else node.src = src;
  }
  return next;
}

export interface PlaneMeta {
  /** undefined = leave alone; null = clear. */
  name?: string | null;
  type?: string | null;
  desc?: string | null;
}

export function setPlaneMeta(doc: ArchDoc, path: readonly string[], meta: PlaneMeta): ArchDoc {
  const next = clone(doc);
  const plane = findPlane(next, path);
  if (!plane) throw new Error(`No plane at '${path.join(".")}'`);
  for (const key of ["name", "type", "desc"] as const) {
    const v = meta[key];
    if (v === undefined) continue;
    if (v === null) delete plane[key];
    else plane[key] = v;
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

/** Something on a plane never sits above/left of the plane's inner origin. */
const clampOnPlane = (
  doc: ArchDoc,
  path: readonly string[],
  at: readonly [number, number],
): [number, number] =>
  planePathOf(doc, path)
    ? [Math.max(at[0], PLANE_INNER_ORIGIN[0]), Math.max(at[1], PLANE_INNER_ORIGIN[1])]
    : [at[0], at[1]];

/** Expand the planes under `path` so its rect fits inside them, innermost first. */
function growPlanes(doc: ArchDoc, path: readonly string[]): void {
  const chain = [path, ...planeChainOf(doc, path)];
  for (let i = 1; i < chain.length; i++) {
    const item = chain[i - 1]!;
    const plane = chain[i]!;
    const inner = entryFor(doc, item);
    if (!inner.at) continue;
    const innerSize = inner.size ?? LEAF_SIZE;
    const outer = entryFor(doc, plane);
    const needW = inner.at[0] + innerSize[0] + PLANE_INNER_MARGIN[0];
    const needH = inner.at[1] + innerSize[1] + PLANE_INNER_MARGIN[1];
    const size = outer.size ?? [
      PLANE_INNER_ORIGIN[0] + needW,
      PLANE_INNER_ORIGIN[1] + needH,
    ];
    outer.size = [Math.max(size[0], needW), Math.max(size[1], needH)];
  }
}

/** Move a component or plane; `at` is relative to the plane it sits on, else its canvas. */
export function moveComponent(
  doc: ArchDoc,
  path: readonly string[],
  at: [number, number],
): ArchDoc {
  const next = clone(doc);
  entryFor(next, path).at = clampOnPlane(next, path, at);
  growPlanes(next, path);
  return next;
}

/** Resize a component or plane. */
export function resizeComponent(
  doc: ArchDoc,
  path: readonly string[],
  size: [number, number],
): ArchDoc {
  const next = clone(doc);
  entryFor(next, path).size = [Math.max(size[0], 2), Math.max(size[1], 2)];
  growPlanes(next, path);
  return next;
}

/**
 * Put a component or plane on another plane of its canvas, or (`null`) on no
 * plane. Its path doesn't change. Without `at` it stays where it is on the
 * canvas; with one, `at` is relative to the new plane.
 */
export function setPlane(
  doc: ArchDoc,
  path: readonly string[],
  plane: string | null,
  at?: [number, number],
): ArchDoc {
  const next = clone(doc);
  const scopePath = path.slice(0, -1);
  const scope = scopeFor(next, scopePath);
  const id = path[path.length - 1];
  const item: ItemNode | undefined =
    scope.components.find((c) => c.id === id) ?? scope.planes.find((p) => p.id === id);
  if (!item) throw new Error(`No component or plane at '${path.join(".")}'`);
  const tree = planeTree(scope);
  const target = plane === null ? undefined : tree.plane(plane);
  if (plane !== null && !target) checkPlane(scope, plane, scopePath);
  if (item.kind === "plane")
    for (let p = target; p; p = tree.planeOf(p))
      if (p === item) throw new Error("A plane can't go on itself or on a plane that's on it.");

  const before = canvasAt(next, path);
  if (target) item.plane = target.id;
  else delete item.plane;
  const entry = entryFor(next, path);
  if (at) entry.at = at;
  else if (entry.at) {
    const origin = target ? canvasAt(next, [...scopePath, target.id]) : [0, 0];
    entry.at = [before[0] - origin[0]!, before[1] - origin[1]!];
  }
  if (entry.at) entry.at = clampOnPlane(next, path, entry.at);
  growPlanes(next, path);
  return next;
}

export interface ConnectionOptions {
  arrow?: Arrow;
  type?: string;
  label?: string;
}

/** Why `path` can't be a connection's end, or null when it can. */
function endpointProblem(doc: ArchDoc, path: readonly string[]): string | null {
  const key = pathToString(path);
  if (componentPaths(doc).has(key)) return null;
  if (planePaths(doc).has(key))
    return `'${key}' is a plane: connections join components.`;
  return `Connection endpoint '${key}' does not exist.`;
}

export function addConnection(
  doc: ArchDoc,
  source: readonly string[],
  target: readonly string[],
  opts: ConnectionOptions = {},
): ArchDoc {
  for (const p of [source, target]) {
    const problem = endpointProblem(doc, p);
    if (problem) throw new Error(problem);
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

/**
 * Move a component into another component (or up to the top level), keeping
 * its connections: the component and everything in it get new paths. It
 * lands on `plane` there when one is named, else on no plane. Without `at`
 * its position is dropped, so auto-layout finds it a spot.
 */
export function reparentComponent(
  doc: ArchDoc,
  path: readonly string[],
  newParent: readonly string[],
  at?: [number, number],
  plane?: string,
): ArchDoc {
  const targetPath = [...newParent, path[path.length - 1]!];
  if (isUnder(newParent, path))
    throw new Error("Cannot move a component into its own subtree.");
  const next = clone(doc);
  const oldScope = scopeFor(next, path.slice(0, -1));
  const idx = oldScope.components.findIndex((c) => c.id === path[path.length - 1]);
  if (idx === -1) throw new Error(`No component at '${path.join(".")}'`);
  const newScope = scopeFor(next, newParent);
  checkPlane(newScope, plane, newParent);
  const [node] = oldScope.components.splice(idx, 1);
  const taken = idsIn(newScope);
  if (taken.has(node!.id)) {
    node!.id = uniqueId(taken, node!.id);
    targetPath[targetPath.length - 1] = node!.id;
  }
  if (plane !== undefined) node!.plane = plane;
  else delete node!.plane;
  newScope.components.push(node!);
  const remap = (p: string[]): string[] =>
    isUnder(p, path) ? [...targetPath, ...p.slice(path.length)] : p;
  for (const c of next.connections) {
    c.source = remap(c.source);
    c.target = remap(c.target);
  }
  for (const e of next.layout) e.path = remap(e.path);
  if (at !== undefined) return moveComponent(next, targetPath, at);
  // Position unknown: drop stale coords so auto-layout re-places it.
  const entry = layoutMap(next).get(pathToString(targetPath));
  if (entry) delete entry.at;
  return next;
}

/** Point the connection at `index` at new endpoints (dragging either end of an edge). */
export function setConnectionEndpoints(
  doc: ArchDoc,
  index: number,
  source: readonly string[],
  target: readonly string[],
): ArchDoc {
  if (!doc.connections[index]) throw new Error(`No connection at index ${index}.`);
  for (const p of [source, target]) {
    const problem = endpointProblem(doc, p);
    if (problem) throw new Error(problem);
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

/**
 * Everything an item is inside, innermost first: the planes it sits on, the
 * component it's nested in, that component's planes, and so on up.
 */
function containers(doc: ArchDoc, path: readonly string[]): string[] {
  const out: string[] = [];
  for (let p: readonly string[] = path; p.length > 0; ) {
    for (const plane of planeChainOf(doc, p)) out.push(pathToString(plane));
    p = p.slice(0, -1);
    if (p.length > 0) out.push(pathToString(p));
  }
  return out;
}

/**
 * Existing components and planes, deduped, minus any inside another one in
 * the set (on a chosen plane, or nested in a chosen component): what an edit
 * to all of them should touch, since the rest comes along.
 */
export function outermostItems(doc: ArchDoc, paths: Paths): string[][] {
  const known = new Set([...componentPaths(doc), ...planePaths(doc)]);
  const keys = [...new Set(paths.map((p) => pathToString(p)))].filter((k) => known.has(k));
  const chosen = new Set(keys);
  return keys
    .filter((k) => !containers(doc, k.split(".")).some((c) => chosen.has(c)))
    .map((k) => k.split("."));
}

/** The scope all of `roots` are in, or an error naming the edit. */
function oneScope(roots: readonly (readonly string[])[], what: string): string[] {
  const scope = roots[0]!.slice(0, -1);
  if (roots.some((r) => !samePath(r.slice(0, -1), scope)))
    throw new Error(`${what} works on one canvas at a time: pick things from one level.`);
  return scope;
}

/** The innermost plane every one of `items` sits on (directly or further down), if any. */
function commonPlane(scope: Scope, items: readonly ItemNode[]): PlaneNode | undefined {
  const tree = planeTree(scope);
  const chains = items.map((x) => tree.chainOf(x));
  return chains[0]!.find((p) => chains.every((chain) => chain.includes(p)));
}

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
 * What a chosen item brings along: itself, and for a plane everything on it
 * (planes included), all in its scope.
 */
function withContents(scope: Scope, item: ItemNode): ItemNode[] {
  const tree = planeTree(scope);
  const out: ItemNode[] = [item];
  const walk = (p: PlaneNode) => {
    for (const x of tree.itemsOn(p)) {
      out.push(x);
      if (x.kind === "plane") walk(x);
    }
  };
  if (item.kind === "plane") walk(item);
  return out;
}

/**
 * Copy components and planes, with everything in and on them, into a
 * standalone document: the clipboard format. The chosen items become its top
 * level (ids de-duplicated), connections between what's copied come along and
 * connections that leave it don't, and the layout keeps their arrangement
 * with the top-left one at [0, 0]. Paths inside another chosen item are
 * ignored (they come with it).
 */
export function extractFragment(doc: ArchDoc, paths: Paths): ArchDoc {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermostItems(laid, paths);
  const out: ArchDoc = {
    kind: "doc",
    title: doc.title,
    version: doc.version,
    components: [],
    planes: [],
    connections: [],
    layout: [],
  };
  if (roots.length === 0) return out;
  const abs = roots.map((p) => canvasAt(laid, p, layout));
  const [minX, minY] = topLeft(abs);
  const taken = new Set<string>();
  const moves: [string[], string[]][] = [];
  roots.forEach((path, i) => {
    const scopePath = path.slice(0, -1);
    const scope = scopeAt(laid, scopePath)!;
    const tree = planeTree(scope);
    const root = findItem(laid, path)!;
    const group = withContents(scope, root);
    const ids = new Map<ItemNode, string>();
    for (const x of group) {
      const id = uniqueId(taken, x.id);
      taken.add(id);
      ids.set(x, id);
    }
    for (const x of group) {
      const copy = clone(x);
      copy.id = ids.get(x)!;
      const on = tree.planeOf(x);
      if (x === root || !on) delete copy.plane;
      else copy.plane = ids.get(on) ?? on.id;
      if (copy.kind === "component") out.components.push(copy);
      else out.planes.push(copy);
      const from = [...scopePath, x.id];
      const own = layout.get(pathToString(from));
      out.layout.push({
        kind: "layout-entry",
        path: [copy.id],
        ...(x === root
          ? { at: [abs[i]![0] - minX, abs[i]![1] - minY] as [number, number] }
          : own?.at
            ? { at: [own.at[0], own.at[1]] as [number, number] }
            : {}),
        ...(own?.size ? { size: [own.size[0], own.size[1]] as [number, number] } : {}),
        span: ZERO_SPAN,
      });
      if (x.kind === "component") moves.push([from, [copy.id]]);
    }
  });
  // What's inside the copied components comes along as it is.
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
 * the canvas at `parent`, on `plane` when one is named. Ids that clash with
 * what's there get fresh ones, connections whose ends don't resolve inside
 * the fragment are dropped, and the fragment's top-level items keep their
 * arrangement with the top-left one at `at` (default: where the fragment's
 * own layout has it). Returns the pasted top-level items' paths.
 */
export function insertFragment(
  doc: ArchDoc,
  fragment: ArchDoc,
  parent: readonly string[],
  at?: [number, number],
  plane?: string,
): { doc: ArchDoc; paths: string[][] } {
  const next = clone(doc);
  const scope = scopeFor(next, parent);
  checkPlane(scope, plane, parent);
  if (fragment.components.length === 0 && fragment.planes.length === 0)
    return { doc: next, paths: [] };
  const frag = autoLayout(fragment);
  const fragLayout = layoutMap(frag);
  const fragPaths = componentPaths(frag);
  const tree = planeTree({ components: frag.components, planes: frag.planes });
  const tops = tree.itemsOn(undefined);
  const [minX, minY] = topLeft(tops.map((x) => fragLayout.get(x.id)?.at ?? [0, 0]));
  let origin: [number, number] = at ?? [minX, minY];
  if (plane !== undefined)
    origin = [Math.max(origin[0], PLANE_INNER_ORIGIN[0]), Math.max(origin[1], PLANE_INNER_ORIGIN[1])];

  const taken = idsIn(scope);
  const ids = new Map<ItemNode, string>();
  for (const x of [...frag.components, ...frag.planes]) {
    const id = uniqueId(taken, x.id);
    taken.add(id);
    ids.set(x, id);
  }
  const moves: [string[], string[]][] = [];
  const top = new Set<string>(tops.map((x) => x.id));
  for (const x of [...frag.components, ...frag.planes]) {
    const copy = clone(x);
    copy.id = ids.get(x)!;
    const on = tree.planeOf(x);
    if (on) copy.plane = ids.get(on)!;
    else if (plane !== undefined) copy.plane = plane;
    else delete copy.plane;
    if (copy.kind === "component") scope.components.push(copy);
    else scope.planes.push(copy);
    const path = [...parent, copy.id];
    moves.push([[x.id], path]);
    const e = fragLayout.get(x.id);
    if (e) {
      const entry: LayoutEntry = { ...clone(e), path, span: ZERO_SPAN };
      if (top.has(x.id) && e.at) entry.at = [origin[0] + e.at[0] - minX, origin[1] + e.at[1] - minY];
      next.layout.push(entry);
    }
  }
  for (const e of frag.layout) {
    if (e.path.length < 2) continue;
    const to = remapUnder(e.path, moves);
    if (to) next.layout.push({ ...clone(e), path: to, span: ZERO_SPAN });
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
  const paths = tops.map((x) => [...parent, ids.get(x)!]);
  for (const p of paths) growPlanes(next, p);
  return { doc: next, paths };
}

export interface GroupOptions {
  id?: string;
  /** Display name; defaults to "Group". */
  name?: string;
  type?: string;
}

/**
 * Put components and planes on a new plane sized around them, on the plane
 * they share (if any). Everything keeps its place on the canvas, its path
 * and its connections. Returns the new plane's path.
 */
export function groupInPlane(
  doc: ArchDoc,
  paths: Paths,
  opts: GroupOptions = {},
): { doc: ArchDoc; path: string[] } {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermostItems(laid, paths);
  if (roots.length === 0) throw new Error("Nothing to group.");
  const scopePath = oneScope(roots, "Grouping");
  const scope = scopeAt(laid, scopePath)!;
  const under = commonPlane(scope, roots.map((r) => findItem(laid, r)!));
  const rects = roots.map((p) => ({
    at: canvasAt(laid, p, layout),
    size: layout.get(pathToString(p))?.size ?? LEAF_SIZE,
  }));
  const [minX, minY] = topLeft(rects.map((r) => r.at));
  const maxX = Math.max(...rects.map((r) => r.at[0] + r.size[0]));
  const maxY = Math.max(...rects.map((r) => r.at[1] + r.size[1]));
  const base = under ? canvasAt(laid, [...scopePath, under.id], layout) : [0, 0];
  // Around them, so the top-left one sits at the new plane's inner origin.
  // On a plane with no room above them, the whole group moves down together.
  let at: [number, number] = [
    minX - PLANE_INNER_ORIGIN[0] - base[0]!,
    minY - PLANE_INNER_ORIGIN[1] - base[1]!,
  ];
  if (under) at = [Math.max(at[0], PLANE_INNER_ORIGIN[0]), Math.max(at[1], PLANE_INNER_ORIGIN[1])];
  const size: [number, number] = [
    maxX - minX + PLANE_INNER_ORIGIN[0] + PLANE_INNER_MARGIN[0],
    maxY - minY + PLANE_INNER_ORIGIN[1] + PLANE_INNER_MARGIN[1],
  ];

  const name = opts.name ?? "Group";
  const { doc: withPlane, path } = addPlane(laid, scopePath, {
    id: opts.id ?? freshId(laid, scopePath, name),
    name,
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(under ? { plane: under.id } : {}),
    at,
    size,
  });
  let next = withPlane;
  rects.forEach((r, i) => {
    next = setPlane(next, roots[i]!, path[path.length - 1]!, [
      r.at[0] - minX + PLANE_INNER_ORIGIN[0],
      r.at[1] - minY + PLANE_INNER_ORIGIN[1],
    ]);
  });
  return { doc: next, path };
}

/**
 * Nest components in a new component, which takes their place on the canvas
 * (on the plane they share, if any). They keep their connections and their
 * arrangement inside it, and get new paths under it. Returns its path.
 */
export function nestInComponent(
  doc: ArchDoc,
  paths: Paths,
  opts: GroupOptions = {},
): { doc: ArchDoc; path: string[] } {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermostItems(laid, paths);
  if (roots.length === 0) throw new Error("Nothing to nest.");
  if (roots.some((r) => findItem(laid, r)?.kind === "plane"))
    throw new Error("Only components can be nested in a component. Planes stay on their canvas.");
  const scopePath = oneScope(roots, "Nesting");
  const scope = scopeAt(laid, scopePath)!;
  const under = commonPlane(scope, roots.map((r) => findItem(laid, r)!));
  const abs = roots.map((p) => canvasAt(laid, p, layout));
  const [minX, minY] = topLeft(abs);
  const base = under ? canvasAt(laid, [...scopePath, under.id], layout) : [0, 0];

  const name = opts.name ?? "Group";
  const { doc: withGroup, path } = addComponent(laid, scopePath, {
    id: opts.id ?? freshId(laid, scopePath, name),
    name,
    ...(opts.type !== undefined ? { type: opts.type } : {}),
    ...(under ? { plane: under.id } : {}),
    at: [minX - base[0]!, minY - base[1]!],
  });
  // Take the place of the first nested sibling, so document order reads naturally.
  const siblings = scopeAt(withGroup, scopePath)!.components;
  const first = siblings.findIndex((c) => roots.some((r) => r[r.length - 1] === c.id));
  if (first >= 0) siblings.splice(first, 0, siblings.pop()!);

  let next = withGroup;
  roots.forEach((r, i) => {
    next = reparentComponent(next, r, path, [abs[i]![0] - minX, abs[i]![1] - minY]);
  });
  return { doc: next, path };
}

/**
 * Turn a component into a plane in its place: what was nested in it comes up
 * a level onto the plane (ids that clash on the way get fresh ones), with
 * new, shorter paths. It must have no connections, payloads or `src` of its
 * own, since a plane can't hold them; its shape, icon and color go. Returns the plane's path.
 */
export function componentToPlane(
  doc: ArchDoc,
  path: readonly string[],
): { doc: ArchDoc; path: string[] } {
  const laid = autoLayout(doc);
  const key = pathToString(path);
  const node = findComponent(laid, path);
  if (!node) throw new Error(`No component at '${key}'`);
  const name = node.name ?? node.id;
  if (laid.connections.some((c) => pathToString(c.source) === key || pathToString(c.target) === key))
    throw new Error(`${name} has connections of its own, and a plane can't. Point them at components inside it first.`);
  if (node.payloads.length > 0) throw new Error(`${name} has payloads, and a plane can't hold them.`);
  if (node.src !== undefined) throw new Error(`${name} has a src, and a plane can't hold one.`);

  const next = clone(laid);
  const scopePath = path.slice(0, -1);
  const scope = scopeFor(next, scopePath);
  const comp = scope.components.splice(
    scope.components.findIndex((c) => c.id === node.id),
    1,
  )[0]!;
  const plane: PlaneNode = {
    kind: "plane",
    id: comp.id,
    ...(comp.name !== undefined ? { name: comp.name } : {}),
    ...(comp.type !== undefined ? { type: comp.type } : {}),
    ...(comp.desc !== undefined ? { desc: comp.desc } : {}),
    ...(comp.plane !== undefined ? { plane: comp.plane } : {}),
    span: ZERO_SPAN,
  };
  scope.planes.push(plane);

  const inner = planeTree(scopeOf(comp));
  const taken = idsIn(scope);
  const ids = new Map<ItemNode, string>();
  for (const x of [...comp.planes, ...comp.children]) {
    const id = uniqueId(taken, x.id);
    taken.add(id);
    ids.set(x, id);
  }
  const layout = layoutMap(next);
  const tops = inner.itemsOn(undefined);
  const [minX, minY] = tops.length
    ? topLeft(tops.map((x) => layout.get(pathToString([...path, x.id]))?.at ?? [0, 0]))
    : [0, 0];
  const moves: [string[], string[]][] = [];
  const planeMoves: [string[], string[]][] = [];
  for (const x of [...comp.planes, ...comp.children]) {
    const on = inner.planeOf(x);
    const from = [...path, x.id];
    x.id = ids.get(x)!;
    x.plane = on ? ids.get(on)! : plane.id;
    const to = [...scopePath, x.id];
    if (x.kind === "component") {
      scope.components.push(x);
      moves.push([from, to]);
    } else {
      scope.planes.push(x);
      planeMoves.push([from, to]);
    }
    // What sat on nothing inside now sits on the plane: from its inner origin.
    const e = layout.get(pathToString(from));
    if (!on && e?.at) e.at = [e.at[0] - minX + PLANE_INNER_ORIGIN[0], e.at[1] - minY + PLANE_INNER_ORIGIN[1]];
  }
  for (const e of next.layout) {
    const plan = planeMoves.find(([from]) => samePath(e.path, from));
    e.path = plan ? [...plan[1]] : (remapUnder(e.path, moves) ?? e.path);
  }
  for (const c of next.connections) {
    c.source = remapUnder(c.source, moves) ?? c.source;
    c.target = remapUnder(c.target, moves) ?? c.target;
  }
  // Keep the box's size: auto-layout grows the plane around what's on it
  // and moves aside whatever it then covers.
  return { doc: autoLayout(next), path: [...scopePath, plane.id] };
}

/**
 * Re-run auto-layout on components and planes and everything in them,
 * leaving the rest of the canvas where it is. Items on one plane (or loose on
 * one canvas) are arranged among themselves and keep their top-left corner;
 * when they're everything there they start at its origin instead, and a
 * plane they fill is resized to fit them.
 */
export function relayoutComponents(doc: ArchDoc, paths: Paths): ArchDoc {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const groups = new Map<string, { scope: string[]; plane: string[] | undefined; ids: Set<string> }>();
  for (const r of outermostItems(laid, paths)) {
    const plane = planePathOf(laid, r);
    const key = plane ? `plane:${pathToString(plane)}` : `canvas:${pathToString(r.slice(0, -1))}`;
    const g = groups.get(key) ?? { scope: r.slice(0, -1), plane, ids: new Set<string>() };
    g.ids.add(r[r.length - 1]!);
    groups.set(key, g);
  }

  let next = clone(laid);
  for (const g of groups.values()) {
    const scope = scopeAt(laid, g.scope)!;
    const tree = planeTree(scope);
    const on = g.plane ? tree.plane(g.plane[g.plane.length - 1]!) : undefined;
    const siblings = tree.itemsOn(on);
    const chosen = siblings.filter((x) => g.ids.has(x.id));
    const all = chosen.length === siblings.length;
    const members = chosen.flatMap((x) => withContents(scope, x));
    const memberPaths = members.map((x) => [...g.scope, x.id]);
    const boxes = members.filter((x) => x.kind === "component").map((x) => [...g.scope, x.id]);
    const under = (p: readonly string[]) => boxes.some((cp) => isUnder(p, cp));
    const strip = (p: readonly string[]) => p.slice(g.scope.length);

    const sub = autoLayout({
      ...laid,
      components: members
        .filter((x): x is ComponentNode => x.kind === "component")
        .map((x) => {
          const c = clone(x);
          if (chosen.includes(x)) delete c.plane;
          return c;
        }),
      planes: members
        .filter((x): x is PlaneNode => x.kind === "plane")
        .map((x) => {
          const p = clone(x);
          if (chosen.includes(x)) delete p.plane;
          return p;
        }),
      connections: laid.connections
        .filter((c) => under(c.source) && under(c.target))
        .map((c) => ({ ...clone(c), source: strip(c.source), target: strip(c.target) })),
      layout: [],
    });
    const subLayout = layoutMap(sub);
    const before = topLeft(chosen.map((x) => layout.get(pathToString([...g.scope, x.id]))?.at ?? [0, 0]));
    const after = topLeft(chosen.map((x) => subLayout.get(x.id)?.at ?? [0, 0]));
    const anchor: readonly [number, number] = all ? (on ? PLANE_INNER_ORIGIN : [0, 0]) : before;
    const chosenIds = new Set(chosen.map((x) => x.id));

    next.layout = next.layout.filter(
      (e) => !memberPaths.some((m) => samePath(e.path, m)) && !under(e.path),
    );
    for (const e of sub.layout) {
      const entry: LayoutEntry = { ...e, path: [...g.scope, ...e.path], span: ZERO_SPAN };
      if (e.path.length === 1 && chosenIds.has(e.path[0]!) && e.at)
        entry.at = [e.at[0] - after[0] + anchor[0], e.at[1] - after[1] + anchor[1]];
      next.layout.push(entry);
    }

    if (all && g.plane) {
      const placed = layoutMap(next);
      let w = 0;
      let h = 0;
      for (const x of chosen) {
        const e = placed.get(pathToString([...g.scope, x.id]))!;
        w = Math.max(w, e.at![0] + e.size![0]);
        h = Math.max(h, e.at![1] + e.size![1]);
      }
      entryFor(next, g.plane).size = [w + PLANE_INNER_MARGIN[0], h + PLANE_INNER_MARGIN[1]];
      growPlanes(next, g.plane);
    } else {
      for (const x of chosen) growPlanes(next, [...g.scope, x.id]);
    }
  }
  return next;
}

/**
 * Copy components and planes (with everything in and on them, and the
 * connections between what's copied) next to the originals: on the plane
 * they share, shifted by `offset` grid cells. Returns the copies' paths.
 */
export function duplicateComponents(
  doc: ArchDoc,
  paths: Paths,
  offset: [number, number] = [1, 1],
): { doc: ArchDoc; paths: string[][] } {
  const laid = autoLayout(doc);
  const layout = layoutMap(laid);
  const roots = outermostItems(laid, paths);
  if (roots.length === 0) return { doc: laid, paths: [] };
  const scopePath = oneScope(roots, "Duplicating");
  const under = commonPlane(scopeAt(laid, scopePath)!, roots.map((r) => findItem(laid, r)!));
  const base = under ? canvasAt(laid, [...scopePath, under.id], layout) : [0, 0];
  const [x, y] = topLeft(roots.map((p) => canvasAt(laid, p, layout)));
  return insertFragment(
    laid,
    extractFragment(laid, roots),
    scopePath,
    [x - base[0]! + offset[0], y - base[1]! + offset[1]],
    under?.id,
  );
}
