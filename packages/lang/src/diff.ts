import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type LayoutEntry,
  type PayloadNode,
} from "./types";
import { findComponent, normalizeLayout } from "./validate";
import { layoutMap } from "./layout";

/**
 * Semantic diff between two documents. Layout is never a change — moving
 * nodes around the canvas is presentation, not architecture.
 */

export type ChangeKind = "added" | "removed" | "changed";

export interface ComponentChange {
  /** Dotted path. */
  path: string;
  kind: ChangeKind;
  /** For "changed": which own fields differ — any of "name" | "type" | "shape" | "desc" | "src" | "payloads". */
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
  connections: ConnectionChange[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  connectionsAdded: number;
  connectionsRemoved: number;
  connectionsChanged: number;
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

/** Flatten a component tree into (path, node) pairs in document order. */
const flatten = (doc: ArchDoc): Map<string, ComponentNode> => {
  const out = new Map<string, ComponentNode>();
  const walk = (nodes: ComponentNode[], prefix: string) => {
    for (const n of nodes) {
      const p = prefix === "" ? n.id : `${prefix}.${n.id}`;
      out.set(p, n);
      walk(n.children, p);
    }
  };
  walk(doc.components, "");
  return out;
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

const changedFields = (a: ComponentNode, b: ComponentNode): string[] => {
  const fields: string[] = [];
  if (a.name !== b.name) fields.push("name");
  if (a.type !== b.type) fields.push("type");
  if (a.shape !== b.shape) fields.push("shape");
  if (a.desc !== b.desc) fields.push("desc");
  if (!sameSources(a.src, b.src)) fields.push("src");
  if (!payloadsEqual(a, b)) fields.push("payloads");
  return fields;
};

export function diffDocs(base: ArchDoc, next: ArchDoc): DocDiff {
  const before = flatten(base);
  const after = flatten(next);

  const components: ComponentChange[] = [];
  for (const [path, node] of after) {
    const prev = before.get(path);
    if (!prev) {
      components.push({ path, kind: "added" });
      continue;
    }
    const fields = changedFields(prev, node);
    if (fields.length > 0) components.push({ path, kind: "changed", fields });
  }
  for (const path of before.keys()) {
    if (!after.has(path)) components.push({ path, kind: "removed" });
  }

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
    components,
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
  };
  for (const c of diff.components) s[c.kind]++;
  for (const c of diff.connections) {
    if (c.kind === "added") s.connectionsAdded++;
    else if (c.kind === "removed") s.connectionsRemoved++;
    else s.connectionsChanged++;
  }
  return s;
}

export const isEmptyDiff = (d: DocDiff): boolean =>
  d.title === undefined && d.components.length === 0 && d.connections.length === 0;

/**
 * Build a renderable "diff view": `next` plus every component and connection
 * that was removed since `base` (re-inserted under its original parent, with
 * its original layout entry so it renders where it used to be), and status
 * maps. A removed component whose parent was also removed is re-inserted
 * inside the re-inserted parent. If a removed component's original parent no
 * longer exists and was not itself re-inserted, it is skipped. Layout: `base`'s
 * (normalized) entries for removed paths; `next`'s for everything else.
 */
export function mergeForDiff(
  base: ArchDoc,
  next: ArchDoc,
): {
  doc: ArchDoc;
  components: Map<string, ChangeKind>;
  connections: Map<string, ChangeKind>;
} {
  const diff = diffDocs(base, next);
  const doc: ArchDoc = structuredClone(next);
  const components = new Map<string, ChangeKind>();
  const connections = new Map<string, ChangeKind>();

  for (const c of diff.components) {
    if (c.kind !== "removed") components.set(c.path, c.kind);
  }

  // Re-insert removed components. Removed paths come in `base` document order,
  // so a parent is always processed before its children.
  const baseLayout = layoutMap(normalizeLayout(base));
  const reinserted = new Set<string>();
  const removedPaths = diff.components.filter((c) => c.kind === "removed").map((c) => c.path);
  for (const path of removedPaths) {
    const segs = path.split(".");
    const parentSegs = segs.slice(0, -1);
    const original = findComponent(base, segs);
    if (!original) continue;
    const parentPath = parentSegs.join(".");
    let siblings: ComponentNode[];
    if (parentSegs.length === 0) {
      siblings = doc.components;
    } else {
      const parentExistsInNext = findComponent(next, parentSegs) !== undefined;
      if (!parentExistsInNext && !reinserted.has(parentPath)) continue;
      const parent = findComponent(doc, parentSegs);
      if (!parent) continue;
      siblings = parent.children;
    }
    // Insert a shallow copy (children are re-added by their own removed entries).
    const copy: ComponentNode = { ...structuredClone(original), children: [] };
    siblings.push(copy);
    reinserted.add(path);
    components.set(path, "removed");
    const entry = baseLayout.get(path);
    if (entry) {
      const layoutEntry: LayoutEntry = { ...structuredClone(entry), path: [...segs] };
      doc.layout = [
        ...doc.layout.filter((e) => pathToString(e.path) !== path),
        layoutEntry,
      ];
    }
  }

  // Connections: keep next's, re-add removed ones whose endpoints now exist.
  for (const c of diff.connections) {
    if (c.kind !== "removed") {
      connections.set(c.key, c.kind);
      continue;
    }
    const src = pathToString(c.connection.source);
    const tgt = pathToString(c.connection.target);
    const exists = (p: string) =>
      findComponent(doc, p.split(".")) !== undefined;
    if (!exists(src) || !exists(tgt)) continue;
    doc.connections.push(structuredClone(c.connection));
    connections.set(c.key, "removed");
  }

  return { doc, components, connections };
}
