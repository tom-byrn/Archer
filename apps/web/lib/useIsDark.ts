"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, readThemeChoice, type ThemeChoice } from "./theme";

const subscribeToTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

/**
 * Whether the page shows the dark theme: the viewer's choice, or the OS scheme
 * until they make one (lib/theme.ts). SSR-safe; starts light, corrects on mount.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.getAttribute("data-theme") === "dark",
    () => false,
  );
}

const subscribeToChoice = (onChange: () => void) => {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** The viewer's theme choice, "system" until they pick light or dark. SSR-safe. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeToChoice, readThemeChoice, () => "system");
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
