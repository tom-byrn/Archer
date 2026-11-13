/**
 * The app's design tokens: the web app's (`apps/web/app/globals.css`),
 * copied as literal colors because React Native has no CSS variables. Type
 * runs a step larger than the web's, for phones held at arm's length.
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
  /** The canvas behind a diagram. */
  ground: string;
  code: CodePalette;
}

export interface CodePalette {
  bg: string;
  fg: string;
  gutter: string;
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
  code: {
    bg: "#faf9f7",
    fg: "#3d3934",
    gutter: "#b5afa5",
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
  code: {
    bg: "#121315",
    fg: "#d3d1cc",
    gutter: "#4d5057",
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

export const RADIUS = { xs: 3, sm: 4, md: 6, lg: 8, xl: 12 } as const;

export const TEXT = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 21 },
  lg: { fontSize: 17, lineHeight: 24 },
  xl: { fontSize: 22, lineHeight: 28 },
  "2xl": { fontSize: 28, lineHeight: 34 },
} as const;

export type TextSize = keyof typeof TEXT;

/** Playfair Display, the web app's display face (headings), loaded in the root layout. */
export const DISPLAY_FONT = "PlayfairDisplay_600SemiBold";
