"use client";

import Link from "next/link";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { buttonCls } from "@/components/ui";

export default function NotFound() {
  return (
    <SiteFrame>
      <section className="px-5 py-20 sm:px-10 sm:py-28">
        <p className="mono text-sm text-ink-3">404</p>
        <h1 className="font-display pt-3 text-display-sm text-ink">Page not found</h1>
        <p className="max-w-[46ch] pt-4 text-lede text-ink-2">
          The link may be out of date, or the page may have moved.
        </p>
        <div className="flex flex-wrap gap-2 pt-8">
          <Link href="/" className={buttonCls("primary")}>
            Back to Archer
          </Link>
          <Link href="/language" className={buttonCls("secondary")}>
            Read the docs
          </Link>
        </div>
      </section>
    </SiteFrame>
  );
}
