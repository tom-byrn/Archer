/**
 * `.arch` source as the editor shows it: the app's own highlighter
 * (apps/web/lib/highlightArch.ts, the CodeMirror tokenizer) with the dark
 * theme's token colours, a gutter, the landing page's changed-line flash,
 * and typing with a block caret.
 */
import { highlightArch } from "../../web/lib/highlightArch";
import { cue } from "./cues";
import { h } from "./dom";
import { gsap, master } from "./engine";

export interface CodeLine {
  el: HTMLDivElement;
  src: HTMLSpanElement;
  flash: HTMLDivElement;
  chars: HTMLSpanElement[];
}

export interface CodeView {
  el: HTMLDivElement;
  lines: CodeLine[];
  /** One character's advance and one line's height, in px. */
  charW: number;
  lineH: number;
  gutterW: number;
}

export interface CodeOpts {
  size: number;
  lineHeight?: number;
  /** Line numbers (default true). */
  gutter?: boolean;
  /** First line number. */
  start?: number;
  /** Wrap every character in its own span (needed to type a line). */
  chars?: boolean;
}

let measured = new Map<number, number>();
/** Advance of one Geist Mono character at `size` px. */
export function charWidth(size: number): number {
  if (!measured.has(size)) {
    const probe = h("span", { class: "mono", style: { fontSize: size, position: "absolute", visibility: "hidden" } }, "0".repeat(50));
    document.body.append(probe);
    measured.set(size, probe.getBoundingClientRect().width / 50);
    probe.remove();
  }
  return measured.get(size)!;
}

export function codeBlock(source: string, o: CodeOpts): CodeView {
  const lineH = Math.round(o.size * (o.lineHeight ?? 1.6));
  const charW = charWidth(o.size);
  const tokens = highlightArch(source);
  const digits = String((o.start ?? 1) + tokens.length).length;
  const gutterW = o.gutter === false ? 0 : Math.round(charW * (digits + 2.2));
  const el = h("div", { class: "code", style: { fontSize: o.size, lineHeight: `${lineH}px` } });
  const lines = tokens.map((line, i) => {
    const flash = h("div", { class: "flash" });
    const src = h("span", { style: { position: "relative" } });
    const chars: HTMLSpanElement[] = [];
    for (const tok of line) {
      if (o.chars) {
        for (const ch of tok.text) {
          const span = h("span", tok.className ? { class: tok.className } : {}, ch);
          chars.push(span);
          src.append(span);
        }
      } else src.append(tok.className ? h("span", { class: tok.className }, tok.text) : tok.text);
    }
    if (line.length === 0) src.append("​");
    const row = h(
      "div",
      { class: "ln", style: { height: lineH } },
      flash,
      o.gutter === false
        ? null
        : h("span", { class: "gut", style: { width: gutterW - charW * 1.4, marginRight: charW * 1.4, position: "relative" } }, String((o.start ?? 1) + i)),
      src,
    );
    el.append(row);
    return { el: row, src, flash, chars };
  });
  return { el, lines, charW, lineH, gutterW };
}

/** The landing page's changed-line flash: accent wash + left rule, fading out. */
export function flashLine(line: CodeLine, t: number, dur = 1.4): void {
  master.fromTo(line.flash, { opacity: 1 }, { opacity: 0, duration: dur, ease: "power2.in", immediateRender: false }, t);
}

export interface Typing {
  /** Seconds the typing takes. */
  dur: number;
  end: number;
}

/**
 * Type `line` (built with `chars: true`) from `t`: characters appear at
 * keyboard pace with a block caret riding the end; a key cue for each.
 */
export function typeLine(
  view: CodeView,
  line: CodeLine,
  t: number,
  o: { cps?: number; caretAfter?: number; sound?: boolean } = {},
): Typing {
  const cps = o.cps ?? 34;
  const caret = h("span", {
    class: "caret",
    style: {
      position: "absolute",
      top: Math.round(view.lineH * 0.18),
      height: Math.round(view.lineH * 0.64),
      width: Math.max(3, Math.round(view.charW * 0.12)),
      left: 0,
      background: "var(--accent)",
      opacity: 0,
    },
  });
  line.src.append(caret);
  // Opacity, not visibility: a visible child would show through a hidden layer.
  gsap.set(line.chars, { opacity: 0 });
  // Deterministic jitter: a human rhythm without Math.random coupling scenes.
  let at = t;
  const times: number[] = [];
  line.chars.forEach((_, i) => {
    const wobble = ((i * 7919) % 13) / 13 - 0.5;
    at += (1 / cps) * (1 + wobble * 0.7);
    times.push(at);
  });
  master.set(caret, { opacity: 1, x: 0 }, t);
  line.chars.forEach((ch, i) => {
    master.set(ch, { opacity: 1 }, times[i]!);
    master.set(caret, { x: (i + 1) * view.charW }, times[i]!);
    if (o.sound !== false && i % 2 === 0) cue(times[i]!, "key", { gain: 0.6 + ((i * 31) % 7) / 20 });
  });
  const end = times[times.length - 1] ?? t;
  master.set(caret, { opacity: 0 }, end + (o.caretAfter ?? 0.25));
  return { dur: end - t, end };
}
