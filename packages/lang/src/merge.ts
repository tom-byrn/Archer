import { connectionKey } from "./diff";
import { componentPaths, planePaths, scopeOf, type Scope } from "./scope";
import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type PayloadNode,
  type PlaneNode,
} from "./types";

/**
 * Three-way semantic merge: combine the changes `ours` and `theirs` each made
 * to a common `base`. Components and planes are matched by path, payloads by
 * name and connections by `connectionKey`, so edits to different components
 * (or to different fields of one component) always merge. The same edit on
 * both sides is not a conflict.
 *
 * Conflicts: a field both sides changed differently (which plane something
 * sits on is a field), a component, plane or connection one side removed
 * while the other changed it, the same one added twice with different
 * content, a component and a plane added with one id, a connection left
 * pointing at a component the other side removed, and something left on a
 * plane the other side removed. The returned document still resolves every
 * conflict (in favor of `ours`) and is always well-formed, but callers should
 * only apply it automatically when `conflicts` is empty.
 *
 * Layout is presentation, never merged: the result keeps `ours`'s entries for
 * what survives, and anything new from `theirs` is left for auto-layout to
 * place.
 */

export interface MergeConflict {
  kind: "title" | "component" | "plane" | "connection";
  /** Dotted component or plane path, connectionKey(), or "title". */
  path: string;
  /** Human-readable, e.g. "changed desc on both sides". */
  reason: string;
}

export interface MergeResult {
  doc: ArchDoc;
  conflicts: MergeConflict[];
}

type Same<T> = (a: T | undefined, b: T | undefined) => boolean;

/** Pick the side that changed; a conflict when both changed it differently (ours wins). */
function merge3<T>(
  base: T | undefined,
  ours: T | undefined,
  theirs: T | undefined,
  same: Same<T>,
): { value: T | undefined; conflict: boolean } {
  if (same(ours, theirs)) return { value: ours, conflict: false };
  if (same(base, ours)) return { value: theirs, conflict: false };
  if (same(base, theirs)) return { value: ours, conflict: false };
  return { value: ours, conflict: true };
}

const sameValue = <T>(a: T | undefined, b: T | undefined) => a === b;

const samePayload: Same<PayloadNode> = (a, b) =>
  a === undefined || b === undefined
    ? a === b
    : a.format === b.format && a.content === b.content;

const samePayloads = (a: PayloadNode[], b: PayloadNode[]): boolean => {
  if (a.length !== b.length) return false;
  const byName = new Map(a.map((p) => [p.name, p]));
  return b.every((p) => samePayload(byName.get(p.name), p));
};

const OWN_FIELDS = ["name", "type", "shape", "desc", "src", "plane"] as const;
const PLANE_FIELDS = ["name", "type", "desc", "plane"] as const;

const samePlane = (a: PlaneNode, b: PlaneNode): boolean =>
  PLANE_FIELDS.every((f) => a[f] === b[f]);

/** Same scope, everything in it compared, ignoring order. */
function sameScope(a: Scope, b: Scope): boolean {
  if (a.components.length !== b.components.length || a.planes.length !== b.planes.length)
    return false;
  const planes = new Map(b.planes.map((p) => [p.id, p]));
  if (!a.planes.every((p) => planes.has(p.id) && samePlane(p, planes.get(p.id)!))) return false;
  const other = new Map(b.components.map((c) => [c.id, c]));
  return a.components.every((c) => {
    const o = other.get(c.id);
    return o !== undefined && sameTree(c, o);
  });
}

/** Same component, own fields and everything nested in it. */
function sameTree(a: ComponentNode, b: ComponentNode): boolean {
  for (const field of OWN_FIELDS) if (a[field] !== b[field]) return false;
  if (!samePayloads(a.payloads, b.payloads)) return false;
  return sameScope(scopeOf(a), scopeOf(b));
}

/** Keys of `theirs` in its order, then keys only `ours` has, in its order. */
const unionOrder = (theirs: string[], ours: string[]): string[] => {
  const seen = new Set(theirs);
  return [...theirs, ...ours.filter((k) => !seen.has(k))];
};

class Conflicts {
  private byKey = new Map<string, MergeConflict>();
  add(kind: MergeConflict["kind"], path: string, reason: string): void {
    const key = `${kind}:${path}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (!existing.reason.split("; ").includes(reason)) existing.reason += `; ${reason}`;
    } else {
      this.byKey.set(key, { kind, path, reason });
    }
  }
  list(): MergeConflict[] {
    return [...this.byKey.values()];
  }
}

function mergePayloads(
  base: PayloadNode[] | undefined,
  ours: PayloadNode[],
  theirs: PayloadNode[],
  onConflict: (name: string) => void,
): PayloadNode[] {
  const b = new Map((base ?? []).map((p) => [p.name, p]));
  const o = new Map(ours.map((p) => [p.name, p]));
  const t = new Map(theirs.map((p) => [p.name, p]));
  const out: PayloadNode[] = [];
  for (const name of unionOrder(theirs.map((p) => p.name), ours.map((p) => p.name))) {
    const r = merge3(b.get(name), o.get(name), t.get(name), samePayload);
    if (r.conflict) onConflict(name);
    if (r.value) out.push(r.value);
  }
  return out;
}

function mergeComponent(
  b: ComponentNode | undefined,
  o: ComponentNode | undefined,
  t: ComponentNode | undefined,
  path: string,
  conflicts: Conflicts,
): ComponentNode | null {
  if (o && t) {
    const merged: ComponentNode = { ...o };
    for (const field of OWN_FIELDS) {
      const r = merge3(b?.[field], o[field], t[field], sameValue);
      if (r.conflict) conflicts.add("component", path, `changed ${field} on both sides`);
      if (r.value === undefined) delete merged[field];
      else merged[field] = r.value;
    }
    merged.payloads = mergePayloads(b?.payloads, o.payloads, t.payloads, (name) =>
      conflicts.add("component", path, `changed payload ${name} on both sides`),
    );
    const inside = mergeScope(b && scopeOf(b), scopeOf(o), scopeOf(t), path, conflicts);
    merged.children = inside.components;
    merged.planes = inside.planes;
    return merged;
  }
  if (o) {
    if (!b) return o; // added by ours
    if (sameTree(b, o)) return null; // theirs removed it; ours left it alone
    conflicts.add("component", path, "removed on one side, changed on the other");
    return o;
  }
  if (t) {
    if (!b) return t; // added by theirs
    if (sameTree(b, t)) return null; // ours removed it; theirs left it alone
    conflicts.add("component", path, "removed on one side, changed on the other");
    return null;
  }
  return null; // removed on both sides
}

function mergePlane(
  b: PlaneNode | undefined,
  o: PlaneNode | undefined,
  t: PlaneNode | undefined,
  path: string,
  conflicts: Conflicts,
): PlaneNode | null {
  if (o && t) {
    const merged: PlaneNode = { ...o };
    for (const field of PLANE_FIELDS) {
      const r = merge3(b?.[field], o[field], t[field], sameValue);
      if (r.conflict) conflicts.add("plane", path, `changed ${field} on both sides`);
      if (r.value === undefined) delete merged[field];
      else merged[field] = r.value;
    }
    return merged;
  }
  if (o) {
    if (!b) return o;
    if (samePlane(b, o)) return null;
    conflicts.add("plane", path, "removed on one side, changed on the other");
    return o;
  }
  if (t) {
    if (!b) return t;
    if (samePlane(b, t)) return null;
    conflicts.add("plane", path, "removed on one side, changed on the other");
    return null;
  }
  return null;
}

/** Merge one canvas: its components and its planes. */
function mergeScope(
  base: Scope | undefined,
  ours: Scope,
  theirs: Scope,
  prefix: string,
  conflicts: Conflicts,
): Scope {
  const at = (id: string) => (prefix ? `${prefix}.${id}` : id);

  const bc = new Map((base?.components ?? []).map((c) => [c.id, c]));
  const oc = new Map(ours.components.map((c) => [c.id, c]));
  const tc = new Map(theirs.components.map((c) => [c.id, c]));
  const components: ComponentNode[] = [];
  for (const id of unionOrder(theirs.components.map((c) => c.id), ours.components.map((c) => c.id))) {
    const node = mergeComponent(bc.get(id), oc.get(id), tc.get(id), at(id), conflicts);
    if (node) components.push(node);
  }

  const bp = new Map((base?.planes ?? []).map((p) => [p.id, p]));
  const op = new Map(ours.planes.map((p) => [p.id, p]));
  const tp = new Map(theirs.planes.map((p) => [p.id, p]));
  let planes: PlaneNode[] = [];
  for (const id of unionOrder(theirs.planes.map((p) => p.id), ours.planes.map((p) => p.id))) {
    const node = mergePlane(bp.get(id), op.get(id), tp.get(id), at(id), conflicts);
    if (node) planes.push(node);
  }

  // One id, a component on one side and a plane on the other: keep ours.
  const componentIds = new Set(components.map((c) => c.id));
  const clashing = planes.filter((p) => componentIds.has(p.id));
  for (const p of clashing) conflicts.add("plane", at(p.id), "a component and a plane were added with this id");
  const keepPlane = (p: PlaneNode) => op.has(p.id) && !oc.has(p.id);
  planes = planes.filter((p) => !componentIds.has(p.id) || keepPlane(p));
  const kept = components.filter((c) => !clashing.some((p) => p.id === c.id && keepPlane(p)));

  // Something left on a plane the other side removed goes on no plane.
  const planeIds = new Set(planes.map((p) => p.id));
  const unplace = <T extends ComponentNode | PlaneNode>(item: T): T => {
    if (item.plane === undefined || planeIds.has(item.plane)) return item;
    conflicts.add(item.kind, at(item.id), "sits on a plane the other side removed");
    const copy = { ...item };
    delete copy.plane;
    return copy;
  };
  return { components: kept.map(unplace), planes: planes.map(unplace) };
}

function mergeConnections(
  base: ConnectionNode[],
  ours: ConnectionNode[],
  theirs: ConnectionNode[],
  conflicts: Conflicts,
): ConnectionNode[] {
  const b = new Map(base.map((c) => [connectionKey(c), c]));
  const o = new Map(ours.map((c) => [connectionKey(c), c]));
  const t = new Map(theirs.map((c) => [connectionKey(c), c]));
  const out: ConnectionNode[] = [];
  for (const key of unionOrder([...t.keys()], [...o.keys()])) {
    const bc = b.get(key);
    const oc = o.get(key);
    const tc = t.get(key);
    if (oc && tc) {
      out.push({
        ...oc,
        payloads: mergePayloads(bc?.payloads, oc.payloads, tc.payloads, (name) =>
          conflicts.add("connection", key, `changed payload ${name} on both sides`),
        ),
      });
    } else if (oc) {
      if (!bc) out.push(oc);
      else if (!samePayloads(bc.payloads, oc.payloads)) {
        conflicts.add("connection", key, "removed on one side, changed on the other");
        out.push(oc);
      }
    } else if (tc) {
      if (!bc) out.push(tc);
      else if (!samePayloads(bc.payloads, tc.payloads))
        conflicts.add("connection", key, "removed on one side, changed on the other");
    }
  }
  return out;
}

export function mergeDocs(base: ArchDoc, ours: ArchDoc, theirs: ArchDoc): MergeResult {
  const conflicts = new Conflicts();

  const title = merge3(base.title, ours.title, theirs.title, sameValue);
  if (title.conflict) conflicts.add("title", "title", "renamed on both sides");

  const top = mergeScope(
    { components: base.components, planes: base.planes },
    { components: ours.components, planes: ours.planes },
    { components: theirs.components, planes: theirs.planes },
    "",
    conflicts,
  );
  const merged: ArchDoc = {
    kind: "doc",
    title: title.value ?? ours.title,
    version: ours.version,
    components: top.components,
    planes: top.planes,
    connections: [],
    layout: [],
  };
  const paths = componentPaths(merged);
  const planes = planePaths(merged);

  // A connection is only as good as its endpoints: one side may have removed
  // a component the other side's new connection points at.
  merged.connections = mergeConnections(base.connections, ours.connections, theirs.connections, conflicts).filter(
    (c) => {
      const ok = paths.has(pathToString(c.source)) && paths.has(pathToString(c.target));
      if (!ok) conflicts.add("connection", connectionKey(c), "points at a component the other side removed");
      return ok;
    },
  );
  merged.layout = ours.layout.filter((e) => {
    const key = pathToString(e.path);
    return paths.has(key) || planes.has(key);
  });

  return { doc: merged, conflicts: conflicts.list() };
}
