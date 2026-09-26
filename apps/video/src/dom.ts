/** Tiny element builders: the film is plain DOM, built once, animated by GSAP. */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  style?: Partial<Record<keyof CSSStyleDeclaration | `--${string}`, string | number>>;
  html?: string;
  attrs?: Record<string, string | number>;
}

function apply(el: Element & ElementCSSInlineStyle, props: Props | undefined, children: Child[]) {
  if (props?.class) el.setAttribute("class", props.class);
  if (props?.style)
    for (const [k, v] of Object.entries(props.style)) {
      if (v === undefined) continue;
      const value = typeof v === "number" && !k.startsWith("--") && !UNITLESS.has(k) ? `${v}px` : String(v);
      if (k.startsWith("--")) el.style.setProperty(k, value);
      else (el.style as unknown as Record<string, string>)[k] = value;
    }
  if (props?.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, String(v));
  if (props?.html !== undefined) el.innerHTML = props.html;
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
}

const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flexGrow", "flexShrink", "scale"]);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, props, children);
  return el;
}

const NS = "http://www.w3.org/2000/svg";

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  apply(el, { attrs }, children);
  return el;
}

/** Parse an SVG string (an icon, a glyph) into an element. */
export function svgFrom(markup: string): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGSVGElement;
}

/** An absolutely positioned full-stage layer, hidden until its scene shows it. */
export function layer(parent: HTMLElement, cls = ""): HTMLDivElement {
  const el = h("div", { class: `layer ${cls}`.trim() });
  parent.append(el);
  return el;
}
