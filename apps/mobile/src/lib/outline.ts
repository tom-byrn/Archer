/**
 * The document as lists: what sits on a canvas (planes as headings over what
 * sits on them, in the canvas's canonical order), and every component in the
 * document for search. Pure, tested in test/outline.test.ts.
 */

import {
  findComponent,
  forEachScope,
  planeTree,
  type ArchDoc,
  type ComponentNode,
  type PlaneNode,
  type Scope,
} from "@archer/lang";

export interface CanvasRow {
  kind: "component" | "plane";
  /** Full dot-path of a component; a plane's scope path plus its id. */
  path: string[];
  node: ComponentNode | PlaneNode;
  /** How many planes it sits inside on this canvas. */
  depth: number;
}

/** What's on one canvas (the document's top level, or a component's inside), plane by plane. */
export function canvasRows(scope: Scope, scopePath: readonly string[] = []): CanvasRow[] {
  const tree = planeTree(scope);
  const rows: CanvasRow[] = [];
  const walk = (on: PlaneNode | undefined, depth: number) => {
    for (const item of tree.itemsOn(on)) {
      rows.push({ kind: item.kind, path: [...scopePath, item.id], node: item, depth });
      if (item.kind === "plane") walk(item, depth + 1);
    }
  };
  walk(undefined, 0);
  return rows;
}

export interface ComponentEntry {
  path: string[];
  node: ComponentNode;
}

/** Every component in the document, depth first in canonical order. */
export function allComponents(doc: ArchDoc): ComponentEntry[] {
  const out: ComponentEntry[] = [];
  const visit = (scope: Scope, prefix: string[]) => {
    for (const row of canvasRows(scope, prefix)) {
      if (row.kind !== "component") continue;
      const node = row.node as ComponentNode;
      out.push({ path: row.path, node });
      visit({ components: node.children, planes: node.planes }, row.path);
    }
  };
  visit(doc, []);
  return out;
}

/** Components whose name, id, type or description mention `query` (case-insensitive). */
export function searchComponents(doc: ArchDoc, query: string): ComponentEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  return allComponents(doc).filter(({ path, node }) =>
    [node.name, path.join("."), node.type, node.desc].some((s) => s?.toLowerCase().includes(q)),
  );
}

/** The components a path walks through, outermost first, each with its own path. */
export function trail(doc: ArchDoc, path: readonly string[]): ComponentEntry[] {
  const out: ComponentEntry[] = [];
  for (let i = 1; i <= path.length; i++) {
    const p = path.slice(0, i);
    const node = findComponent(doc, p);
    if (!node) break;
    out.push({ path: p, node });
  }
  return out;
}

export interface DocStats {
  components: number;
  planes: number;
  connections: number;
}

export function docStats(doc: ArchDoc): DocStats {
  let components = 0;
  let planes = 0;
  forEachScope(doc, (_path, scope) => {
    components += scope.components.length;
    planes += scope.planes.length;
  });
  return { components, planes, connections: doc.connections.length };
}

/** A component's display name: its name, else its id. */
export const displayName = (node: { id: string; name?: string }): string => node.name ?? node.id;
