/**
 * Adapts the share image's SVG to what react-native-svg draws on a device.
 * Runs on the tree react-native-svg's `parse` builds (props camelCased,
 * numbers converted) before it becomes elements:
 *
 * - Icons are nested `<svg>`s with a viewBox, which react-native-svg places
 *   at the origin: each becomes a `<g>` with the same transform, and the
 *   `color` it set is written into the `currentColor` its paths use.
 * - Text holds XML character references (`&amp;`), which the parser keeps as
 *   written: they're decoded.
 * - Font stacks (`-apple-system, "Inter", …`) name one font on a device.
 * - `orient="auto-start-reverse"` and `em` letter spacing become what native
 *   markers and text understand.
 *
 * Pure, so it's tested without a device (test/nativeSvg.test.ts).
 */

export interface SvgNode {
  tag: string;
  props: Record<string, unknown>;
  children: (SvgNode | string)[];
}

export interface NativeSvgOptions {
  /** The monospace font to draw type tags in ("Menlo" on iOS, "monospace" on Android). */
  mono: string;
  /** The sans font for everything else; unset keeps the platform default. */
  sans?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export const decodeEntities = (text: string): string =>
  text.replace(/&(?:#(\d{1,7})|#x([\da-f]{1,6})|(\w+));/gi, (ref, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return ENTITIES[name] ?? ref;
    const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ref;
  });

const COLOR_PROPS = ["fill", "stroke", "stopColor", "floodColor", "lightingColor", "color"];

const isCurrent = (v: unknown): boolean => typeof v === "string" && v.toLowerCase() === "currentcolor";

/** Write `color` wherever a node or its descendants paint in currentColor. */
function paintCurrentColor(node: SvgNode, color: string): void {
  for (const key of COLOR_PROPS) if (isCurrent(node.props[key])) node.props[key] = color;
  const style = node.props.style;
  if (style && typeof style === "object") {
    const s = style as Record<string, unknown>;
    for (const key of COLOR_PROPS) if (isCurrent(s[key])) s[key] = color;
  }
  for (const child of node.children) if (typeof child !== "string") paintCurrentColor(child, color);
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

/** The transform that maps a nested svg's viewBox onto its box (`xMidYMid meet`). */
export function viewBoxTransform(props: Record<string, unknown>): string {
  const x = num(props.x);
  const y = num(props.y);
  const w = num(props.width);
  const h = num(props.height);
  const vb = String(props.viewBox ?? `0 0 ${w} ${h}`)
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [vx = 0, vy = 0, vw = w, vh = h] = vb;
  if (!(vw > 0) || !(vh > 0)) return `translate(${x} ${y})`;
  const s = Math.min(w / vw, h / vh);
  const tx = x + (w - vw * s) / 2 - vx * s;
  const ty = y + (h - vh * s) / 2 - vy * s;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return `translate(${r(tx)} ${r(ty)}) scale(${r(s)})`;
}

function adapt(node: SvgNode, opts: NativeSvgOptions, root: boolean): void {
  if (root) {
    delete node.props.role;
    delete node.props.ariaLabel;
  } else if (node.tag === "svg") {
    const style = node.props.style as Record<string, unknown> | undefined;
    const color = (style?.color ?? node.props.color) as string | undefined;
    node.tag = "g";
    node.props = { transform: viewBoxTransform(node.props) };
    if (typeof color === "string") paintCurrentColor(node, color);
  }

  const family = node.props.fontFamily;
  if (typeof family === "string") {
    if (/monospace|mono\b|menlo/i.test(family)) node.props.fontFamily = opts.mono;
    else if (opts.sans) node.props.fontFamily = opts.sans;
    else delete node.props.fontFamily;
  }
  const spacing = node.props.letterSpacing;
  if (typeof spacing === "string" && spacing.endsWith("em"))
    node.props.letterSpacing = parseFloat(spacing) * num(node.props.fontSize, 12);
  if (node.props.orient === "auto-start-reverse") node.props.orient = "auto";

  node.children = node.children
    .filter((c) => typeof c === "string" || c.tag !== "title")
    .map((c) => (typeof c === "string" ? decodeEntities(c) : c));
  for (const child of node.children) if (typeof child !== "string") adapt(child, opts, false);
}

/** Adapt a parsed share-image tree in place (see the module comment); returns it. */
export function adaptSvgTree<T extends SvgNode>(root: T, opts: NativeSvgOptions): T {
  adapt(root, opts, true);
  return root;
}
