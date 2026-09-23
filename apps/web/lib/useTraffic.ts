"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArchDoc } from "@archer/lang";
import { describeSources, planTraffic, type TrafficPlan } from "./traffic";

export interface Traffic {
  /** What to animate (ArchCanvas `traffic`); null when stopped. */
  playing: {
    plan: TrafficPlan;
    epoch: number;
    /** Sent from a clicked component rather than the entry points. */
    custom: boolean;
  } | null;
  /** A short message for the banner, e.g. "Nothing leaves Postgres". */
  notice: string | null;
  toggle: () => void;
  stop: () => void;
  /** While playing: send from this component instead (unless nothing leaves it). */
  sendFrom: (path: string) => void;
  /** While playing: back to the document's entry points. */
  reset: () => void;
}

/**
 * Play traffic state for a canvas. Nothing is saved: the plan is recomputed
 * from the document as it changes. `enabled` false pauses without forgetting
 * (the editor's diff view).
 */
export function useTraffic(doc: ArchDoc, enabled = true): Traffic {
  const [state, setState] = useState<{ from: string | null; epoch: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const t = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(t);
  }, [notice]);

  const playing = useMemo(() => {
    if (!state || !enabled) return null;
    const plan = planTraffic(doc, state.from);
    return { plan, epoch: state.epoch, custom: plan.sources[0] === state.from };
  }, [doc, state, enabled]);

  const toggle = useCallback(
    () => setState((s) => (s ? null : { from: null, epoch: performance.now() })),
    [],
  );
  const stop = useCallback(() => setState(null), []);
  const sendFrom = useCallback(
    (path: string) => {
      if (!state || state.from === path) return;
      if (planTraffic(doc, path).hops.length === 0) {
        setNotice(`Nothing leaves ${describeSources(doc, [path])}`);
        return;
      }
      setState({ from: path, epoch: performance.now() });
    },
    [doc, state],
  );
  const reset = useCallback(
    () => setState((s) => (s && s.from !== null ? { from: null, epoch: performance.now() } : s)),
    [],
  );

  return { playing, notice, toggle, stop, sendFrom, reset };
}
