"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { AccountMenu } from "./AccountMenu";
import { SiteFrame, siteNavLinkCls } from "./landing/SiteFrame";
import { buttonCls } from "./ui";

/**
 * The missing path, read after mount: the 404 page is prerendered once and
 * served for every unknown URL, so the server can't know it.
 */
function useRequestedPath(): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    const raw = window.location.pathname;
    try {
      setPath(decodeURI(raw));
    } catch {
      setPath(raw);
    }
  }, []);
  return path;
}

/**
 * The 404 page in the site shell. Signed-in visitors (most of them: the
 * middleware sends signed-out ones to sign-in first, outside the public
 * routes) get their account menu instead of "Sign in". `children` is the
 * server-rendered request document.
 */
export function NotFound({ children }: { children: ReactNode }) {
  const path = useRequestedPath();
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <SiteFrame
      header={
        <>
          <Link href="/" className="flex items-center gap-2.5 rounded-sm">
            <span className="font-display text-[19px] leading-none text-ink">Archer</span>
          </Link>
          <nav className="ml-auto flex items-center gap-5">
            <Link href="/language" className={siteNavLinkCls}>
              Docs
            </Link>
            {isSignedIn ? (
              <AccountMenu />
            ) : (
              isLoaded && (
                <Link href="/sign-in" className={buttonCls("secondary")}>
                  Sign in
                </Link>
              )
            )}
          </nav>
        </>
      }
      footerLinks={
        <Link href="/language" className={siteNavLinkCls}>
          Docs
        </Link>
      }
      footerExtra={
        <div className="overflow-hidden px-5 pt-4 sm:px-10" aria-hidden>
          <div className="landing-wordmark">404</div>
        </div>
      }
    >
      {/* No rule of its own: the hero is short, so the footer's top rule closes it. */}
      <section>
        <div className="grid items-center gap-x-14 gap-y-12 px-5 pb-14 pt-16 sm:px-10 sm:pb-20 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0">
            <p className="landing-rise mono flex min-w-0 items-center gap-2 text-sm text-ink-3">
              <span className="shrink-0">404</span>
              {path && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{path}</span>
                </>
              )}
            </p>
            <h1
              className="landing-rise font-display max-w-[14ch] text-balance pt-5 text-display-sm text-ink sm:text-display"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              This page doesn’t resolve.
            </h1>
            <p
              className="landing-rise max-w-[44ch] pt-6 text-lede text-ink-2"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Nothing in Archer is declared at this address. The link may be out of date, or the
              page may have moved.
            </p>
            <div
              className="landing-rise flex flex-wrap gap-2 pt-8"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <Link href="/" className={buttonCls("primary")}>
                {isSignedIn ? "Back to your documents" : "Back to Archer"}
              </Link>
              <Link href="/language" className={buttonCls("secondary")}>
                Read the docs
              </Link>
            </div>
          </div>
          <div className="landing-rise min-w-0" style={{ "--i": 4 } as React.CSSProperties}>
            {children}
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
