/**
 * Bars 15–19. The break: "Copy for agent", the export streaming out as the
 * snare roll climbs. The drop: the dashboard's AI Support Agent sample
 * assembling itself from its agent outward. The end card on the final hit.
 */
import { compileForAgent, parse } from "@archer/lang";
import { AI_SUPPORT_AGENT } from "../../../web/lib/samples/ai-support-agent";
import { ditherBackdrop } from "../backdrop";
import { canvasView } from "../camera";
import { codeBlock } from "../code";
import { cue } from "../cues";
import { drawEdge, hideAll, layoutDiagram, popNode, renderDiagram } from "../diagram";
import { h, layer } from "../dom";
import { gsap, master, onFrame, showBetween } from "../engine";
import { icon } from "../icons";
import { pointer } from "../pointer";
import { LOOP_SOURCE } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import { BEAT, DURATION, SECTION, at } from "../time";
import { HEADLINE } from "./title";

export function finaleScene(stage: HTMLElement): void {
  buildBreak(stage);
  buildDrop(stage);
  buildEnd(stage);
}

/* ------------------------------------------------------------ The break */

function buildBreak(stage: HTMLElement) {
  const t0 = at(SECTION.build);
  const t1 = at(SECTION.drop);
  const root = layer(stage);
  showBetween(root, t0, t1 - 0.06);

  const view = canvasView(root, { cam: { x: 0, y: 0, z: 1.4 } });
  view.el.style.background = "var(--black)";
  master.to(view.cam, { z: 1.9, duration: t1 - t0, ease: "power2.in" }, t0);

  // The export itself (lib: compileForAgent), streaming up both sides.
  const text = compileForAgent(parse(LOOP_SOURCE).doc);
  const columns = [-560, 560].map((x, i) => {
    const code = codeBlock(text, { size: 17, lineHeight: 1.7, gutter: false });
    code.el.style.position = "absolute";
    code.el.style.left = `${x - 330}px`;
    code.el.style.top = `${-120 + i * 260}px`;
    code.el.style.width = "660px";
    code.el.style.opacity = "0.7";
    code.el.style.maskImage = "linear-gradient(transparent, #000 22%, #000 70%, transparent)";
    view.world.append(code.el);
    return code.el;
  });
  gsap.set(columns, { opacity: 0 });

  const button = h(
    "div",
    { class: "pill primary abs", style: { left: 0, top: 0, height: 96, padding: "0 40px", borderRadius: 14, fontSize: 38, gap: "18px" } },
  );
  const swap = h("span", { style: { position: "relative", width: 40, height: 40, display: "inline-block" } });
  const copy = h("span", { style: { position: "absolute", inset: 0, display: "flex" } }, icon("copy", 40));
  const check = h("span", { style: { position: "absolute", inset: 0, display: "flex" } }, icon("check", 40));
  swap.append(copy, check);
  button.append(swap, "Copy for agent");
  view.world.append(button);
  gsap.set(button, { xPercent: -50, yPercent: -50, scale: 0 });
  gsap.set(check, { scale: 0.3, opacity: 0, filter: "blur(4px)" });

  const ring = h("div", {
    class: "abs",
    style: { left: 0, top: 0, width: 470, height: 96, borderRadius: 14, border: "3px solid var(--accent)", boxSizing: "border-box" },
  });
  view.world.insertBefore(ring, button);
  gsap.set(ring, { xPercent: -50, yPercent: -50, opacity: 0 });

  master.to(button, { scale: 1, duration: 0.45, ease: "back.out(2.2)" }, t0 + 0.04);
  cue(t0 + 0.04, "pop", { pitch: 7 });

  const p = pointer(view, { x: 330, y: 240 });
  gsap.set(p.pos, { o: 0 });
  const click = t0 + BEAT * 1.1;
  master.to(p.pos, { o: 1, duration: 0.15 }, t0 + 0.12);
  p.move(t0 + 0.12, 70, 18, click - t0 - 0.16, "power3.out");
  p.click(click);
  cue(click, "click");
  // SwapIcon: the old icon shrinks and blurs away as the new one grows in.
  master.to(copy, { scale: 0.3, opacity: 0, filter: "blur(4px)", duration: 0.2, ease: "power2.in" }, click + 0.04);
  master.to(check, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.28, ease: "back.out(2.5)" }, click + 0.12);
  master.fromTo(ring, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 1.45, duration: 0.6, ease: "power2.out", immediateRender: false }, click + 0.05);
  cue(click + 0.12, "success");
  master.to(p.pos, { o: 0, x: 200, y: 160, duration: 0.4, ease: "power2.in" }, click + 0.3);

  // The copied text pours out, faster and faster with the snare roll.
  master.to(columns, { opacity: 0.7, duration: 0.3 }, click + 0.05);
  master.fromTo(columns, { y: 200 }, { y: -1500, duration: t1 - click - 0.05, ease: "power2.in", immediateRender: false }, click + 0.05);

  const say = caption(root, "Hand it to your agent.", { x: 960, y: 150, size: 112, anchor: "center" });
  riseIn(say.words, click + 0.18, { stagger: 0.05 });

  // Out: everything rushes at the camera into the silence before the drop.
  const rush = t1 - 0.42;
  master.to(button, { scale: 5, opacity: 0, filter: "blur(10px)", duration: 0.36, ease: "power3.in" }, rush);
  master.to(say.el, { scale: 1.8, opacity: 0, duration: 0.34, ease: "power3.in" }, rush);
  master.to(view.cam, { blurY: 20, duration: 0.36, ease: "power2.in" }, rush);
}

/* ------------------------------------------------------------- The drop */

function buildDrop(stage: HTMLElement) {
  const t0 = at(SECTION.drop);
  const t1 = at(SECTION.end);
  const root = layer(stage);
  showBetween(root, t0, t1);

  const dg = renderDiagram(layoutDiagram(AI_SUPPORT_AGENT));
  const agent = dg.diagram.boxes.find((b) => b.path === "agent")!;
  const bounds = dg.diagram.bounds;
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const start = { x: agent.x + agent.w / 2, y: agent.y + agent.h / 2 };
  // The ground is part of the world here, so it can tip back in 3D with the diagram.
  const view = canvasView(root, { cam: { x: start.x, y: start.y, z: 2.6 }, dots: false, perspective: 1500 });
  const pad = 3200;
  const floor = h("div", {
    class: "abs",
    style: {
      left: bounds.x - pad,
      top: bounds.y - pad,
      width: bounds.w + pad * 2,
      height: bounds.h + pad * 2,
      backgroundImage: "radial-gradient(circle, var(--dot) 0 1.05px, transparent 1.6px)",
      backgroundSize: "40px 40px",
      backgroundPosition: `${-20 + ((pad - bounds.x) % 40)}px ${-20 + ((pad - bounds.y) % 40)}px`,
    },
  });
  view.world.append(floor, dg.root);
  hideAll(dg);

  // The drop lands on the agent: a shockwave rings out from it.
  const wave = h("div", {
    class: "abs",
    style: { left: start.x - 120, top: start.y - 120, width: 240, height: 240, borderRadius: "50%", border: "3px solid var(--accent)", boxSizing: "border-box" },
  });
  view.world.insertBefore(wave, dg.root);
  gsap.set(wave, { opacity: 0 });
  master.fromTo(wave, { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 5, duration: 0.8, ease: "power2.out", immediateRender: false }, t0);

  // Out from the agent: order every box by how many hops it is from it.
  const hops = new Map<string, number>([["agent", 0]]);
  const links = dg.diagram.edges.map((e) => [e.source, e.target] as const);
  for (let d = 0; d < 6; d++)
    for (const [a, b] of links) {
      if (hops.has(a) && !hops.has(b) && hops.get(a) === d) hops.set(b, d + 1);
      if (hops.has(b) && !hops.has(a) && hops.get(b) === d) hops.set(a, d + 1);
    }
  const planeOf = (path: string) => path.split(".")[0]!;
  const boxes = dg.diagram.boxes;
  const order = [...boxes].sort((a, b) => {
    const ha = hops.get(a.path) ?? hops.get(planeOf(a.path)) ?? 3;
    const hb = hops.get(b.path) ?? hops.get(planeOf(b.path)) ?? 3;
    return ha - hb || Number(b.plane) - Number(a.plane);
  });
  const landed = new Map<string, number>();
  order.forEach((b, i) => {
    const t = t0 + 0.05 + i * (BEAT / 4);
    landed.set(b.path, i === 0 ? t0 : t);
    if (i === 0) {
      // The agent is there on the downbeat itself, punching in.
      const el = dg.nodes.get(b.path)!;
      master.set(el, { opacity: 1 }, t0 - 0.004);
      master.fromTo(el, { scale: 1.35 }, { scale: 1, duration: 0.45, ease: "expo.out", immediateRender: false }, t0 - 0.004);
      master.fromTo(el, { boxShadow: "0 0 0 2px #121315, 0 0 0 4px #23c088" }, { boxShadow: "0 0 0 0px #121315, 0 0 0 0px rgba(35,192,136,0)", duration: 0.8, immediateRender: false }, t0);
      return;
    }
    popNode(dg, b.path, t, 0.45);
    if (!b.plane) cue(t, "pop", { pitch: [0, 2, 4, 7, 9, 12, 14, 16][i % 8], gain: 0.5 });
  });
  for (const e of dg.diagram.edges) {
    const t = Math.max(landed.get(e.source) ?? t0, landed.get(e.target) ?? t0) + 0.12;
    drawEdge(dg, e.key, t, 0.32);
  }

  // Data flowing: a glowing dot running each edge, over and over.
  const svg = dg.root.querySelector("svg.edges")!;
  const NS = "http://www.w3.org/2000/svg";
  dg.diagram.edges.forEach((e, i) => {
    const dot = document.createElementNS(NS, "g");
    const glow = document.createElementNS(NS, "circle");
    glow.setAttribute("r", "11");
    glow.setAttribute("fill", "rgba(35,192,136,0.22)");
    const core = document.createElementNS(NS, "circle");
    core.setAttribute("r", "4.2");
    core.setAttribute("fill", "#3dd39c");
    dot.append(glow, core);
    svg.append(dot);
    gsap.set(dot, { opacity: 0 });
    const t = Math.max(landed.get(e.source) ?? t0, landed.get(e.target) ?? t0) + 0.5;
    master.set(dot, { opacity: 1 }, t);
    master.to(
      dot,
      { motionPath: { path: e.d, start: 0, end: 1 }, duration: 0.9, ease: "none", repeat: Math.ceil((t1 - t) / 0.9) + 1 },
      t + (i % 3) * 0.15,
    );
  });

  // Camera: tight on the agent, out until the whole system shows, then the
  // canvas tips back into the distance as the turnaround climbs.
  master.to(view.cam, { x: center.x - 40, y: center.y - 60, z: 1.08, duration: 2.6, ease: "power2.inOut" }, t0 + 0.1);
  master.to(view.cam, { tilt: 50, rot: -9, z: 0.7, x: center.x, y: center.y + 60, duration: 2.9, ease: "power2.inOut" }, t0 + 2.4);
  // Out: rush into the canvas; the end card hits on the downbeat.
  master.to(view.cam, { z: 2.4, blurY: 16, duration: 0.42, ease: "power3.in" }, t1 - 0.42);
  master.to(root, { opacity: 0, duration: 0.16, ease: "power2.in" }, t1 - 0.16);
  cue(t1 - 0.45, "whoosh", { dur: 0.45, gain: 0.8 });

  // The picture pumps with the kick: a small punch on every beat of the drop.
  onFrame((t) => {
    if (t < t0 || t >= t1) return;
    const since = (t - t0) % BEAT;
    view.el.style.scale = String(1 + 0.014 * Math.exp(-since / 0.09));
  });

  // Captions over a scrim, so they read on top of the diagram.
  const scrim = h("div", { class: "abs", style: { width: 1920, height: 420, background: "linear-gradient(rgba(18,19,21,.96) 40%, rgba(18,19,21,0))" } });
  root.append(scrim);
  gsap.set(scrim, { opacity: 0 });
  master.to(scrim, { opacity: 1, duration: 0.4 }, t0 + 0.2);
  const lines = [
    { text: "Your whole system.", in: at(SECTION.drop, 0.4), out: at(SECTION.drop + 1) - 0.14 },
    { text: "One file.", in: at(SECTION.drop + 1, 0.02), out: at(SECTION.drop + 1, 2) - 0.14 },
    { text: "Every agent.", in: at(SECTION.drop + 1, 2.02), out: at(SECTION.drop + 2) - 0.02 },
  ];
  for (const l of lines) {
    const c = caption(root, l.text, { x: 120, y: 118, size: 128 });
    riseIn(c.words, l.in, { stagger: 0.06 });
    riseOut(c.words, l.out - 0.06, { dur: 0.22, stagger: 0.015 });
  }

  // Bar 18: the landing headline, a word a beat, big over the receding canvas.
  const tHead = at(SECTION.drop + 2);
  const shade = h("div", { class: "abs", style: { width: 1920, height: 1080, background: "radial-gradient(ellipse at 50% 50%, rgba(10,11,12,.72), rgba(10,11,12,.35))" } });
  root.append(shade);
  gsap.set(shade, { opacity: 0 });
  master.to(shade, { opacity: 1, duration: 0.3 }, tHead - 0.1);
  master.to(scrim, { opacity: 0, duration: 0.3 }, tHead - 0.1);
  const head = h("div", {
    class: "abs serif",
    style: { left: 960, top: 540, fontSize: 150, lineHeight: 1.02, textAlign: "center", color: "var(--ink)", whiteSpace: "nowrap", transform: "translate(-50%, -50%)" },
  });
  root.append(head);
  const beats: [string, number][] = [
    ["Software", 0],
    ["architecture", 0.75],
    ["for your", 1.75],
    ["agents.", 2.5],
  ];
  const spans = beats.map(([text], i) => {
    const span = h("span", { style: { display: "inline-block" } });
    if (text.endsWith(".")) span.append(text.slice(0, -1), h("span", { class: "accent" }, "."));
    else span.textContent = text;
    head.append(span);
    if (i === 1) head.append(h("br"));
    else if (i < beats.length - 1) head.append(" ");
    return span;
  });
  gsap.set(spans, { opacity: 0 });
  beats.forEach(([, beat], i) => {
    const t = at(SECTION.drop + 2, beat);
    master.fromTo(
      spans[i]!,
      { opacity: 0, scale: 1.6, filter: "blur(12px)" },
      { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.32, ease: "expo.out", immediateRender: false },
      t,
    );
    cue(t, "tick", { gain: 0.9, pitch: [0, 4, 7, 12][i] });
  });
  master.to(head, { scale: 1.9, opacity: 0, filter: "blur(10px)", duration: 0.4, ease: "power3.in" }, t1 - 0.42);
}

/* ------------------------------------------------------------- The end */

function buildEnd(stage: HTMLElement) {
  const t0 = at(SECTION.end);
  const root = layer(stage);
  root.style.background = "var(--black)";
  showBetween(root, t0, DURATION + 1);

  const backdrop = ditherBackdrop();
  root.append(backdrop);
  const content = h("div", { class: "abs", style: { width: 1920, height: 1080 } });
  root.append(content);

  const word = h(
    "div",
    { class: "wordmark abs", style: { left: 960, top: 262, fontSize: 300, transform: "translateX(-50%)", color: "var(--ink)", whiteSpace: "nowrap" } },
    "Archer",
  );
  content.append(word);
  const ruleY = 600;
  const rule = h("div", { class: "rule", style: { left: 380, top: ruleY, width: 1160, height: 1.5 } });
  const jl = h("div", { class: "joint", style: { left: 380, top: ruleY + 0.75 } });
  const jr = h("div", { class: "joint", style: { left: 1540, top: ruleY + 0.75 } });
  content.append(rule, jl, jr);
  const tagline = caption(content, HEADLINE, { x: 960, y: 644, size: 72, anchor: "center" });

  const cta = h(
    "div",
    { class: "pill primary abs", style: { left: 960, top: 820, height: 84, padding: "0 36px", borderRadius: 12, fontSize: 34, gap: "16px" } },
    h("span", { class: "mono", style: { fontWeight: 500 } }, "archer.tombyrne.dev"),
    icon("arrowRight", 32),
  );
  content.append(cta);
  gsap.set(cta, { xPercent: -50, opacity: 0, y: 30 });

  const flash = h("div", { class: "abs", style: { width: 1920, height: 1080, background: "#fff", opacity: 0 } });
  root.append(flash);

  cue(t0, "impact");
  gsap.set([word, backdrop], { opacity: 0 });
  master.fromTo(
    word,
    { opacity: 0, scale: 1.5, filter: "blur(24px)", letterSpacing: "0.08em" },
    { opacity: 1, scale: 1, filter: "blur(0px)", letterSpacing: "-0.04em", duration: 0.45, ease: "expo.out", immediateRender: false },
    t0,
  );
  master.fromTo(flash, { opacity: 0.18 }, { opacity: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out", immediateRender: false }, t0);
  gsap.set(rule, { scaleX: 0 });
  master.to(rule, { scaleX: 1, duration: 0.6, ease: "expo.out" }, t0 + 0.3);
  for (const j of [jl, jr]) {
    gsap.set(j, { scale: 0, rotation: 45 });
    master.to(j, { scale: 1, duration: 0.3, ease: "back.out(3)" }, t0 + 0.55);
  }
  riseIn(tagline.words, t0 + BEAT, { stagger: 0.06, dur: 0.65 });
  master.to(cta, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, t0 + BEAT * 2.2);
  cue(t0 + BEAT * 2.2, "pop", { pitch: 12, gain: 0.6 });
  // A slow settle while the chord rings out, then black.
  master.fromTo(content, { scale: 1 }, { scale: 1.035, duration: DURATION - t0, ease: "none", immediateRender: false }, t0);
  master.to(root, { opacity: 0, duration: 0.4, ease: "power1.in" }, DURATION - 0.4);
}
