"use client";

import type { ArchDoc } from "@archer/lang";
import { describeSources } from "@/lib/traffic";
import type { Traffic } from "@/lib/useTraffic";
import { Button, Kbd } from "./ui";

/** Floating status for Play traffic: where it comes from, how to steer it, Stop. */
export function TrafficBanner({ doc, traffic }: { doc: ArchDoc; traffic: Traffic }) {
  const playing = traffic.playing;
  if (!playing) return null;
  const idle = playing.plan.hops.length === 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
      <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-3 pr-1.5 shadow-md">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-sm text-ink md:whitespace-nowrap">
          {idle ? (
            "Nothing to play yet: draw arrows between components"
          ) : (
            <>
              Traffic from{" "}
              <span className="font-medium">{describeSources(doc, playing.plan.sources)}</span>
            </>
          )}
          {traffic.notice ? (
            <span className="text-warn"> · {traffic.notice}</span>
          ) : (
            !idle && (
              <span className="hidden text-ink-3 md:inline">
                {playing.custom
                  ? " · click empty canvas for all entry points"
                  : " · click a component to send from it"}
              </span>
            )
          )}
        </span>
        <span className="mx-1 h-4 w-px bg-line" />
        <Button size="sm" variant="ghost" onClick={traffic.stop}>
          Stop
          <Kbd>esc</Kbd>
        </Button>
      </div>
    </div>
  );
}
