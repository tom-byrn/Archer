"use client";

import type { ReactNode } from "react";
import { switchTheme, type ThemeChoice } from "@/lib/theme";
import { useIsDark, useThemeChoice } from "@/lib/useIsDark";
import { Icon, IconButton, Segmented } from "./ui";

/**
 * The landing and docs headers' theme button: one click flips between light
 * and dark, the new theme spreading from the button (switchTheme). The moon
 * offers dark and the sun light. Both sit in one spot and CSS shows the one
 * for the page's theme, turning the other out as it turns in (globals.css),
 * so the icon is right from the first paint.
 */
export function ThemeToggle() {
  const isDark = useIsDark();
  return (
    <IconButton
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={(e) => switchTheme(isDark ? "light" : "dark", e.currentTarget)}
    >
      <span className="grid *:col-start-1 *:row-start-1 *:h-[18px] *:w-[18px]">
        <Icon.Moon className="theme-toggle-moon" />
        <Icon.Sun className="theme-toggle-sun" />
      </span>
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
  return <Segmented label="Theme" value={choice} options={CHOICES} onChange={switchTheme} />;
}
