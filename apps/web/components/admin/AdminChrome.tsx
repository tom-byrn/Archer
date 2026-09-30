"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { ThemeToggle } from "../ThemeToggle";
import { Button, Chip, Icon, Segmented, cx } from "../ui";

export const ADMIN_BASE = "/admin-dashboard";

const TABS = [
  { href: ADMIN_BASE, label: "Overview" },
  { href: `${ADMIN_BASE}/users`, label: "Users" },
  { href: `${ADMIN_BASE}/documents`, label: "Documents" },
  { href: `${ADMIN_BASE}/agents`, label: "Agents" },
  { href: `${ADMIN_BASE}/activity`, label: "Activity" },
];

export const RANGES = ["7", "30", "90"] as const;

/** The admin console's frame: header, tabs, and the range and "hide me" filters every tab shares. */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const query = params.toString();
  const range = (RANGES as readonly string[]).includes(params.get("range") ?? "") ? params.get("range")! : "30";
  const hideSelf = params.get("self") === "hide";

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href={ADMIN_BASE} className="flex items-center gap-2 rounded-sm">
            <span className="font-display text-[18px] leading-none">Archer</span>
            <Chip tone="accent">Admin</Chip>
          </Link>
          <nav className="ml-2 hidden items-center gap-0.5 md:flex" aria-label="Admin sections">
            {TABS.map((t) => {
              const active = t.href === ADMIN_BASE ? pathname === t.href : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={query ? `${t.href}?${query}` : t.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-md px-2.5 py-1 text-sm font-medium transition-colors duration-100",
                    active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {pending && <span className="text-xs text-ink-3">Loading…</span>}
            <Button size="sm" variant="ghost" icon={<Icon.Restore />} onClick={() => startTransition(() => router.refresh())}>
              Refresh
            </Button>
            <ThemeToggle />
            <Link href="/" className="hidden text-sm text-ink-2 hover:text-ink sm:inline">
              Back to app
            </Link>
          </div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Admin sections">
          {TABS.map((t) => {
            const active = t.href === ADMIN_BASE ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={query ? `${t.href}?${query}` : t.href}
                className={cx(
                  "shrink-0 rounded-md px-2.5 py-1 text-sm font-medium",
                  active ? "bg-surface-3 text-ink" : "text-ink-2",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 py-4">
          <Segmented
            label="Time range"
            value={range}
            options={RANGES.map((r) => ({ value: r, label: `${r} days` }))}
            onChange={(v) => go({ range: v === "30" ? null : v })}
          />
          <Segmented
            label="Your own activity"
            value={hideSelf ? "hide" : "show"}
            options={[
              { value: "show", label: "Everyone" },
              { value: "hide", label: "Everyone but me" },
            ]}
            onChange={(v) => go({ self: v === "hide" ? "hide" : null })}
          />
          <span className="text-xs text-ink-3">Days are UTC.</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A titled card on an admin page. */
export function Panel({
  title,
  action,
  children,
  className,
  flush,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (tables). */
  flush?: boolean;
}) {
  return (
    <section className={cx("min-w-0 rounded-lg border border-line bg-surface", className)}>
      <header className="flex h-10 items-center gap-2 border-b border-line px-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">{action}</div>}
      </header>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** A person's picture, or their initials. */
export function Avatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const initials = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-line bg-surface-2 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[10px] font-semibold text-ink-2"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}
