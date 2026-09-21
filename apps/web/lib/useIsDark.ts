"use client";

import { useEffect, useState } from "react";

/** Class on <html> that forces the dark tokens regardless of the OS (see globals.css). */
export const FORCED_DARK_CLASS = "theme-dark";

/**
 * Tracks the effective color scheme: the OS setting, or dark while a page has
 * forced it on <html>. SSR-safe; starts light, corrects on mount.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(mq.matches || root.classList.contains(FORCED_DARK_CLASS));
    sync();
    mq.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);
  return isDark;
}

/** Relative luminance (0..1) of a #rrggbb color. */
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Mix a #rrggbb color toward white by `t` (0..1). */
const towardWhite = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/** Brand colors that are near-black vanish on a dark canvas — lift them. */
export function displayColor(hex: string | undefined, isDark: boolean): string | undefined {
  if (!hex || !isDark || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const lum = luminance(hex);
  if (lum >= 0.22) return hex;
  return towardWhite(hex, 0.55 - lum);
}
