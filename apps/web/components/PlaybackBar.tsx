"use client";

import { useEffect } from "react";
import { sequenceMessages, type ArchDoc, type SequenceNode } from "@archer/lang";
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
