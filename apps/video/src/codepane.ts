/**
 * An editor pane whose file grows over time: lines arrive (pasted in from a
 * canvas edit, typed, or written by an agent), the lines under them slide
 * down, the gutter counts up, and each arrival flashes like the landing
 * page's source pane.
 */
import { charWidth, codeBlock, flashLine, streamLine, typeLine, type CodeLine } from "./code";
import { cue } from "./cues";
import { h } from "./dom";
import { gsap, master } from "./engine";

export interface PaneLine {
  text: string;
  /** Seconds the line arrives (omit: there from the start). */
  at?: number;
  /** Typed character by character instead of appearing whole. */
  typed?: boolean;
  /** Written by an agent: streamed in tokens behind a labelled cursor (implies typed). */
  agent?: boolean;
}

export interface CodePane {
  el: HTMLDivElement;
  lines: CodeLine[];
  lineH: number;
  charW: number;
  gutterW: number;
  /** Where line `i` sits (its slot) once everything has arrived, in pane px. */
  slotY(i: number): number;
  /** When a typed line finishes. */
  typedEnd: Map<number, number>;
}

export function codePane(
  lines: PaneLine[],
  o: { size: number; lineHeight?: number; cps?: number; agentLabel?: () => Node },
): CodePane {
  const source = lines.map((l) => l.text).join("\n");
  const view = codeBlock(source, { size: o.size, lineHeight: o.lineHeight, gutter: false, chars: true });
  const { lineH } = view;
  const charW = charWidth(o.size);
  const gutterW = Math.round(charW * 4.2);
  const el = h("div", { class: "code", style: { position: "relative", fontSize: o.size, lineHeight: `${lineH}px` } });
  const gutter = h("div", { style: { position: "absolute", left: 0, top: 0, width: gutterW - charW * 1.6, textAlign: "right", color: "var(--code-gutter)" } });
  const body = h("div", { style: { position: "absolute", left: gutterW, top: 0 } });
  el.append(gutter, body);

  const numbers = lines.map((_, i) => {
    const n = h("div", { style: { position: "absolute", right: 0, top: i * lineH, height: lineH } }, String(i + 1));
    gutter.append(n);
    return n;
  });
  view.lines.forEach((ln) => {
    ln.el.style.position = "absolute";
    ln.el.style.left = "0";
    ln.el.style.top = "0";
    ln.el.style.width = "1400px";
    body.append(ln.el);
  });

  // Slot of every line at time t: how many arrived lines precede it.
  const arrived = (i: number, t: number) => lines[i]!.at === undefined || lines[i]!.at! <= t;
  const slotAt = (i: number, t: number) => {
    let n = 0;
    for (let j = 0; j < i; j++) if (arrived(j, t)) n++;
    return n;
  };
  const events = [...new Set(lines.map((l) => l.at).filter((t): t is number => t !== undefined))].sort((a, b) => a - b);

  view.lines.forEach((ln, i) => {
    gsap.set(ln.el, { y: slotAt(i, -1) * lineH, opacity: arrived(i, -1) ? 1 : 0 });
  });
  const visibleBefore = lines.filter((_, i) => arrived(i, -1)).length;
  numbers.forEach((n, i) => gsap.set(n, { opacity: i < visibleBefore ? 1 : 0 }));

  const typedEnd = new Map<number, number>();
  for (const t of events) {
    // Lines already there make room…
    view.lines.forEach((ln, i) => {
      if (lines[i]!.at === t || !arrived(i, t - 1e-6)) return;
      const from = slotAt(i, t - 1e-6);
      const to = slotAt(i, t);
      if (from !== to) master.to(ln.el, { y: to * lineH, duration: 0.32, ease: "power3.out" }, t);
    });
    // …and the new ones arrive.
    view.lines.forEach((ln, i) => {
      if (lines[i]!.at !== t) return;
      master.set(ln.el, { y: slotAt(i, t) * lineH }, t);
      if (lines[i]!.agent) {
        master.set(ln.el, { opacity: 1 }, t);
        const writing = streamLine({ ...view, lineH, charW, gutterW: 0 }, ln, t + 0.08, { label: o.agentLabel?.() });
        typedEnd.set(i, writing.end);
      } else if (lines[i]!.typed) {
        master.set(ln.el, { opacity: 1 }, t);
        const typing = typeLine({ ...view, lineH, charW, gutterW: 0 }, ln, t + 0.08, { cps: o.cps });
        typedEnd.set(i, typing.end);
      } else {
        master.fromTo(ln.el, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out", immediateRender: false }, t + 0.06);
        flashLine(ln, t + 0.06);
        cue(t + 0.06, "tick", { gain: 0.9, pitch: 5 });
      }
    });
    const count = lines.filter((_, i) => arrived(i, t)).length;
    numbers.forEach((n, i) => {
      if (i < count && !(i < lines.filter((_, j) => arrived(j, t - 1e-6)).length)) master.set(n, { opacity: 1 }, t);
    });
  }

  return {
    el,
    lines: view.lines,
    lineH,
    charW,
    gutterW,
    slotY: (i) => slotAt(i, Infinity) * lineH,
    typedEnd,
  };
}
