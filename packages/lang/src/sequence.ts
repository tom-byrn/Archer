import {
  MESSAGE_KINDS,
  pathToString,
  type ArchDoc,
  type ConnectionNode,
  type FragmentKind,
  type MessageArrow,
  type MessageStep,
  type NoteStep,
  type SequenceNode,
  type StepNode,
} from "./types";

/**
 * Sequences (spec §6.1): helpers shared by the validator, the transforms, the
 * editor and the renderers. Steps are addressed by an index path: `[i]` is
 * the i-th top-level step, `[i, b, j]` the j-th step of branch b of the
 * fragment at i, and so on down.
 */

export type StepAddress = readonly number[];

/** Where a step sits: its list (the address of a fragment branch, or [] for the top) and its index. */
export interface StepSlot {
  list: StepAddress;
  index: number;
}

/** The list of steps at `list` ([] = the sequence's own, [i, b] = branch b of fragment i). */
export function stepList(seq: SequenceNode, list: StepAddress): StepNode[] | undefined {
  let steps: StepNode[] = seq.steps;
  for (let k = 0; k < list.length; k += 2) {
    const frag = steps[list[k]!];
    if (frag?.kind !== "fragment") return undefined;
    const branch = frag.branches[list[k + 1]!];
    if (!branch) return undefined;
    steps = branch.steps;
  }
  return steps;
}

export function stepAt(seq: SequenceNode, address: StepAddress): StepNode | undefined {
  if (address.length === 0) return undefined;
  return stepList(seq, address.slice(0, -1))?.[address[address.length - 1]!];
}

export const addressKey = (address: StepAddress): string => address.join(".");
export const parseAddressKey = (key: string): number[] =>
  key === "" ? [] : key.split(".").map((n) => parseInt(n, 10));

/** One row of a sequence read top to bottom: what the outline, the diagram and playback walk. */
export type SequenceRow =
  | { kind: "message"; step: MessageStep; address: number[]; depth: number; number: number }
  | { kind: "note"; step: NoteStep; address: number[]; depth: number }
  | {
      kind: "branch";
      fragment: FragmentKind;
      guard?: string;
      /** The first branch opens the fragment; later ones are its `else`s. */
      first: boolean;
      /** Address of the fragment, and which branch this is. */
      address: number[];
      branch: number;
      depth: number;
    }
  | { kind: "end"; fragment: FragmentKind; address: number[]; depth: number };

/** Every step in reading order, messages numbered from 1. */
export function sequenceRows(seq: SequenceNode): SequenceRow[] {
  const rows: SequenceRow[] = [];
  let n = 0;
  const walk = (steps: readonly StepNode[], prefix: number[], depth: number) => {
    steps.forEach((step, i) => {
      const address = [...prefix, i];
      if (step.kind === "message") rows.push({ kind: "message", step, address, depth, number: ++n });
      else if (step.kind === "note") rows.push({ kind: "note", step, address, depth });
      else {
        step.branches.forEach((b, bi) => {
          rows.push({
            kind: "branch",
            fragment: step.fragment,
            ...(b.guard !== undefined ? { guard: b.guard } : {}),
            first: bi === 0,
            address,
            branch: bi,
            depth,
          });
          walk(b.steps, [...address, bi], depth + 1);
        });
        rows.push({ kind: "end", fragment: step.fragment, address, depth });
      }
    });
  };
  walk(seq.steps, [], 0);
  return rows;
}

/** The numbered messages alone, in order: playback's steps. */
export function sequenceMessages(seq: SequenceNode) {
  return sequenceRows(seq).filter(
    (r): r is Extract<SequenceRow, { kind: "message" }> => r.kind === "message",
  );
}

/** Participants (component paths) in order of first appearance: the lifelines, left to right. */
export function sequenceParticipants(seq: SequenceNode): string[][] {
  const seen = new Map<string, string[]>();
  const add = (p: string[]) => {
    const key = pathToString(p);
    if (!seen.has(key)) seen.set(key, p);
  };
  for (const row of sequenceRows(seq)) {
    if (row.kind === "message") {
      add(row.step.from);
      add(row.step.to);
    } else if (row.kind === "note") row.step.over.forEach(add);
  }
  return [...seen.values()];
}

export const messageKind = (arrow: MessageArrow) => MESSAGE_KINDS[arrow];

/**
 * The connection a message travels on: for a call (or async call) one that
 * runs from its sender to its receiver (`->`) or joins them either way
 * (`<->`, `--`); for a reply, the one it answers, from the receiver back to
 * the sender. Prefers one of the message's own type. -1 when none does, and
 * always for a message a component sends itself.
 */
export function messageConnection(
  connections: readonly ConnectionNode[],
  msg: Pick<MessageStep, "from" | "to" | "arrow" | "type">,
): number {
  const from = pathToString(msg.from);
  const to = pathToString(msg.to);
  if (from === to) return -1;
  const [a, b] = msg.arrow === "-->" ? [to, from] : [from, to];
  let found = -1;
  connections.forEach((c, i) => {
    const s = pathToString(c.source);
    const t = pathToString(c.target);
    const joins = (s === a && t === b) || (c.arrow !== "->" && s === b && t === a);
    if (!joins) return;
    if (found === -1 || (msg.type !== undefined && c.type === msg.type && connections[found]!.type !== msg.type))
      found = i;
  });
  return found;
}

/** Every sequence step that travels on the connection at `index`: what "In sequences" lists. */
export function sequenceUses(
  doc: ArchDoc,
  index: number,
): { sequence: SequenceNode; messages: ReturnType<typeof sequenceMessages> }[] {
  const out: { sequence: SequenceNode; messages: ReturnType<typeof sequenceMessages> }[] = [];
  for (const sequence of doc.sequences) {
    const messages = sequenceMessages(sequence).filter(
      (r) => messageConnection(doc.connections, r.step) === index,
    );
    if (messages.length > 0) out.push({ sequence, messages });
  }
  return out;
}

/** Sequences a component (or anything nested in it) takes part in. */
export function sequencesWith(doc: ArchDoc, path: readonly string[]): SequenceNode[] {
  const key = pathToString(path);
  return doc.sequences.filter((s) =>
    sequenceParticipants(s).some((p) => {
      const k = pathToString(p);
      return k === key || k.startsWith(`${key}.`);
    }),
  );
}

/**
 * Rewrite every participant path in place (a rename, a move). `remap`
 * returns null for a component that's gone: its messages and its place in
 * notes go too, and a fragment left with nothing in it goes with them.
 */
export function remapSequencePaths(
  doc: ArchDoc,
  remap: (path: string[]) => string[] | null,
): void {
  const fix = (steps: StepNode[]): StepNode[] => {
    const out: StepNode[] = [];
    for (const step of steps) {
      if (step.kind === "message") {
        const from = remap(step.from);
        const to = remap(step.to);
        if (from && to) out.push({ ...step, from, to });
      } else if (step.kind === "note") {
        const over = step.over.map(remap).filter((p): p is string[] => p !== null);
        if (over.length > 0) out.push({ ...step, over });
      } else {
        const branches = step.branches.map((b) => ({ ...b, steps: fix(b.steps) }));
        if (branches.some((b) => b.steps.length > 0)) out.push({ ...step, branches });
      }
    }
    return out;
  };
  for (const seq of doc.sequences) seq.steps = fix(seq.steps);
}

/** Message arrows, for pickers and docs. */
export const MESSAGE_ARROWS: readonly MessageArrow[] = ["->", "-->", "~>"];
