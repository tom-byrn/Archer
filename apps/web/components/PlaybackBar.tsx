"use client";

import { useEffect } from "react";
import { sequenceMessages, type ArchDoc, type FlowNode, type MachineNode, type SequenceNode } from "@archer/lang";
import { nameOf } from "./SequenceInspector";
import { Button, Icon, IconButton, Kbd, cx } from "./ui";

/** How long playback stays on a step. */
export const STEP_MS = 1600;

/**
 * Plays a sequence on the architecture canvas: the bar at the bottom steps
 * through its messages while the canvas lights the connection each one
 * travels on (the editor does that part).
 */
export function PlaybackBar({
  doc,
  sequence,
  step,
  playing,
  onStep,
  onPlayingChange,
  onOpen,
  onClose,
}: {
  doc: ArchDoc;
  sequence: SequenceNode;
  /** Index into the sequence's messages. */
  step: number;
  playing: boolean;
  onStep: (i: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** Open the sequence on this step. */
  onOpen: () => void;
  onClose: () => void;
}) {
  const messages = sequenceMessages(sequence);
  const m = messages[step];
  const last = messages.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      onPlayingChange(false);
      return;
    }
    const t = setTimeout(() => onStep(step + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, last, onStep, onPlayingChange]);

  // ← and → step through, unless a field has the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && step > 0) onStep(step - 1);
      else if (e.key === "ArrowRight" && step < last) onStep(step + 1);
      else return;
      e.preventDefault();
      onPlayingChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, last, onStep, onPlayingChange]);

  if (!m) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
      <div className="pointer-events-auto flex w-[640px] max-w-full flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-md">
        <div className="flex items-center gap-2">
          <Icon.Sequence className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <b>
              Step {m.number} of {messages.length}
            </b>
            <span className="text-ink-2">
              {" "}
              · {nameOf(doc, m.step.from)} {m.step.arrow === "-->" ? "⇢" : "→"} {nameOf(doc, m.step.to)}
              {m.step.label ? ` · ${m.step.label}` : ""}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open sequence
          </Button>
          <IconButton label="Stop playing (esc)" onClick={onClose}>
            <Icon.Close />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Previous step" disabled={step === 0} onClick={() => onStep(step - 1)}>
            <Icon.ChevronLeft />
          </IconButton>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (!playing && step >= last) onStep(0);
              onPlayingChange(!playing);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-colors hover:bg-accent-hover"
          >
            {playing ? <Icon.Pause className="h-3.5 w-3.5" /> : <Icon.Play className="h-3.5 w-3.5" />}
          </button>
          <IconButton label="Next step" disabled={step >= last} onClick={() => onStep(step + 1)}>
            <Icon.ChevronRight />
          </IconButton>
          <div className="grid min-w-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${messages.length}, minmax(0, 1fr))` }}>
            {messages.map((x, i) => (
              <button
                key={x.number}
                type="button"
                aria-label={`Step ${x.number}`}
                title={`${x.number}. ${x.step.label ?? ""}`}
                onClick={() => onStep(i)}
                className="flex h-4 items-center"
              >
                <span
                  className={cx(
                    "h-1.5 w-full rounded-full transition-colors",
                    i < step ? "bg-ink-2" : i === step ? "bg-accent" : "bg-surface-3",
                  )}
                />
              </button>
            ))}
          </div>
          <span className="hidden items-center gap-1 text-xs text-ink-3 md:flex">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Plays a flow on the architecture: each node lights the component whose
 * lane it's in, and the connection control crossed to get there. A node with
 * one way on moves on by itself; at a decision (or any node with several),
 * playback waits for you to pick the branch.
 */
export function FlowPlaybackBar({
  doc,
  flow,
  path,
  playing,
  onPath,
  onPlayingChange,
  onOpen,
  onClose,
}: {
  doc: ArchDoc;
  flow: FlowNode;
  /** Node ids visited so far; the last is the current one. */
  path: string[];
  playing: boolean;
  onPath: (path: string[]) => void;
  onPlayingChange: (playing: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const id = path[path.length - 1];
  const node = flow.nodes.find((n) => n.id === id);
  const next = flow.edges.filter((e) => e.from === id);
  const name = (nid: string) => {
    const n = flow.nodes.find((x) => x.id === nid);
    return n?.name ?? (n?.node === "start" ? "Start" : n?.node === "end" ? "End" : nid);
  };

  useEffect(() => {
    if (!playing) return;
    if (next.length !== 1) {
      onPlayingChange(false);
      return;
    }
    const t = setTimeout(() => onPath([...path, next[0]!.to]), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, path, next, onPath, onPlayingChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && path.length > 1) onPath(path.slice(0, -1));
      else if (e.key === "ArrowRight" && next.length === 1) onPath([...path, next[0]!.to]);
      else return;
      e.preventDefault();
      onPlayingChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, next, onPath, onPlayingChange]);

  if (!node) return null;
  const lane = node.lane ? nameOf(doc, node.lane) : null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
      <div className="pointer-events-auto flex w-[640px] max-w-full flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-md">
        <div className="flex items-center gap-2">
          <Icon.Flow className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <b>
              {flow.name ?? flow.id} · step {path.length}
            </b>
            <span className="text-ink-2">
              {" "}
              · {name(node.id)}
              {lane ? ` · ${lane}` : ""}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open flow
          </Button>
          <IconButton label="Stop playing (esc)" onClick={onClose}>
            <Icon.Close />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Back" disabled={path.length <= 1} onClick={() => onPath(path.slice(0, -1))}>
            <Icon.ChevronLeft />
          </IconButton>
          {next.length === 1 ? (
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => onPlayingChange(!playing)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-colors hover:bg-accent-hover"
            >
              {playing ? <Icon.Pause className="h-3.5 w-3.5" /> : <Icon.Play className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {next.length === 0 ? (
            <span className="text-sm text-ink-2">
              {node.node === "end" ? "The flow ends here." : "Nothing follows this node."}{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => onPath(path.slice(0, 1))}>
                Start over
              </button>
            </span>
          ) : next.length === 1 ? (
            <Button size="sm" variant="secondary" onClick={() => onPath([...path, next[0]!.to])}>
              Next: {name(next[0]!.to)}
            </Button>
          ) : (
            <>
              <span className="text-sm text-ink-2">Choose:</span>
              {next.map((e) => (
                <Button key={`${e.to}-${e.label ?? ""}`} size="sm" variant="secondary" onClick={() => onPath([...path, e.to])}>
                  {e.label ? `${e.label} → ` : ""}
                  {name(e.to)}
                </Button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Steps through a state machine in its own diagram: the current state is
 * lit, and each transition out of it is a button.
 */
export function StateSimulatorBar({
  machine,
  path,
  onPath,
  onClose,
}: {
  machine: MachineNode;
  /** States visited so far; the last is the current one. */
  path: string[];
  onPath: (path: string[]) => void;
  onClose: () => void;
}) {
  const id = path[path.length - 1];
  const state = machine.states.find((s) => s.id === id);
  const out = machine.transitions.filter((t) => t.from === id);
  const name = (sid: string) => machine.states.find((s) => s.id === sid)?.name ?? sid;
  if (!state) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
      <div className="pointer-events-auto flex w-[640px] max-w-full flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-md">
        <div className="flex items-center gap-2">
          <Icon.States className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <b>In {name(state.id)}</b>
            <span className="text-ink-2"> · {path.map(name).join(" → ")}</span>
          </span>
          <IconButton label="Stop simulating" onClick={onClose}>
            <Icon.Close />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Back" disabled={path.length <= 1} onClick={() => onPath(path.slice(0, -1))}>
            <Icon.ChevronLeft />
          </IconButton>
          {out.length === 0 ? (
            <span className="text-sm text-ink-2">
              {state.final ? "A final state: the machine stops here." : "No transitions leave this state."}{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => onPath(path.slice(0, 1))}>
                Reset
              </button>
            </span>
          ) : (
            out.map((t, i) => (
              <Button key={i} size="sm" variant="secondary" onClick={() => onPath([...path, t.to])}>
                {t.label ?? "→"}
                {t.to !== t.from ? ` → ${name(t.to)}` : " (stays)"}
              </Button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
