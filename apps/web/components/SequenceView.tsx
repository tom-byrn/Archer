"use client";

import {
  componentPaths,
  insertStep,
  parseAddressKey,
  pathToString,
  sequenceParticipants,
  stepAt,
  wrapInFragment,
  type ArchDoc,
  type MessageArrow,
  type SequenceNode,
  type StepNode,
  type StepSlot,
} from "@archer/lang";
import { SequenceDiagram } from "./SequenceDiagram";
import { nameOf } from "./SequenceInspector";
import { Button, Icon, Kbd, cx } from "./ui";

const ZERO = { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } };

/**
 * The editor's main area while a sequence is open: its diagram on the canvas
 * ground, and a toolbar that adds steps after the selected one.
 */
export function SequenceView({
  doc,
  sequence,
  selected,
  onSelect,
  warned,
  mutateWith,
  readOnly,
  onPlay,
  onError,
}: {
  doc: ArchDoc;
  sequence: SequenceNode;
  selected: string | null;
  onSelect: (key: string | null) => void;
  warned: ReadonlySet<string>;
  mutateWith: <T>(fn: (d: ArchDoc) => { doc: ArchDoc; value: T }) => T | undefined;
  readOnly: boolean;
  onPlay: () => void;
  onError: (message: string) => void;
}) {
  const address = selected === null ? null : parseAddressKey(selected);
  const after = address ? stepAt(sequence, address) : undefined;
  /** New steps go after the selected one, else at the end. */
  const slot: StepSlot = address && after
    ? { list: address.slice(0, -1), index: address[address.length - 1]! + 1 }
    : { list: [], index: sequence.steps.length };

  const insert = (step: StepNode) => {
    const at = mutateWith((d) => {
      const r = insertStep(d, sequence.id, slot, step);
      return { doc: r.doc, value: r.address };
    });
    if (at) onSelect(at.join("."));
  };

  /** Ends for a new message: carry on from the selected one, else the first two components. */
  const ends = (arrow: MessageArrow): { from: string[]; to: string[] } | null => {
    if (after?.kind === "message") {
      if (arrow === "-->") return { from: after.to, to: after.from };
      const lines = sequenceParticipants(sequence).map(pathToString);
      const i = lines.indexOf(pathToString(after.to));
      const next = lines[i + 1] ?? lines.find((k) => k !== pathToString(after.to));
      return { from: after.to, to: next ? next.split(".") : after.from };
    }
    const lines = sequenceParticipants(sequence);
    if (lines.length >= 2) return arrow === "-->" ? { from: lines[1]!, to: lines[0]! } : { from: lines[0]!, to: lines[1]! };
    const all = [...componentPaths(doc)].map((k) => k.split("."));
    if (all.length === 0) return null;
    return { from: all[0]!, to: all[1] ?? all[0]! };
  };

  const addMessage = (arrow: MessageArrow) => {
    const e = ends(arrow);
    if (!e) return onError("Add components to the architecture first: steps are between components.");
    insert({ kind: "message", from: e.from, to: e.to, arrow, span: ZERO });
  };

  const addNote = () => {
    const over = after?.kind === "message" ? [after.from] : sequenceParticipants(sequence).slice(0, 1);
    if (over.length === 0) return onError("Add a step first: a note sits over the lifelines.");
    insert({ kind: "note", over, text: "Note", span: ZERO });
  };

  const addFragment = () => {
    // Wrap the selected step; with nothing selected, an empty `opt` at the end.
    const at = mutateWith((d) => {
      const r = address && after
        ? wrapInFragment(d, sequence.id, { list: address.slice(0, -1), index: address[address.length - 1]! }, 1, "opt")
        : wrapInFragment(d, sequence.id, slot, 0, "opt");
      return { doc: r.doc, value: r.address };
    });
    if (at) onSelect(at.join("."));
  };

  const empty = sequence.steps.length === 0;
  return (
    <div className="relative min-h-0 flex-1 bg-ground">
      <div
        className="absolute inset-0 overflow-auto"
        style={{
          backgroundImage: "radial-gradient(var(--dot) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {empty ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-[360px] text-center">
              <p className="text-base font-medium text-ink">{sequence.name ?? sequence.id} has no steps yet</p>
              <p className="pt-1 text-sm text-ink-3">
                A sequence is one scenario, step by step: who calls whom, in what order. Add a call to start, and pick
                its components in the panel.
              </p>
              {!readOnly && (
                <Button className="mt-3" icon={<Icon.Plus />} onClick={() => addMessage("->")}>
                  Add a call
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="inline-block min-w-full px-10 pb-28 pt-8" onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}>
            <SequenceDiagram
              className="mx-auto"
              doc={doc}
              sequence={sequence}
              selected={selected}
              onSelect={onSelect}
              warned={warned}
            />
          </div>
        )}
      </div>

      {!readOnly && !empty && (
        <div
          role="toolbar"
          aria-label="Sequence steps"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          <ToolButton onClick={() => addMessage("->")} title="Add a call after the selected step">
            <b className="mono">-&gt;</b> Call
          </ToolButton>
          <ToolButton onClick={() => addMessage("-->")} title="Add a reply after the selected step">
            <b className="mono">--&gt;</b> Reply
          </ToolButton>
          <ToolButton onClick={() => addMessage("~>")} title="Add an async call after the selected step">
            <b className="mono">~&gt;</b> Async
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-line" />
          <ToolButton
            onClick={addFragment}
            title={after ? "Wrap the selected step in a fragment" : "Add an empty fragment at the end"}
          >
            <Icon.Group className="h-3.5 w-3.5" /> Fragment
          </ToolButton>
          <ToolButton onClick={addNote} title="Add a note after the selected step">
            <Icon.Note className="h-3.5 w-3.5" /> Note
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-line" />
          <ToolButton onClick={onPlay} title="Play this sequence on the architecture">
            <Icon.Play className="h-3.5 w-3.5 text-accent" /> Play
          </ToolButton>
        </div>
      )}
      {selected !== null && after && (
        <div className="pointer-events-none absolute right-3 top-3 hidden items-center gap-1.5 text-xs text-ink-3 md:flex">
          {after.kind === "message" && (
            <span>
              {nameOf(doc, after.from)} → {nameOf(doc, after.to)}
            </span>
          )}
          <Kbd>esc</Kbd> deselect
        </div>
      )}
    </div>
  );
}

function ToolButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
