import {
  addressKey,
  pathToString,
  sequenceParticipants,
  sequenceRows,
  type MessageArrow,
  type SequenceNode,
  type SequenceRow,
} from "@archer/lang";

/**
 * Geometry of a sequence diagram (spec §6.1), in px: one lifeline per
 * participant, in order of first appearance, and one row per step, top to
 * bottom. Pure, so the editor's diagram and anything that draws one
 * statically get the same picture. Sequences have no stored layout: this is
 * all there is.
 */

export const HEAD_W = 148;
export const HEAD_H = 52;
const MARGIN = 24;
const MIN_GAP = 184;
const ROW = { message: 46, self: 64, note: 40, branch: 34, end: 16 } as const;
/** Room a message label takes beside its number badge. */
const LABEL_PAD = 64;
/** How far a self-call's loop reaches right of its lifeline. */
const SELF_W = 36;
const FRAME_PAD = 56;
const FRAME_INSET = 10;

/** Rough width of a 12px Inter label; good enough to space lifelines. */
export const textWidth = (text: string): number => Math.ceil(text.length * 6.6);

export interface SeqLifeline {
  key: string;
  path: string[];
  x: number;
}

export interface SeqMessage {
  kind: "message";
  key: string;
  number: number;
  arrow: MessageArrow;
  label?: string;
  type?: string;
  from: string;
  to: string;
  /** Tail and tip x; equal for a self-call. */
  x1: number;
  x2: number;
  y: number;
  /** Self-call: the loop's bottom. */
  y2: number;
  self: boolean;
  /** Where the number badge and label start, and the label's baseline. */
  labelX: number;
  labelY: number;
}

export interface SeqNote {
  kind: "note";
  key: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeqFrame {
  key: string;
  fragment: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Each branch: its guard and where it starts (the first at the frame's top). */
  branches: { guard?: string; y: number; index: number }[];
}

export interface SeqLayout {
  width: number;
  height: number;
  lifelines: SeqLifeline[];
  messages: SeqMessage[];
  notes: SeqNote[];
  /** Outermost first, so nested frames draw over their parents. */
  frames: SeqFrame[];
  /** Below the last step: where "add a step" goes. */
  bottom: number;
}

export function layoutSequence(seq: SequenceNode): SeqLayout {
  const participants = sequenceParticipants(seq);
  const col = new Map(participants.map((p, i) => [pathToString(p), i]));
  const rows = sequenceRows(seq);

  // Lifelines far enough apart for every label between neighbours.
  let gap = MIN_GAP;
  for (const r of rows) {
    if (r.kind !== "message") continue;
    const a = col.get(pathToString(r.step.from))!;
    const b = col.get(pathToString(r.step.to))!;
    const need = textWidth(r.step.label ?? "") + LABEL_PAD;
    if (a !== b) gap = Math.max(gap, need / Math.abs(a - b));
  }
  gap = Math.ceil(gap);
  const xOf = (i: number) => MARGIN + HEAD_W / 2 + i * gap;
  const lifelines = participants.map((p, i) => ({ key: pathToString(p), path: p, x: xOf(i) }));

  const messages: SeqMessage[] = [];
  const notes: SeqNote[] = [];
  const frames: SeqFrame[] = [];
  /** Open fragments, innermost last: the x span of what's inside so far. */
  const open: { frame: SeqFrame; min: number; max: number; depth: number }[] = [];
  const widen = (min: number, max: number) => {
    for (const f of open) {
      f.min = Math.min(f.min, min);
      f.max = Math.max(f.max, max);
    }
  };
  let right = MARGIN + HEAD_W + (participants.length - 1) * gap;

  let y = HEAD_H + 24;
  for (const r of rows as SequenceRow[]) {
    if (r.kind === "message") {
      const from = pathToString(r.step.from);
      const to = pathToString(r.step.to);
      const x1 = xOf(col.get(from)!);
      const x2 = xOf(col.get(to)!);
      const self = from === to;
      const label = r.step.label ?? "";
      const top = y;
      y += self ? ROW.self : ROW.message;
      const lineY = top + 30;
      const left = Math.min(x1, x2);
      messages.push({
        kind: "message",
        key: addressKey(r.address),
        number: r.number,
        arrow: r.step.arrow,
        ...(r.step.label !== undefined ? { label: r.step.label } : {}),
        ...(r.step.type !== undefined ? { type: r.step.type } : {}),
        from,
        to,
        x1,
        x2,
        y: lineY,
        y2: self ? lineY + 22 : lineY,
        self,
        labelX: self ? x1 + SELF_W + 10 : left + 12,
        labelY: self ? lineY + 15 : lineY - 9,
      });
      const reach = self ? x1 + SELF_W + 30 + textWidth(label) : Math.max(x1, x2);
      right = Math.max(right, reach + MARGIN);
      widen(left, self ? reach : Math.max(x1, x2));
    } else if (r.kind === "note") {
      const xs = r.step.over.map((p) => xOf(col.get(pathToString(p))!));
      const min = Math.min(...xs);
      const max = Math.max(...xs);
      const w = Math.max(max - min + 80, Math.min(textWidth(r.step.text) + 24, 320));
      const cx = (min + max) / 2;
      const lines = Math.max(1, Math.ceil((textWidth(r.step.text) + 24) / w));
      const h = 12 + lines * 16;
      notes.push({ kind: "note", key: addressKey(r.address), text: r.step.text, x: cx - w / 2, y: y + 6, w, h });
      y += Math.max(ROW.note, h + 12);
      widen(cx - w / 2 + FRAME_PAD - 8, cx + w / 2 - FRAME_PAD + 8);
    } else if (r.kind === "branch") {
      if (r.first) {
        const frame: SeqFrame = { key: addressKey(r.address), fragment: r.fragment, x: 0, y, w: 0, h: 0, branches: [] };
        frames.push(frame);
        open.push({ frame, min: Infinity, max: -Infinity, depth: open.length });
      }
      open[open.length - 1]!.frame.branches.push({
        ...(r.guard !== undefined ? { guard: r.guard } : {}),
        y,
        index: r.branch,
      });
      y += ROW.branch;
    } else {
      const f = open.pop()!;
      // An empty fragment spans the whole diagram.
      const min = Number.isFinite(f.min) ? f.min : xOf(0);
      const max = Number.isFinite(f.max) ? f.max : xOf(Math.max(0, participants.length - 1));
      const inset = f.depth * FRAME_INSET;
      f.frame.x = min - FRAME_PAD + inset;
      f.frame.w = Math.max(max - min + 2 * (FRAME_PAD - inset), 160);
      y += ROW.end;
      f.frame.h = y - f.frame.y - 4;
      right = Math.max(right, f.frame.x + f.frame.w + MARGIN);
      // The parent's frame holds this one.
      widen(f.frame.x + FRAME_PAD - FRAME_INSET, f.frame.x + f.frame.w - FRAME_PAD + FRAME_INSET);
    }
  }

  const bottom = y + 8;
  return {
    width: Math.max(right, MARGIN * 2 + HEAD_W),
    height: bottom + 56,
    lifelines,
    messages,
    notes,
    frames,
    bottom,
  };
}
