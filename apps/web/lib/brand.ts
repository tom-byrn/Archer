/**
 * The brand page's data (`/branding`). Values come straight from
 * app/globals.css, so the page shows what the product actually uses; this
 * module only adds names, roles and grouping on top.
 */

/** Custom properties keyed by name without the leading `--`. */
export type Decls = Record<string, string>;

export interface BrandTokens {
  /** `:root`: the light theme, plus the tokens both themes share. */
  light: Decls;
  /** The dark theme: `:root` with the `[data-theme="dark"]` overrides applied. */
  dark: Decls;
  /** `@theme inline`: what Tailwind exposes (colors, radii, text sizes, fonts). */
  theme: Decls;
}

/** The body of the first brace-matched block after `header`. */
function block(css: string, header: string): string {
  const at = css.indexOf(header);
  const open = at < 0 ? -1 : css.indexOf("{", at);
  if (open < 0) throw new Error(`globals.css: no "${header}" block`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`globals.css: unclosed "${header}" block`);
}

const decls = (body: string): Decls =>
  Object.fromEntries(
    [...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim().replace(/\s+/g, " "),
    ]),
  );

export function parseBrandTokens(css: string): BrandTokens {
  const light = decls(block(css, ":root"));
  // With the brace, so selectors that only start the same way don't match.
  const dark = { ...light, ...decls(block(css, ':root[data-theme="dark"] {')) };
  return { light, dark, theme: decls(block(css, "@theme inline")) };
}

export const isColor = (value: string | undefined): boolean =>
  value !== undefined && /^(#|rgba?\()/.test(value);

/** The Tailwind color name a token is exposed as (`surface-2` for `--surface-2`), if any. */
export function colorUtility(theme: Decls, token: string): string | undefined {
  const hit = Object.entries(theme).find(([k, v]) => k.startsWith("color-") && v === `var(--${token})`);
  return hit?.[0].slice("color-".length);
}

/** Radius scale in Tailwind order (`rounded-xs` … `rounded-xl`). */
export const radii = (theme: Decls) =>
  Object.entries(theme)
    .filter(([k]) => k.startsWith("radius-"))
    .map(([k, v]) => ({ name: k.slice("radius-".length), value: v }));

/** Text scale: `text-xs` … `text-display`, each with its line height. */
export const textSizes = (theme: Decls) =>
  Object.entries(theme)
    .filter(([k]) => k.startsWith("text-") && !k.includes("--"))
    .map(([k, v]) => {
      const name = k.slice("text-".length);
      return { name, size: v, lineHeight: theme[`${k}--line-height`] };
    });

/* ------------------------------------------------------------------ Groups */

export interface TokenRole {
  token: string;
  role: string;
}

export interface TokenGroup {
  title: string;
  note: string;
  /** Utility prefix to show for tokens Tailwind exposes (`bg` → `bg-surface`). */
  prefix?: "bg" | "text" | "border";
  tokens: TokenRole[];
}

/**
 * Every color token, grouped. Tokens added to globals.css but missing here
 * still show up, under "Other" (see `groupedColors`).
 */
export const COLOR_GROUPS: TokenGroup[] = [
  {
    title: "Surfaces",
    note: "One warm-neutral ramp, stepping from the page to a panel to a hover.",
    prefix: "bg",
    tokens: [
      { token: "bg", role: "Page background" },
      { token: "surface", role: "Panels, cards, inputs, canvas nodes" },
      { token: "surface-2", role: "Hover fills, inset controls, inline code" },
      { token: "surface-3", role: "Active and pressed states" },
    ],
  },
  {
    title: "Ink",
    note: "Three text strengths. Primary buttons are filled with ink.",
    prefix: "text",
    tokens: [
      { token: "ink", role: "Primary text, primary buttons" },
      { token: "ink-2", role: "Secondary text and labels" },
      { token: "ink-3", role: "Hints, placeholders, eyebrows" },
    ],
  },
  {
    title: "Lines",
    note: "1px borders and rules; the stronger line where rules meet or on hover.",
    prefix: "border",
    tokens: [
      { token: "line", role: "Borders and rules" },
      { token: "line-2", role: "Hovered borders, rule joints" },
    ],
  },
  {
    title: "Accent",
    note: "The one brand color: focus, selection and anything an agent touched.",
    prefix: "bg",
    tokens: [
      { token: "accent", role: "Focus ring, toggles, agent marks" },
      { token: "accent-hover", role: "Accent under the pointer" },
      { token: "accent-ink", role: "Text and icons on accent" },
      { token: "accent-soft", role: "Accent tint: chips, selection" },
    ],
  },
  {
    title: "Status",
    note: "Errors, destructive actions and drift between a diagram and its code.",
    prefix: "text",
    tokens: [
      { token: "danger", role: "Errors, destructive actions" },
      { token: "danger-soft", role: "Danger tint" },
      { token: "warn", role: "Warnings, drift" },
      { token: "warn-soft", role: "Warning tint" },
    ],
  },
  {
    title: "Canvas",
    note: "The diagram's ground, its 40px dot grid and connectors.",
    prefix: "bg",
    tokens: [
      { token: "ground", role: "Canvas background" },
      { token: "dot", role: "Grid dots" },
      { token: "edge", role: "Connectors" },
      { token: "edge-strong", role: "Hovered connectors" },
    ],
  },
  {
    title: "Code",
    note: "The code pane and docs code blocks.",
    tokens: [
      { token: "code-bg", role: "Code background" },
      { token: "code-fg", role: "Code text" },
      { token: "code-gutter", role: "Line numbers" },
      { token: "code-line", role: "Active line" },
      { token: "code-caret", role: "Caret" },
      { token: "code-selection", role: "Selected text" },
    ],
  },
  {
    title: "Syntax",
    note: "Highlighting for Archer source, in the editor and the docs.",
    tokens: [
      { token: "tok-kw", role: "Keywords: arch, component, layout" },
      { token: "tok-string", role: "Strings" },
      { token: "tok-type", role: "Types: @aws.lambda" },
      { token: "tok-arrow", role: "Connection arrows" },
      { token: "tok-num", role: "Numbers" },
      { token: "tok-comment", role: "Comments" },
      { token: "tok-fence", role: "Payload fences" },
      { token: "tok-payload", role: "Fenced payloads" },
      { token: "tok-version", role: "Versions: v0.1" },
    ],
  },
  {
    title: "Landing",
    note: "The landing page's own background, and the dithered fade down its first screen.",
    tokens: [
      { token: "landing-bg", role: "Landing page background" },
      { token: "landing-fade", role: "Top of the backdrop's fade" },
    ],
  },
];

/** COLOR_GROUPS limited to tokens that exist, plus any unlisted color token under "Other". */
export function groupedColors(tokens: BrandTokens): TokenGroup[] {
  const listed = new Set(COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t.token)));
  const other = Object.keys(tokens.light)
    .filter((t) => isColor(tokens.light[t]) && !listed.has(t))
    .map((token) => ({ token, role: "" }));
  const groups = COLOR_GROUPS.map((g) => ({
    ...g,
    tokens: g.tokens.filter((t) => isColor(tokens.light[t.token])),
  }));
  if (other.length) groups.push({ title: "Other", note: "Not yet described here.", tokens: other });
  return groups.filter((g) => g.tokens.length > 0);
}

/* ------------------------------------------------------------ Code sample */

const FENCE = "```";

/** The brand page's code specimen: short, but touches every syntax token. */
export const BRAND_CODE_SAMPLE = `# Payments, in brief
arch "Billing" v0.1

component api "Billing API" @vercel.functions {
  env yaml ${FENCE}
  STRIPE_SECRET_KEY: secret
  ${FENCE}
}

component db "Billing DB" @postgres

component stripe "Stripe" @stripe

api -> db @sql
api -> stripe @http : "charges"

layout {
  api: { at: [0, 0], size: [4, 3] }
  db: { at: [7, 0], size: [4, 3] }
  stripe: { at: [7, 5], size: [4, 3] }
}
`;
