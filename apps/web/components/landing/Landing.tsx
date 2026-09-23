"use client";

import { newsreader } from "@/lib/fonts";
import { HEADLINE, LEDE } from "@/lib/landingCopy";
import { AgentPrompt } from "./AgentPrompt";
import { DitherBackdrop } from "./DitherBackdrop";
import { SandboxLoader } from "./SandboxLoader";
import { SiteFrame } from "./SiteFrame";

export function Landing() {
  return (
    <SiteFrame
      dark
      className={newsreader.variable}
      backdrop={<DitherBackdrop />}
      footerExtra={
        <div className="overflow-hidden px-5 pt-4 sm:px-10" aria-hidden>
          <div className="landing-wordmark">Archer</div>
        </div>
      }
    >
      <section className="landing-joints border-b border-line">
        <div className="relative grid items-end gap-x-14 gap-y-10 px-5 pb-14 pt-16 sm:px-10 sm:pb-20 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div>
            <h1 className="landing-headline landing-rise max-w-[12ch] text-display-sm text-ink sm:text-display">
              {HEADLINE}
            </h1>
            <p
              className="landing-rise max-w-[46ch] pt-6 text-lede text-ink-2"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {LEDE}
            </p>
          </div>
          <div className="landing-rise" style={{ "--i": 2 } as React.CSSProperties}>
            <AgentPrompt />
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-10 sm:py-16">
        <SandboxLoader />
        <p className="max-w-[64ch] pt-5 text-lg text-ink-2">
          Try it. Drag a box, or pull a line from the edge of one box to another.
        </p>
      </section>
    </SiteFrame>
  );
}
