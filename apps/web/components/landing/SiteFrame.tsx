"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "../ThemeToggle";
import { buttonCls, cx } from "../ui";
import "./landing.css";

const navLink =
  "rounded-sm text-sm text-ink-2 transition-colors duration-100 hover:text-ink";

/**
 * The site shell: one ruled column with diamond joints, header and footer, in
 * the viewer's theme. `backdrop` sits behind the column (the landing's
 * dither); `footerNav` goes above the footer links (the landing's link
 * columns) and `footerExtra` under them (the landing's wordmark). `header`
 * replaces the default header row (wordmark, public nav, theme toggle) and
 * `footerLinks` the default footer links, for pages that have their own; with
 * `footerNav` there are no default footer links.
 */
export function SiteFrame({
  children,
  className,
  backdrop,
  header,
  footerNav,
  footerLinks,
  footerExtra,
}: {
  children: ReactNode;
  className?: string;
  backdrop?: ReactNode;
  header?: ReactNode;
  footerNav?: ReactNode;
  footerLinks?: ReactNode;
  footerExtra?: ReactNode;
}) {
  return (
    <div
      className={cx(
        className,
        "relative isolate flex min-h-full flex-col overflow-x-clip bg-bg text-ink",
      )}
    >
      {backdrop}
      {/* Flex column so the side rules run to the bottom on short pages. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col border-x border-line">
        <header className="landing-joints flex h-14 items-center gap-5 border-b border-line px-5 sm:px-10">
          {header ?? (
            <>
              <Link href="/" className="flex items-center gap-2.5 rounded-sm">
                <span className="font-display text-[19px] leading-none text-ink">
                  Archer
                </span>
              </Link>
              <nav className="ml-auto flex items-center gap-5">
                <Link href="/language" className={navLink}>
                  Docs
                </Link>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Link href="/sign-in" className={buttonCls("secondary")}>
                    Sign in
                  </Link>
                </div>
              </nav>
            </>
          )}
        </header>

        <main className="flex-1">{children}</main>

        <footer className="landing-joints landing-joints-top border-t border-line">
          {footerNav}
          <div
            className={cx(
              "flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 sm:px-10",
              footerNav !== undefined && "border-t border-line",
            )}
          >
            {footerLinks ??
              (footerNav === undefined && (
                <>
                  <Link href="/language" className={navLink}>
                    Docs
                  </Link>
                  <Link href="/sign-in" className={navLink}>
                    Sign in
                  </Link>
                </>
              ))}
            <span className="ml-auto text-sm text-ink-3">© 2026 Archer</span>
          </div>
          {footerExtra}
        </footer>
      </div>
    </div>
  );
}

/** A footer/header text link in the shell's style. */
export const siteNavLinkCls = navLink;
