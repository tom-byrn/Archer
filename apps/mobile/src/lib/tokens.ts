/**
 * The app's design tokens: the web app's (`apps/web/app/globals.css`), copied
 * as literal values because React Native has no CSS variables. Same colors,
 * same radii, same type scale, so the app reads as the same product.
 */

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  /** The canvas behind a diagram, and its dot grid. */
  ground: string;
  dot: string;
  /** The landing page's own page color and the tone its backdrop fades from. */
  landingBg: string;
  landingFade: string;
  /** The dialog backdrop. */
  scrim: string;
  code: CodePalette;
}

export interface CodePalette {
  bg: string;
  fg: string;
  gutter: string;
  /** The active line's wash. */
  line: string;
  kw: string;
  string: string;
  type: string;
  arrow: string;
  num: string;
  comment: string;
  fence: string;
  payload: string;
  version: string;
}

export const LIGHT: Palette = {
  bg: "#fbfaf8",
  surface: "#ffffff",
  surface2: "#f4f2ee",
  surface3: "#eae7e1",
  ink: "#1a1916",
  ink2: "#5f5a52",
  ink3: "#9b958b",
  line: "#e7e3dc",
  line2: "#d2ccc3",
  accent: "#0c8c5e",
  accentInk: "#ffffff",
  accentSoft: "rgba(12, 140, 94, 0.12)",
  danger: "#b42318",
  dangerSoft: "rgba(180, 35, 24, 0.1)",
  warn: "#b54708",
  warnSoft: "rgba(181, 71, 8, 0.12)",
  ground: "#f7f5f1",
  dot: "#d6d0c7",
  landingBg: "#fbfaf8",
  landingFade: "#edeae4",
  scrim: "rgba(10, 10, 8, 0.45)",
  code: {
    bg: "#faf9f7",
    fg: "#3d3934",
    gutter: "#b5afa5",
    line: "rgba(26, 25, 22, 0.05)",
    kw: "#6d3fd6",
    string: "#0b7a52",
    type: "#a85a0a",
    arrow: "#1a1916",
    num: "#b42a6a",
    comment: "#9b958b",
    fence: "#9b958b",
    payload: "#6b665e",
    version: "#0c6d82",
  },
};

export const DARK: Palette = {
  bg: "#0f1012",
  surface: "#161719",
  surface2: "#1c1e21",
  surface3: "#25282c",
  ink: "#ecebe7",
  ink2: "#a5a19a",
  ink3: "#6d6963",
  line: "#26292d",
  line2: "#383c42",
  accent: "#23c088",
  accentInk: "#08110d",
  accentSoft: "rgba(35, 192, 136, 0.16)",
  danger: "#f0655a",
  dangerSoft: "rgba(240, 101, 90, 0.14)",
  warn: "#f2a33a",
  warnSoft: "rgba(242, 163, 58, 0.14)",
  ground: "#121315",
  dot: "#2a2d32",
  landingBg: "#000000",
  landingFade: "#121212",
  scrim: "rgba(10, 10, 8, 0.45)",
  code: {
    bg: "#121315",
    fg: "#d3d1cc",
    gutter: "#4d5057",
    line: "rgba(255, 255, 255, 0.04)",
    kw: "#3dd39c",
    string: "#a5d6ff",
    type: "#7dd3fc",
    arrow: "#f5f4f1",
    num: "#fca5a5",
    comment: "#6d6963",
    fence: "#6d6963",
    payload: "#a5a19a",
    version: "#5eead4",
  },
};

/** globals.css `--radius-*`. */
export const RADIUS = { xs: 3, sm: 4, md: 6, lg: 8, xl: 12 } as const;

/** globals.css `--text-*`: size and line height, exactly. */
export const TEXT = {
  xs: { fontSize: 11, lineHeight: 16 },
  sm: { fontSize: 12, lineHeight: 18 },
  base: { fontSize: 13, lineHeight: 20 },
  lg: { fontSize: 15, lineHeight: 22 },
  xl: { fontSize: 20, lineHeight: 26 },
  "2xl": { fontSize: 26, lineHeight: 32 },
  /** The landing page's lede. */
  lede: { fontSize: 17, lineHeight: 28 },
  /** The landing headline on a phone (`text-display-sm`). */
  "display-sm": { fontSize: 42, lineHeight: 42 },
} as const;

export type TextSize = keyof typeof TEXT;

/** globals.css `--shadow-sm` / `--shadow-md`, as React Native shadows. */
export const SHADOW = {
  sm: { shadowColor: "#1a1916", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#1a1916", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
} as const;

/** One grid cell of the canvas, in diagram pixels (the web's `CELL`). */
export const CELL = 40;
