"use client";

import type { ReactNode } from "react";
import { setThemeChoice, type ThemeChoice } from "@/lib/theme";
import { useIsDark, useThemeChoice } from "@/lib/useIsDark";
import { Icon, IconButton, Segmented } from "./ui";

/**
 * The landing and docs headers' theme button: one click flips between light
 * and dark. The moon offers dark and the sun light; CSS picks which one shows
 * (globals.css), so the icon is right from the first paint.
 */
export function ThemeToggle() {
  const isDark = useIsDark();
  return (
    <IconButton
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setThemeChoice(isDark ? "light" : "dark")}
    >
      <Icon.Moon className="theme-light-only" />
      <Icon.Sun className="theme-dark-only" />
    </IconButton>
  );
}

const CHOICES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Icon.Monitor /> },
  { value: "light", label: "Light", icon: <Icon.Sun /> },
  { value: "dark", label: "Dark", icon: <Icon.Moon /> },
];

/** System, light or dark: the theme setting in the account menu. */
export function ThemeSwitcher() {
  const choice = useThemeChoice();
  return <Segmented label="Theme" value={choice} options={CHOICES} onChange={setThemeChoice} />;
}
