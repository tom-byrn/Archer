"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { lookupType, type Logo } from "@archer/catalog";
import { displayColor, useIsDark } from "@/lib/useIsDark";

type Logos = Readonly<Record<string, Logo>>;

const NONE: Logos = {};

/**
 * The product logos and vendor icons catalog types draw with
 * (`@archer/catalog/logos`). Empty unless a LogoProvider is above: the editor,
 * the document viewer and the dashboard have one; the landing page (its
 * sandbox included) and other marketing surfaces don't, so they keep the
 * generic glyphs.
 */
export const LogoContext = createContext<Logos>(NONE);

// The logos are a chunk of their own (~190 KB gzipped, mostly AWS's icons),
// fetched once something needs them, after first paint.
let loaded: Logos | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  loading ??= import("@archer/catalog/logos").then(
    (m) => {
      loaded = m.LOGOS;
      for (const l of listeners) l();
    },
    // Offline or a stale deploy: keep the glyphs, and try again on the next mount.
    () => {
      loading = undefined;
    },
  );
  return () => {
    listeners.delete(notify);
  };
};

export function LogoProvider({ children }: { children: ReactNode }) {
  // Glyphs on the server and through hydration, logos from then on.
  const logos = useSyncExternalStore(subscribe, () => loaded ?? NONE, () => NONE);
  return <LogoContext.Provider value={logos}>{children}</LogoContext.Provider>;
}

/** The logo a catalog type draws with here, if any. Custom types never have one. */
export function useLogo(tag: string | undefined): Logo | undefined {
  const logos = useContext(LogoContext);
  const key = lookupType(tag)?.logo;
  return key === undefined ? undefined : logos[key];
}

/** A logo at `size` px: a one-colour mark in its brand color, or artwork as it is. */
export function LogoArt({ logo, size, className }: { logo: Logo; size: number; className?: string }) {
  const isDark = useIsDark();
  return (
    <svg
      width={size}
      height={size}
      viewBox={logo.viewBox}
      className={className}
      style={logo.kind === "mono" ? { color: displayColor(logo.color, isDark) } : undefined}
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  );
}
