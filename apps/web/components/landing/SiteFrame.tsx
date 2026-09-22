"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { FORCED_DARK_CLASS } from "@/lib/useIsDark";
import { buttonCls, cx } from "../ui";
import "./landing.css";

const navLink =
  "rounded-sm text-sm text-ink-2 transition-colors duration-100 hover:text-ink";

/**
 * The site shell: one ruled column with diamond joints, header and footer.
 * It follows the OS color scheme unless `dark` forces the dark tokens (the
 * landing page, whose backdrop is black). `backdrop` sits behind the column (the
 * landing's dither); `footerExtra` goes under the footer links (the landing's
 * wordmark). `header` replaces the default header row (wordmark + public nav)
 * and `footerLinks` the default footer links, for pages that have their own.
 */
export function SiteFrame({
  children,
  className,
  dark = false,
  backdrop,
  header,
  footerLinks,
  footerExtra,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  backdrop?: ReactNode;
  header?: ReactNode;
  footerLinks?: ReactNode;
  footerExtra?: ReactNode;
}) {
  // When forced dark, the wrapper's class themes this subtree from the first
  // paint; the same class on <html> covers the body behind it and tells
  // useIsDark (canvas node colors) that the page is dark.
  useEffect(() => {
    if (!dark) return;
    const root = document.documentElement;
    root.classList.add(FORCED_DARK_CLASS);
    return () => root.classList.remove(FORCED_DARK_CLASS);
  }, [dark]);

  return (
    <div
      className={cx(
        className,
        dark && FORCED_DARK_CLASS,
        "relative isolate flex min-h-full flex-col overflow-x-clip bg-bg text-ink",
      )}
      // The forced-dark shell sits on black, under the dither, rather than on the
      // dark tokens' --bg; the joints pick the same value up.
      style={dark ? ({ "--bg": "#000" } as React.CSSProperties) : undefined}
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
                <Link href="/sign-in" className={buttonCls("secondary")}>
                  Sign in
                </Link>
              </nav>
            </>
          )}
        </header>

        <main className="flex-1">{children}</main>

        <footer className="landing-joints landing-joints-top border-t border-line">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 sm:px-10">
            {footerLinks ?? (
              <>
                <Link href="/language" className={navLink}>
                  Docs
                </Link>
                <Link href="/sign-in" className={navLink}>
                  Sign in
                </Link>
              </>
            )}
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
