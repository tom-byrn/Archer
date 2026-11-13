/**
 * The theme: the viewer's System / Light / Dark choice (as on the web, where
 * it's the account menu's setting), remembered on the device.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { DARK, LIGHT, type Palette } from "./tokens";
import { getPref, setPref } from "./storage";

export type ThemeChoice = "system" | "light" | "dark";

interface ThemeState {
  palette: Palette;
  dark: boolean;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  /** Monospace font for code and type tags. */
  mono: string;
}

const KEY = "archer.theme";
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: 'ui-monospace, "SF Mono", Menlo, monospace' });

const ThemeContext = createContext<ThemeState>({
  palette: LIGHT,
  dark: false,
  choice: "system",
  setChoice: () => {},
  mono: MONO,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    getPref(KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setChoiceState(v);
    });
  }, []);

  const value = useMemo<ThemeState>(() => {
    const dark = choice === "system" ? system === "dark" : choice === "dark";
    return {
      palette: dark ? DARK : LIGHT,
      dark,
      choice,
      setChoice: (c) => {
        setChoiceState(c);
        void setPref(KEY, c);
      },
      mono: MONO,
    };
  }, [choice, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeState => useContext(ThemeContext);
