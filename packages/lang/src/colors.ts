/**
 * A component's own color (spec §3.3, `color blue` in its body): drawn in
 * place of its type's, on its icon, its tile and its outline. The language
 * owns the palette so every tool agrees on it. Add colors freely, never
 * rename or remove one: documents store them by name.
 *
 * The list is in picker order: around the color wheel, then the neutral.
 */
export const COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
] as const;

export type ColorName = (typeof COLORS)[number];

/** Each named color as #rrggbb. Mid-tones, so they read on light and dark grounds. */
export const COLOR_HEX: Record<ColorName, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
  slate: "#64748b",
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const isColorName = (v: string | undefined): v is ColorName =>
  v !== undefined && (COLORS as readonly string[]).includes(v);

/** Whether `v` is a color the language knows: a palette name or `#rrggbb`. */
export const isColor = (v: string | undefined): v is string =>
  v !== undefined && (isColorName(v) || HEX_RE.test(v));

/**
 * What a `color` value draws as, #rrggbb (a hex value lowercased), or
 * undefined for none or one the language doesn't know.
 */
export function resolveColor(v: string | undefined): string | undefined {
  if (isColorName(v)) return COLOR_HEX[v];
  return v !== undefined && HEX_RE.test(v) ? v.toLowerCase() : undefined;
}
