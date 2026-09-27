import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type LayoutEntry,
  type PayloadNode,
  type PlaneNode,
} from "./types";
import { findComponent, planeTree, scopeOf, type Scope } from "./scope";
import { normalizeLayout } from "./validate";
import { layoutMap } from "./layout";

/**
 * Semantic diff between two documents. Layout is never a change — moving
 * nodes around the canvas is presentation, not architecture. Which plane a
 * component sits on is: planes are declared in the text, by the author.
 */

export type ChangeKind = "added" | "removed" | "changed";

export interface ComponentChange {
  /** Dotted path. */
  path: string;
  kind: ChangeKind;
  /** For "changed": which own fields differ — any of "name" | "type" | "shape" | "desc" | "src" | "payloads" | "plane". */
  fields?: string[];
}

export interface PlaneChange {
  /** Dotted path: its scope's path, then its id. */
  path: string;
  kind: ChangeKind;
  /** For "changed": any of "name" | "type" | "desc" | "plane" (the plane it sits on). */
  fields?: string[];
}

export interface ConnectionChange {
  /** connectionKey() of the connection. */
  key: string;
  /** "changed" = same identity (endpoints/arrow/type/label) but different payloads. */
  kind: ChangeKind;
  connection: ConnectionNode;
}

export interface DocDiff {
  title?: { from: string; to: string };
  /** Document order of `next`, then removed ones in `base` order. */
  components: ComponentChange[];
  /** Same order as components. */
  planes: PlaneChange[];
  connections: ConnectionChange[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  connectionsAdded: number;
  connectionsRemoved: number;
  connectionsChanged: number;
  planesAdded: number;
  planesRemoved: number;
  planesChanged: number;
}

/** Identity of a connection independent of position: source|arrow|target|type|label. */
export function connectionKey(c: ConnectionNode): string {
  return [
    pathToString(c.source),
    c.arrow,
    pathToString(c.target),
    c.type ?? "",
    c.label ?? "",
  ].join("|");
}

/** Same `src` list: the same places in the same order (absent and empty alike). */
export const sameSources = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean => {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((s, i) => s === y[i]);
};

interface Placed<T> {
  node: T;
  /** Id of the plane it sits on, resolved (see PlaneTree). */
  plane?: string;
}

/**
 * Every component and plane by path, with the plane each sits on. Document
 * order: a component, then what's nested in it.
 */
const flatten = (doc: ArchDoc) => {
  const components = new Map<string, Placed<ComponentNode>>();
  const planes = new Map<string, Placed<PlaneNode>>();
  const walk = (path: string[], scope: Scope) => {
    const tree = planeTree(scope);
    const pre = path.length === 0 ? "" : `${path.join(".")}.`;
    for (const p of scope.planes) planes.set(pre + p.id, { node: p, plane: tree.planeOf(p)?.id });
    for (const c of scope.components) {
      components.set(pre + c.id, { node: c, plane: tree.planeOf(c)?.id });
      walk([...path, c.id], scopeOf(c));
    }
  };
  walk([], { components: doc.components, planes: doc.planes });
  return { components, planes };
};

const payloadsEqual = (
  a: { payloads: PayloadNode[] },
  b: { payloads: PayloadNode[] },
): boolean => {
  if (a.payloads.length !== b.payloads.length) return false;
  const byName = new Map(a.payloads.map((p) => [p.name, p]));
  for (const p of b.payloads) {
    const q = byName.get(p.name);
    if (!q || q.format !== p.format || q.content !== p.content) return false;
  }
  return true;
};

const changedFields = (a: Placed<ComponentNode>, b: Placed<ComponentNode>): string[] => {
  const fields: string[] = [];
  for (const f of ["name", "type", "shape", "desc"] as const)
    if (a.node[f] !== b.node[f]) fields.push(f);
  if (!sameSources(a.node.src, b.node.src)) fields.push("src");
  if (!payloadsEqual(a.node, b.node)) fields.push("payloads");
  if (a.plane !== b.plane) fields.push("plane");
  return fields;
};

const changedPlaneFields = (a: Placed<PlaneNode>, b: Placed<PlaneNode>): string[] => {
  const fields: string[] = [];
  for (const f of ["name", "type", "desc"] as const) if (a.node[f] !== b.node[f]) fields.push(f);
  if (a.plane !== b.plane) fields.push("plane");
  return fields;
};

function diffMaps<T>(
  before: Map<string, Placed<T>>,
  after: Map<string, Placed<T>>,
  fields: (a: Placed<T>, b: Placed<T>) => string[],
): { path: string; kind: ChangeKind; fields?: string[] }[] {
  const out: { path: string; kind: ChangeKind; fields?: string[] }[] = [];
  for (const [path, node] of after) {
    const prev = before.get(path);
    if (!prev) {
      out.push({ path, kind: "added" });
      continue;
    }
    const changed = fields(prev, node);
    if (changed.length > 0) out.push({ path, kind: "changed", fields: changed });
  }
  for (const path of before.keys()) if (!after.has(path)) out.push({ path, kind: "removed" });
  return out;
}

export function diffDocs(base: ArchDoc, next: ArchDoc): DocDiff {
  const before = flatten(base);
  const after = flatten(next);

  const beforeConns = new Map(base.connections.map((c) => [connectionKey(c), c]));
  const afterConns = new Map(next.connections.map((c) => [connectionKey(c), c]));
  const connections: ConnectionChange[] = [];
  for (const [key, connection] of afterConns) {
    const prev = beforeConns.get(key);
    if (!prev) connections.push({ key, kind: "added", connection });
    else if (!payloadsEqual(prev, connection))
      connections.push({ key, kind: "changed", connection });
  }
  for (const [key, connection] of beforeConns) {
    if (!afterConns.has(key)) connections.push({ key, kind: "removed", connection });
  }

  return {
    ...(base.title !== next.title ? { title: { from: base.title, to: next.title } } : {}),
    components: diffMaps(before.components, after.components, changedFields),
    planes: diffMaps(before.planes, after.planes, changedPlaneFields),
    connections,
  };
}

export function summarizeDiff(diff: DocDiff): DiffSummary {
  const s: DiffSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    connectionsAdded: 0,
    connectionsRemoved: 0,
    connectionsChanged: 0,
    planesAdded: 0,
    planesRemoved: 0,
    planesChanged: 0,
  };
  for (const c of diff.components) s[c.kind]++;
  for (const c of diff.connections) {
    if (c.kind === "added") s.connectionsAdded++;
    else if (c.kind === "removed") s.connectionsRemoved++;
    else s.connectionsChanged++;
  }
  for (const p of diff.planes) {
    if (p.kind === "added") s.planesAdded++;
    else if (p.kind === "removed") s.planesRemoved++;
    else s.planesChanged++;
  }
  return s;
}

export const isEmptyDiff = (d: DocDiff): boolean =>
  d.title === undefined &&
  d.components.length === 0 &&
  d.planes.length === 0 &&
  d.connections.length === 0;

/**
 * Build a renderable "diff view": `next` plus every component, plane and
 * connection that was removed since `base` (re-inserted where it was, with
 * its original layout entry so it renders where it used to be), and status
 * maps. A removed component or plane is only re-inserted when the canvas it
 * was on still exists (or was itself re-inserted) and its id is free there;
 * it goes back on its plane when that plane is there. Layout: `base`'s
 * (normalized) entries for re-inserted paths; `next`'s for everything else.
 */
export function mergeForDiff(
  base: ArchDoc,
  next: ArchDoc,
): {
  doc: ArchDoc;
  components: Map<string, ChangeKind>;
  planes: Map<string, ChangeKind>;
  connections: Map<string, ChangeKind>;
} {
  const diff = diffDocs(base, next);
  const doc: ArchDoc = structuredClone(next);
  const components = new Map<string, ChangeKind>();
  const planes = new Map<string, ChangeKind>();
  const connections = new Map<string, ChangeKind>();

  for (const c of diff.components) if (c.kind !== "removed") components.set(c.path, c.kind);
  for (const p of diff.planes) if (p.kind !== "removed") planes.set(p.path, p.kind);
  const removedComponents = new Set(diff.components.filter((c) => c.kind === "removed").map((c) => c.path));
  const removedPlanes = new Set(diff.planes.filter((p) => p.kind === "removed").map((p) => p.path));

  const baseLayout = layoutMap(normalizeLayout(base));
  const restoreLayout = (path: string) => {
    const entry = baseLayout.get(path);
    if (!entry) return;
    const layoutEntry: LayoutEntry = { ...structuredClone(entry), path: path.split(".") };
    doc.layout = [...doc.layout.filter((e) => pathToString(e.path) !== path), layoutEntry];
  };

  const reinsert = (path: string[], from: Scope, into: Scope) => {
    const tree = planeTree(from);
    const taken = () => new Set([...into.components.map((c) => c.id), ...into.planes.map((p) => p.id)]);
    const onPlane = <T extends { plane?: string }>(copy: T, original: ComponentNode | PlaneNode): T => {
      const on = tree.planeOf(original);
      if (on && into.planes.some((p) => p.id === on.id)) copy.plane = on.id;
      else delete copy.plane;
      return copy;
    };
    // Planes first (a parent plane before the planes on it), so what was on
    // a removed plane can go back on it.
    for (const p of from.planes) {
      const key = [...path, p.id].join(".");
      if (!removedPlanes.has(key) || taken().has(p.id)) continue;
      into.planes.push(onPlane(structuredClone(p), p));
      planes.set(key, "removed");
      restoreLayout(key);
    }
    for (const c of from.components) {
      const key = [...path, c.id].join(".");
      if (removedComponents.has(key)) {
        if (taken().has(c.id)) continue;
        // A shallow copy: what was inside comes back through its own entries.
        const copy = onPlane({ ...structuredClone(c), children: [], planes: [] }, c);
        into.components.push(copy);
        components.set(key, "removed");
        restoreLayout(key);
        reinsert([...path, c.id], scopeOf(c), scopeOf(copy));
      } else {
        const kept = into.components.find((x) => x.id === c.id);
        if (kept) reinsert([...path, c.id], scopeOf(c), scopeOf(kept));
      }
    }
  };
  reinsert(
    [],
    { components: base.components, planes: base.planes },
    { components: doc.components, planes: doc.planes },
  );

  // Connections: keep next's, re-add removed ones whose endpoints now exist.
  for (const c of diff.connections) {
    if (c.kind !== "removed") {
      connections.set(c.key, c.kind);
      continue;
    }
    const exists = (p: readonly string[]) => findComponent(doc, p) !== undefined;
    if (!exists(c.connection.source) || !exists(c.connection.target)) continue;
    doc.connections.push(structuredClone(c.connection));
    connections.set(c.key, "removed");
  }

  return { doc, components, planes, connections };
}
