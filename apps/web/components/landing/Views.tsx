"use client";

import Link from "next/link";
import { Fragment, useId, useState } from "react";
import type { LandingView } from "@/lib/landingViews";
import { Icon, cx } from "../ui";

/**
 * Views on the landing page: a tab per kind (sequence, flow, state machine,
 * data model), each with its source and the diagram Archer draws from it.
 * Built on the server (lib/landingViews.ts) from the docs examples.
 */
export function Views({ views }: { views: LandingView[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const view = views[active];
  if (!view) return null;
  return (
    <section id="views" className="landing-joints border-b border-line">
      <div className="flex flex-col items-center px-5 pt-16 text-center sm:px-10 sm:pt-20">
        <h2 className="landing-headline max-w-[22ch] text-display-sm text-ink sm:text-display-md">
          How it behaves, not just how it&apos;s wired
        </h2>
        <p className="max-w-[60ch] pt-4 text-lede text-ink-2">
          Sequences, flows, state machines and data models live in the same file, over the same
          components. Rename a service and every view follows.
        </p>
      </div>

      {/* The 1px gaps over a line-colored background draw the rules between cells. */}
      <div role="tablist" aria-label="Views" className="mt-12 grid gap-px border-y border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {views.map((v, i) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(i)}
            className={cx(
              "relative flex flex-col gap-1 px-5 py-5 text-left transition-colors sm:px-8",
              i === active ? "bg-surface" : "bg-bg hover:bg-surface-2",
            )}
          >
            {i === active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
            <span className={cx("mono text-xs uppercase tracking-[0.08em]", i === active ? "text-accent" : "text-ink-3")}>
              {v.label}
            </span>
            <span className="text-lg font-semibold text-ink">{v.title}</span>
            <span className="text-base text-ink-2">{v.blurb}</span>
          </button>
        ))}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        className="grid gap-px bg-line lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"
      >
        <div className="flex min-w-0 flex-col gap-4 bg-bg px-5 py-6 sm:px-8">
          <pre className="mono overflow-x-auto border border-line bg-[var(--code-bg)] py-3 text-xs leading-[18px] text-[var(--code-fg)]">
            {view.code.map((tokens, i) => (
              <span key={i} className="block px-3">
                {tokens.map((t, j) =>
                  t.className ? (
                    <span key={j} className={t.className}>
                      {t.text}
                    </span>
                  ) : (
                    <Fragment key={j}>{t.text}</Fragment>
                  ),
                )}
                {tokens.length === 0 && " "}
              </span>
            ))}
          </pre>
          <Link href={view.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            See the worked example
            <Icon.ArrowRight className="size-3.5" />
          </Link>
        </div>
        {/* The diagram as the share image and the editor draw it; one copy per theme. */}
        <div className="landing-view-diagram flex min-h-[420px] min-w-0 flex-col justify-center overflow-x-auto bg-ground px-5 py-8 sm:px-8">
          <div className="theme-light-only w-full" dangerouslySetInnerHTML={{ __html: view.light }} />
          <div className="theme-dark-only w-full" dangerouslySetInnerHTML={{ __html: view.dark }} />
        </div>
      </div>
    </section>
  );
}
