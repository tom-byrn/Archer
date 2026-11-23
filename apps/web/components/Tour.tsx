"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  DASHBOARD_STEPS,
  EDITOR_STEPS,
  nextEditorStep,
  type EditorProgress,
  type TourStep,
} from "@/lib/onboarding";
import { Button, cx } from "./ui";

/**
 * The first-run walkthrough (steps in lib/onboarding.ts, state in
 * convex/onboarding.ts). On the dashboard it dims the page around the control
 * it's explaining and lets only that control (and Skip) be clicked. In the
 * editor it rings the controls it mentions and waits for the user to add,
 * move and connect components, without getting in the way of the canvas.
 */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const GUTTER = 16;
const CARD_WIDTH = 340;

const same = (a: Box[], b: Box[]) =>
  a.length === b.length &&
  a.every((r, i) => {
    const o = b[i]!;
    return r.top === o.top && r.left === o.left && r.width === o.width && r.height === o.height;
  });

/** Where the visible elements marked `data-tour={target}` are, kept current as the page moves. */
function useTargets(target: string | undefined): Box[] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!target) {
      setBoxes([]);
      return;
    }
    let frame = 0;
    let last: Box[] = [];
    const measure = () => {
      const next: Box[] = [];
      document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // hidden (desktop-only controls on a phone, a collapsed pane)
        // Padded, but kept on screen so a ring around a control at the edge isn't cut off.
        const top = Math.max(2, Math.round(r.top - PAD));
        const left = Math.max(2, Math.round(r.left - PAD));
        const bottom = Math.min(window.innerHeight - 2, Math.round(r.bottom + PAD));
        const right = Math.min(window.innerWidth - 2, Math.round(r.right + PAD));
        next.push({ top, left, width: right - left, height: bottom - top });
      });
      if (!same(next, last)) {
        last = next;
        setBoxes(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return boxes;
}

function Ring({ box }: { box: Box }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed rounded-lg border-2 border-accent shadow-[0_0_0_4px_var(--accent-soft)] transition-[top,left,width,height] duration-150"
      style={box}
    />
  );
}

function Card({
  step,
  index,
  total,
  primary,
  onSkip,
  style,
  className,
}: {
  step: TourStep;
  index: number;
  total: number;
  /** The Next/Finish button; absent while the step waits for the user. */
  primary?: { label: string; onClick: () => void };
  onSkip: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasPrimary = !!primary;
  useEffect(() => {
    if (hasPrimary) cardRef.current?.querySelector<HTMLElement>("[data-primary]")?.focus({ preventScroll: true });
  }, [step.id, hasPrimary]);
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={step.title}
      style={{ width: CARD_WIDTH, maxWidth: `calc(100vw - ${GUTTER * 2}px)`, ...style }}
      className={cx("fade-in rounded-xl border border-line bg-surface p-4 shadow-md", className)}
    >
      <div className="flex items-center gap-2 pb-1.5">
        <span className="text-xs font-medium text-accent">
          {index + 1} of {total}
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cx("h-1 w-3 rounded-full", i <= index ? "bg-accent" : "bg-surface-3")}
            />
          ))}
        </span>
      </div>
      <h2 className="text-lg font-semibold text-ink">{step.title}</h2>
      <p className="pt-1 text-sm text-ink-2">{step.body}</p>
      {!primary && step.hint && (
        <p className="flex items-center gap-2 pt-2.5 text-xs text-ink-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {step.hint}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-3.5">
        <Button size="sm" variant="ghost" onClick={onSkip}>
          Skip tour
        </Button>
        {primary && (
          <Button data-primary size="sm" variant="primary" onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}

const SCRIM = "pointer-events-auto bg-[rgba(10,10,8,0.45)]";

/**
 * The dashboard part: a few words on what Archer is, then the controls that
 * make a document, ending on "New document" (which the dashboard wires to
 * create the tour's document and open it). Everything but the ringed control
 * and the card is behind a scrim.
 */
export function DashboardTour({ onSkip }: { onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const step = DASHBOARD_STEPS[index]!;
  const boxes = useTargets(step.target);
  const hole = boxes[0];
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!step.target) return;
    document
      .querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step.target]);

  const last = index === DASHBOARD_STEPS.length - 1;
  const primary = step.clickTarget
    ? undefined
    : { label: index === 0 ? "Show me around" : "Next", onClick: () => setIndex((i) => i + 1) };
  const card = (
    <Card
      step={step}
      index={index}
      total={DASHBOARD_STEPS.length}
      primary={primary}
      onSkip={onSkip}
      style={hole ? cardBeside(hole, viewport) : undefined}
      className={hole ? "pointer-events-auto fixed" : "pointer-events-auto"}
    />
  );

  return (
    // Only the panes, the blocker and the card take clicks: the cut-out lets them through to the target.
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {hole ? (
        <>
          {/* Four panes around the target: they dim and block everything else. */}
          <div className={cx("fixed inset-x-0 top-0", SCRIM)} style={{ height: Math.max(0, hole.top) }} />
          <div
            className={cx("fixed inset-x-0 bottom-0", SCRIM)}
            style={{ top: hole.top + hole.height }}
          />
          <div
            className={cx("fixed left-0", SCRIM)}
            style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }}
          />
          <div
            className={cx("fixed right-0", SCRIM)}
            style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }}
          />
          {/* Info steps: the target is shown, not clickable. */}
          {!step.clickTarget && <div className="pointer-events-auto fixed" style={hole} />}
          <Ring box={hole} />
          {card}
        </>
      ) : (
        <div className={cx("grid h-full place-items-center p-4", SCRIM)}>{card}</div>
      )}
      {last && step.clickTarget && (
        <span className="sr-only" aria-live="polite">
          Click New document to continue.
        </span>
      )}
    </div>
  );
}

/** Under the target when it fits, else above it; centred on it, kept on screen. */
function cardBeside(hole: Box, viewport: { w: number; h: number }): CSSProperties {
  const width = Math.min(CARD_WIDTH, viewport.w - GUTTER * 2);
  const left = Math.min(
    Math.max(GUTTER, hole.left + hole.width / 2 - width / 2),
    viewport.w - width - GUTTER,
  );
  const below = hole.top + hole.height + 12;
  return viewport.h - below > 240
    ? { top: below, left }
    : { bottom: Math.max(GUTTER, viewport.h - hole.top + 12), left };
}

/**
 * The editor part: add two components, move one, connect them, open the
 * code. Steps that wait for the user move on by themselves when `progress`
 * shows it's done.
 */
export function EditorTour({
  progress,
  onEnd,
}: {
  progress: EditorProgress;
  onEnd: (how: "done" | "skipped") => void;
}) {
  const [from, setFrom] = useState(0);
  const index = nextEditorStep(from, progress);
  // Latch it: a step once done stays done, so closing the code pane or
  // deleting a component doesn't send the tour back.
  if (index !== from) setFrom(index);
  const step = EDITOR_STEPS[index]!;
  const boxes = useTargets(step.target);
  // The card sits in the canvas's bottom-right corner, clear of new components (placed mid-canvas).
  const canvas = useTargets("canvas")[0];
  const last = index === EDITOR_STEPS.length - 1;
  const primary = step.done
    ? undefined
    : last
      ? { label: "Finish", onClick: () => onEnd("done") }
      : { label: "Next", onClick: () => setFrom(index + 1) };

  return (
    <div className="pointer-events-none fixed inset-0 z-[95]">
      {boxes.map((box, i) => (
        <Ring key={i} box={box} />
      ))}
      <div
        className="absolute flex justify-center p-4 md:justify-end"
        style={
          canvas
            ? {
                left: canvas.left + PAD,
                width: canvas.width - PAD * 2,
                bottom: window.innerHeight - (canvas.top + canvas.height - PAD),
              }
            : { left: 0, right: 0, bottom: 0 }
        }
      >
        <Card
          key={step.id}
          step={step}
          index={index}
          total={EDITOR_STEPS.length}
          primary={primary}
          onSkip={() => onEnd("skipped")}
          className="pointer-events-auto"
        />
      </div>
    </div>
  );
}
