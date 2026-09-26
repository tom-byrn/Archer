import { connectionKey } from "./diff";
import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type PayloadNode,
} from "./types";

/**
 * Three-way semantic merge: combine the changes `ours` and `theirs` each made
 * to a common `base`. Components are matched by dot-path, payloads by name and
 * connections by `connectionKey`, so edits to different components (or to
 * different fields of one component) always merge. The same edit on both sides
 * is not a conflict.
 *
 * Conflicts: a field both sides changed differently, a component (or
 * connection) one side removed while the other changed it, the same component
 * added twice with different content, and a connection left pointing at a
 * component the other side removed. The returned document still resolves every
 * conflict (in favor of `ours`) and is always well-formed, but callers should
 * only apply it automatically when `conflicts` is empty.
 *
 * Layout is presentation, never merged: the result keeps `ours`'s entries for
 * the components that survive, and anything new from `theirs` is left for
 * auto-layout to place.
 */

export interface MergeConflict {
  kind: "title" | "component" | "connection";
  /** Dotted component path, connectionKey(), or "title". */
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

const OWN_FIELDS = ["name", "type", "shape", "desc", "src"] as const;

/** Same component, own fields and whole subtree, ignoring child order. */
function sameTree(a: ComponentNode, b: ComponentNode): boolean {
  for (const field of OWN_FIELDS) if (a[field] !== b[field]) return false;
  if (!samePayloads(a.payloads, b.payloads)) return false;
  if (a.children.length !== b.children.length) return false;
  const other = new Map(b.children.map((c) => [c.id, c]));
  return a.children.every((c) => {
    const o = other.get(c.id);
    return o !== undefined && sameTree(c, o);
  });
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
    merged.children = mergeChildren(b?.children, o.children, t.children, path, conflicts);
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

function mergeChildren(
  base: ComponentNode[] | undefined,
  ours: ComponentNode[],
  theirs: ComponentNode[],
  prefix: string,
  conflicts: Conflicts,
): ComponentNode[] {
  const b = new Map((base ?? []).map((c) => [c.id, c]));
  const o = new Map(ours.map((c) => [c.id, c]));
  const t = new Map(theirs.map((c) => [c.id, c]));
  const out: ComponentNode[] = [];
  for (const id of unionOrder(theirs.map((c) => c.id), ours.map((c) => c.id))) {
    const node = mergeComponent(b.get(id), o.get(id), t.get(id), prefix ? `${prefix}.${id}` : id, conflicts);
    if (node) out.push(node);
  }
  return out;
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

const collectPaths = (nodes: ComponentNode[], prefix = "", into = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    const p = prefix ? `${prefix}.${n.id}` : n.id;
    into.add(p);
    collectPaths(n.children, p, into);
  }
  return into;
};

export function mergeDocs(base: ArchDoc, ours: ArchDoc, theirs: ArchDoc): MergeResult {
  const conflicts = new Conflicts();

  const title = merge3(base.title, ours.title, theirs.title, sameValue);
  if (title.conflict) conflicts.add("title", "title", "renamed on both sides");

  const components = mergeChildren(base.components, ours.components, theirs.components, "", conflicts);
  const paths = collectPaths(components);

  // A connection is only as good as its endpoints: one side may have removed
  // a component the other side's new connection points at.
  const connections = mergeConnections(base.connections, ours.connections, theirs.connections, conflicts).filter(
    (c) => {
      const ok = paths.has(pathToString(c.source)) && paths.has(pathToString(c.target));
      if (!ok) conflicts.add("connection", connectionKey(c), "points at a component the other side removed");
      return ok;
    },
  );

  return {
    doc: {
      kind: "doc",
      title: title.value ?? ours.title,
      version: ours.version,
      components,
      connections,
      layout: ours.layout.filter((e) => paths.has(pathToString(e.path))),
    },
    conflicts: conflicts.list(),
  };
}
