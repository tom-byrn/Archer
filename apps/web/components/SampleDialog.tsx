"use client";

import { useState } from "react";
import { DocPreview } from "@/lib/preview";
import { SAMPLES, type Sample } from "@/lib/samples";
import { Dialog, cx } from "./ui";

/** Fits the gallery: one card column per sample up to three, then it scrolls. */
const WIDTH = [400, 600, 800][Math.min(SAMPLES.length, 3) - 1];

/**
 * "From sample": every sample as a card with a preview of its diagram.
 * Choosing one hands it to `onChoose`, which creates the document and
 * navigates to it, so the dialog stays busy until the page changes.
 */
export function SampleDialog({
  workspaceName,
  onClose,
  onChoose,
}: {
  workspaceName: string;
  onClose: () => void;
  onChoose: (sample: Sample) => Promise<void>;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const choose = (sample: Sample) => {
    setCreating(sample.slug);
    setFailed(false);
    onChoose(sample).catch(() => {
      setCreating(null);
      setFailed(true);
    });
  };

  return (
    <Dialog open onClose={onClose} title="Start from a sample" width={WIDTH}>
      <p className="pb-3 text-sm text-ink-2">
        Pick one to copy into <span className="font-medium text-ink">{workspaceName}</span> as a
        new document.
      </p>
      {/* The padding leaves room for the hover shadow and focus ring inside the scroller. */}
      <ul className="-m-1 grid max-h-[60dvh] grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto p-1">
        {SAMPLES.map((s, i) => (
          <li key={s.slug}>
            <button
              type="button"
              autoFocus={i === 0}
              disabled={creating !== null}
              aria-busy={creating === s.slug}
              onClick={() => choose(s)}
              className={cx(
                "flex h-full w-full flex-col overflow-hidden rounded-md border border-line bg-surface text-left transition-[border-color,box-shadow,transform,opacity] duration-[120ms] enabled:hover:-translate-y-px enabled:hover:border-line-2 enabled:hover:shadow-md",
                creating !== null && creating !== s.slug && "opacity-40",
              )}
            >
              {/* min-h-0: as a flex item the thumbnail would otherwise grow to a tall diagram's height. */}
              <span className="block aspect-[16/10] min-h-0 w-full border-b border-line bg-ground p-3">
                <DocPreview source={s.source} />
              </span>
              <span className="block px-3 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">
                    {s.title}
                  </span>
                  {creating === s.slug && (
                    <span className="shrink-0 animate-pulse text-xs text-ink-3">Creating…</span>
                  )}
                </span>
                <span className="line-clamp-2 pt-0.5 text-xs text-ink-2">{s.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {failed && (
        <p className="pt-3 text-sm text-danger">
          Couldn&apos;t create the document. Check that you can edit this workspace, then try
          again.
        </p>
      )}
    </Dialog>
  );
}
