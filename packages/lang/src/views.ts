import { remapSequencePaths, sequenceParticipants } from "./sequence";
import {
  pathToString,
  type ArchDoc,
  type FlowNode,
  type MachineNode,
  type ModelNode,
  type SequenceNode,
  type ViewKind,
  type ViewNode,
} from "./types";

/**
 * Views (spec §6): the diagrams a document holds besides its architecture —
 * sequences, flows, state machines and data models. They share one id
 * namespace, so `id` alone names a view.
 */

export interface ViewRef {
  kind: ViewKind;
  node: ViewNode;
}

export const VIEW_KINDS: readonly ViewKind[] = ["sequence", "flow", "states", "entities"];

/** What each kind is called, for people: menus, the switcher, messages. */
export const VIEW_LABELS: Record<ViewKind, { one: string; many: string }> = {
  sequence: { one: "sequence", many: "Sequences" },
  flow: { one: "flow", many: "Flows" },
  states: { one: "state machine", many: "State machines" },
  entities: { one: "data model", many: "Data models" },
};

/** Every view, kind by kind in canonical order, each kind in document order. */
export function allViews(doc: ArchDoc): ViewRef[] {
  return [
    ...doc.sequences.map((node) => ({ kind: "sequence" as const, node })),
    ...doc.flows.map((node) => ({ kind: "flow" as const, node })),
    ...doc.machines.map((node) => ({ kind: "states" as const, node })),
    ...doc.models.map((node) => ({ kind: "entities" as const, node })),
  ];
}

export function findView(doc: ArchDoc, id: string): ViewRef | undefined {
  return allViews(doc).find((v) => v.node.id === id);
}

export function viewsOf<K extends ViewKind>(
  doc: ArchDoc,
  kind: K,
): K extends "sequence" ? SequenceNode[] : K extends "flow" ? FlowNode[] : K extends "states" ? MachineNode[] : ModelNode[];
export function viewsOf(doc: ArchDoc, kind: ViewKind): ViewNode[] {
  return kind === "sequence" ? doc.sequences : kind === "flow" ? doc.flows : kind === "states" ? doc.machines : doc.models;
}

export const viewName = (v: ViewNode): string => v.name ?? v.id;

/** The components a view names: participants, lanes, the component a machine or model is of. */
export function viewComponents(v: ViewRef): string[][] {
  if (v.kind === "sequence") return sequenceParticipants(v.node as SequenceNode);
  if (v.kind === "flow") {
    const seen = new Map<string, string[]>();
    for (const n of (v.node as FlowNode).nodes) if (n.lane) seen.set(pathToString(n.lane), n.lane);
    return [...seen.values()];
  }
  if (v.kind === "states") return (v.node as MachineNode).of ? [(v.node as MachineNode).of!] : [];
  return (v.node as ModelNode).on ? [(v.node as ModelNode).on!] : [];
}

/** Views a component (or anything nested in it) takes part in. */
export function viewsWith(doc: ArchDoc, path: readonly string[]): ViewRef[] {
  const key = pathToString(path);
  return allViews(doc).filter((v) =>
    viewComponents(v).some((p) => {
      const k = pathToString(p);
      return k === key || k.startsWith(`${key}.`);
    }),
  );
}

/** The ids a view's diagram can place: a flow's nodes, a machine's states, a model's entities. */
export function placeableIds(doc: ArchDoc, viewId: string): Set<string> {
  const v = findView(doc, viewId);
  if (!v || v.kind === "sequence") return new Set();
  if (v.kind === "flow") return new Set((v.node as FlowNode).nodes.map((n) => n.id));
  if (v.kind === "states") return new Set((v.node as MachineNode).states.map((s) => s.id));
  return new Set((v.node as ModelNode).entities.map((e) => e.id));
}

/** Placed positions for one view, by node id. */
export function viewPositions(doc: ArchDoc, viewId: string): Map<string, [number, number]> {
  return new Map(doc.viewLayout.filter((e) => e.view === viewId).map((e) => [e.node, e.at]));
}

/**
 * Rewrite every component path views name, in place (a rename, a move).
 * `remap` returns null for a component that's gone: a sequence drops its
 * steps (see remapSequencePaths); a flow node leaves its lane, and a state
 * machine or data model forgets what it was of — the diagram itself stays.
 */
export function remapViewPaths(doc: ArchDoc, remap: (path: string[]) => string[] | null): void {
  remapSequencePaths(doc, remap);
  for (const f of doc.flows)
    for (const n of f.nodes) {
      if (!n.lane) continue;
      const to = remap(n.lane);
      if (to) n.lane = to;
      else delete n.lane;
    }
  for (const m of doc.machines) {
    if (!m.of) continue;
    const to = remap(m.of);
    if (to) m.of = to;
    else delete m.of;
  }
  for (const m of doc.models) {
    if (!m.on) continue;
    const to = remap(m.on);
    if (to) m.on = to;
    else delete m.on;
  }
}
