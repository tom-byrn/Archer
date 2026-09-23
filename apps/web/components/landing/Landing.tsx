"use client";

import Link from "next/link";
import { newsreader } from "@/lib/fonts";
import { HEADLINE, LEDE } from "@/lib/landingCopy";
import { ThemeToggle } from "../ThemeToggle";
import { Icon, buttonCls, cx } from "../ui";
import { AgentPrompt, CopyPromptButton } from "./AgentPrompt";
import { ClientLogos } from "./ClientLogos";
import { DitherBackdrop } from "./DitherBackdrop";
import { Faq } from "./Faq";
import { Features } from "./Features";
import { SandboxLoader } from "./SandboxLoader";
import { SiteFrame, siteNavLinkCls } from "./SiteFrame";

const FOOTER_COLUMNS: { title: string; links: [label: string, href: string][] }[] = [
  {
    title: "Product",
    links: [
      ["Try the sandbox", "#sandbox"],
      ["Features", "#features"],
      ["FAQ", "#faq"],
    ],
  },
  { title: "Docs", links: [["Language reference", "/language"]] },
  {
    title: "Account",
    links: [
      ["Sign in", "/sign-in"],
      ["Create an account", "/sign-up"],
    ],
  },
];

const signIn = (
  <Link href="/sign-in" className={buttonCls("primary", "lg")}>
    Sign in with GitHub
    <Icon.ArrowRight className="size-3.5" />
  </Link>
);

const header = (
  <>
    <Link href="/" className="flex items-center gap-2.5 rounded-sm">
      <span className="font-display text-[19px] leading-none text-ink">Archer</span>
    </Link>
    <nav className="hidden items-center gap-6 pl-4 sm:flex">
      <Link href="#features" className={siteNavLinkCls}>
        Features
      </Link>
      <Link href="#faq" className={siteNavLinkCls}>
        FAQ
      </Link>
      <Link href="/language" className={siteNavLinkCls}>
        Docs
      </Link>
    </nav>
    <div className="ml-auto flex items-center gap-2">
      <ThemeToggle />
      <Link href="/sign-in" className={buttonCls("secondary")}>
        Sign in
      </Link>
      <Link href="/sign-up" className={buttonCls("primary")}>
        Get started
      </Link>
    </div>
  </>
);

const footerNav = (
  <div className="grid grid-cols-2 gap-x-10 gap-y-8 px-5 py-10 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] sm:px-10 sm:py-12">
    <div className="col-span-2 sm:col-span-1">
      <span className="font-display text-[19px] leading-none text-ink">Archer</span>
      <p className="max-w-[30ch] pt-3 text-base text-ink-3">{HEADLINE}</p>
    </div>
    {FOOTER_COLUMNS.map((column) => (
      <nav key={column.title} aria-label={column.title}>
        <p className="mono text-xs uppercase tracking-[0.08em] text-ink-3">{column.title}</p>
        <ul className="flex flex-col gap-2.5 pt-3">
          {column.links.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className={siteNavLinkCls}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    ))}
  </div>
);

export function Landing() {
  return (
    <SiteFrame
      className={cx(newsreader.variable, "landing-page")}
      backdrop={<DitherBackdrop />}
      header={header}
      footerNav={footerNav}
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
            <div
              className="landing-rise flex flex-wrap items-center gap-3 pt-8"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              {signIn}
              <Link href="#sandbox" className={buttonCls("secondary", "lg")}>
                <Icon.ArrowDown className="size-3.5" />
                Try the sandbox
              </Link>
            </div>
          </div>
          <div className="landing-rise" style={{ "--i": 3 } as React.CSSProperties}>
            <AgentPrompt />
          </div>
        </div>
      </section>

      <section className="landing-joints flex flex-wrap items-center gap-x-10 gap-y-3 border-b border-line px-5 py-6 sm:px-10">
        <p className="mono text-xs uppercase tracking-[0.08em] text-ink-3">
          Works with any MCP client
        </p>
        <ClientLogos />
      </section>

      <section id="sandbox" className="landing-joints border-b border-line px-5 py-12 sm:px-10 sm:py-16">
        <SandboxLoader />
      </section>

      <Features />

      <Faq />

      <section className="flex flex-col items-center px-5 py-20 text-center sm:px-10 sm:py-24">
        <h2 className="landing-headline max-w-[16ch] text-display-sm text-ink sm:text-display">
          Design systems, with your AI agents.
        </h2>
        <p className="max-w-[52ch] pt-5 text-lede text-ink-2">
          Start on the canvas, or hand your agent the prompt and let it map the codebase you already
          have.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-8">
          {signIn}
          <CopyPromptButton />
        </div>
      </section>
    </SiteFrame>
  );
}
