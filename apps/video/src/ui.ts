/** Small pieces of Archer UI, drawn with the app's tokens. */
import { lookupType } from "@archer/catalog";
import { displayColor } from "../../web/lib/svg";
import { glyph } from "./diagram";
import { h } from "./dom";

/** Mix two #rrggbb colors: `t` of `a`, the rest `b` (CSS color-mix in srgb). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * t + ((pb >> shift) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** A catalog type's color as the dark canvas draws it. */
export function typeColor(tag: string): string {
  const t = lookupType(tag);
  return t ? displayColor(t.color, true) : "#8a8479";
}

/**
 * A type's glyph on its tinted tile, like the landing page's glyph carousel
 * (`.landing-glyph-tile`): a 12% wash of the color with a 30% border.
 */
export function typeTile(tag: string, size: number, ground = "#121315"): HTMLDivElement {
  const t = lookupType(tag);
  const color = typeColor(tag);
  const g = glyph(t?.glyph ?? "box", color);
  g.setAttribute("width", String(Math.round(size * 0.46)));
  g.setAttribute("height", String(Math.round(size * 0.46)));
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.round(size * 0.1),
        border: `${Math.max(1, size / 60)}px solid ${mix(color, ground, 0.3)}`,
        background: mix(color, ground, 0.12),
      },
    },
    g,
  );
}

/** A window: traffic lights, a title, and a body to fill. */
export function windowEl(o: { x: number; y: number; w: number; h: number; title: string; icon?: Node }): {
  el: HTMLDivElement;
  body: HTMLDivElement;
} {
  const body = h("div", { style: { position: "relative", height: o.h - 56, boxSizing: "border-box" } });
  const el = h(
    "div",
    { class: "window", style: { left: o.x, top: o.y, width: o.w, height: o.h } },
    h(
      "div",
      { class: "titlebar" },
      h(
        "div",
        { class: "lights" },
        h("i", { style: { background: "var(--close)" } }),
        h("i", { style: { background: "var(--minimize)" } }),
        h("i", { style: { background: "var(--zoom)" } }),
      ),
      o.icon ?? null,
      o.title,
    ),
    body,
  );
  return { el, body };
}

/** A small rounded label (state pills, type chips). */
export function pill(text: string | Node[], o: { color?: string; bg?: string; size?: number; mono?: boolean; icon?: Node } = {}): HTMLSpanElement {
  const size = o.size ?? 20;
  return h(
    "span",
    {
      class: o.mono ? "mono" : "",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: `${Math.round(size * 0.4)}px`,
        height: Math.round(size * 1.8),
        padding: `0 ${Math.round(size * 0.6)}px`,
        borderRadius: Math.round(size * 0.35),
        fontSize: size,
        fontWeight: o.mono ? 400 : 600,
        color: o.color ?? "var(--ink-2)",
        background: o.bg ?? "var(--surface-2)",
        whiteSpace: "nowrap",
      },
    },
    o.icon ?? null,
    ...(typeof text === "string" ? [text] : text),
  );
}
