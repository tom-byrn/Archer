/**
 * Kinetic type: words in clipping masks that rise into view and leave
 * upward. `*word*` marks a word in the accent colour; a trailing period is
 * always accent (the film's punctuation mark).
 */
import { h } from "./dom";
import { gsap, master } from "./engine";

/** How far below its mask a hidden word waits (past the serif's tall ascenders). */
const HIDDEN = 150;

export interface Words {
  el: HTMLDivElement;
  words: HTMLSpanElement[];
}

/** Fill `el` with masked words; "\n" breaks the line. */
export function fillWords(el: HTMLElement, text: string): HTMLSpanElement[] {
  const inner: HTMLSpanElement[] = [];
  text.split("\n").forEach((line, li) => {
    if (li > 0) el.append(h("br"));
    line
      .split(" ")
      .filter(Boolean)
      .forEach((raw, i) => {
        if (i > 0) el.append(" ");
        const accent = /^\*.*\*[.,!?]?$/.test(raw);
        const word = raw.replace(/\*/g, "");
        const span = h("span");
        const m = /^(.*?)([.!?])$/.exec(word);
        if (accent) span.className = "accent";
        if (m && !accent) {
          span.append(m[1]!, h("span", { class: "accent" }, m[2]!));
        } else span.textContent = word;
        el.append(h("span", { class: "w" }, span));
        inner.push(span);
      });
  });
  return inner;
}

export interface CaptionOpts {
  x: number;
  y: number;
  size: number;
  /** Which point of the caption sits at (x, y): its left/centre/right edge, top. */
  anchor?: "left" | "center" | "right";
  class?: string;
  color?: string;
  weight?: number;
  lineHeight?: number;
}

export function caption(parent: HTMLElement, text: string, o: CaptionOpts): Words {
  const el = h("div", {
    class: `caption ${o.class ?? ""}`.trim(),
    style: {
      left: o.x,
      top: o.y,
      fontSize: o.size,
      ...(o.color ? { color: o.color } : {}),
      ...(o.weight ? { fontWeight: o.weight } : {}),
      ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}),
    },
  });
  if (o.anchor === "center") el.style.transform = "translateX(-50%)";
  if (o.anchor === "right") el.style.transform = "translateX(-100%)";
  if (o.anchor === "center") el.style.textAlign = "center";
  const words = fillWords(el, text);
  parent.append(el);
  gsap.set(words, { yPercent: HIDDEN });
  return { el, words };
}

/** Words rise into their masks from below. */
export function riseIn(
  words: Element[],
  t: number,
  o: { dur?: number; stagger?: number; ease?: string } = {},
): void {
  master.fromTo(
    words,
    { yPercent: HIDDEN },
    {
      yPercent: 0,
      duration: o.dur ?? 0.55,
      stagger: o.stagger ?? 0.05,
      ease: o.ease ?? "expo.out",
      immediateRender: false,
    },
    t,
  );
}

/** Words leave upward out of their masks. */
export function riseOut(
  words: Element[],
  t: number,
  o: { dur?: number; stagger?: number; ease?: string } = {},
): void {
  master.fromTo(
    words,
    { yPercent: 0 },
    {
      yPercent: -HIDDEN,
      duration: o.dur ?? 0.3,
      stagger: o.stagger ?? 0.02,
      ease: o.ease ?? "power3.in",
      immediateRender: false,
    },
    t,
  );
}

/**
 * A soft dark pool behind the top-left captions, for shots whose picture is
 * busy there. Fades in at `from`, out at `to`.
 */
export function shade(parent: HTMLElement, from: number, to: number): HTMLDivElement {
  const el = h("div", {
    class: "abs",
    style: {
      width: 1920,
      height: 1080,
      background: "radial-gradient(ellipse 1300px 520px at 18% 12%, rgba(0,0,0,.78), rgba(0,0,0,.45) 45%, rgba(0,0,0,0) 75%)",
      opacity: 0,
    },
  });
  parent.prepend(el);
  master.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, from);
  master.to(el, { opacity: 0, duration: 0.2, ease: "power2.in" }, to - 0.2);
  return el;
}
