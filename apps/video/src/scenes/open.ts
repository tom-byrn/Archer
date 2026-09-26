/**
 * Bars 0–1, the cold open. A diagram builds itself on the dotted canvas
 * ("Draw it."), then the whole canvas flips over like a card and its back is
 * the same architecture as an .arch file ("It's code.").
 */
import { canvasView } from "../camera";
import { codeBlock, flashLine } from "../code";
import { cue } from "../cues";
import { drawEdge, hideAll, layoutDiagram, popNode, renderDiagram } from "../diagram";
import { h, layer } from "../dom";
import { gsap, master, showBetween } from "../engine";
import { icon } from "../icons";
import { pointer } from "../pointer";
import { caption, riseIn } from "../text";
import { OPEN_LAYOUT, OPEN_SOURCE } from "../sources";
import { BEAT, SECTION, at } from "../time";

export function openScene(stage: HTMLElement): void {
  const t0 = at(SECTION.draw);
  const tFlip = at(SECTION.code);
  const tEnd = at(SECTION.title);

  const root = layer(stage);
  root.style.perspective = "2600px";
  showBetween(root, t0, tEnd);
  const card = h("div", {
    class: "abs",
    style: { width: 1920, height: 1080, transformStyle: "preserve-3d", transformOrigin: "50% 50%" },
  });
  const face = () =>
    h("div", {
      class: "abs",
      style: {
        width: 1920,
        height: 1080,
        overflow: "hidden",
        backfaceVisibility: "hidden",
        background: "var(--ground)",
      },
    });
  const front = face();
  const back = face();
  card.append(front, back);
  root.append(card);
  // GSAP owns every transform here, so it can un-rotate the card after the flip.
  gsap.set(back, { rotationY: 180 });

  /* ------------------------------------------------ Front: "Draw it." */
  const view = canvasView(front, { cam: { x: 360, y: 6, z: 2.3 } });
  const dg = renderDiagram(layoutDiagram(OPEN_SOURCE + OPEN_LAYOUT));
  view.world.append(dg.root);
  hideAll(dg);

  // The dot grid blooms out from the middle on the first kick.
  const dots = view.el.querySelector<HTMLDivElement>(".dots")!;
  dots.style.maskImage = "radial-gradient(circle at 50% 58%, #000 var(--r), transparent calc(var(--r) + 260px))";
  gsap.set(dots, { "--r": "-260px" });
  // Already blooming on frame one, so the film never opens on an empty frame.
  master.to(dots, { "--r": "1500px", duration: 1.1, ease: "power2.out" }, t0 - 0.3);
  // A slow push-in keeps the still moments alive.
  master.to(view.cam, { z: 2.44, x: 372, duration: tFlip - t0, ease: "none" }, t0);

  popNode(dg, "web", t0 - 0.12);
  cue(t0 + 0.02, "pop", { pitch: 0 });
  popNode(dg, "api", t0 + BEAT);
  cue(t0 + BEAT, "pop", { pitch: 4 });
  drawEdge(dg, "web->api", t0 + BEAT + 0.16, 0.3);
  cue(t0 + BEAT + 0.16, "draw", { gain: 0.8 });

  // Postgres is dragged in from the corner by the pointer and dropped in place.
  const db = dg.nodes.get("db")!;
  const grab = { x: 560 + 62, y: 52 };
  const from = { dx: 250, dy: 250 };
  const p = pointer(view, { x: grab.x + from.dx, y: grab.y + from.dy });
  const dragStart = t0 + BEAT * 0.9;
  const drop = t0 + BEAT * 2.05;
  master.set(db, { opacity: 1, scale: 1.04, x: from.dx, y: from.dy, boxShadow: "0 18px 40px rgba(0,0,0,.55)" }, dragStart);
  master.set(p.pos, { o: 1 }, dragStart);
  master.to(db, { x: 0, y: 0, duration: drop - dragStart, ease: "power3.out" }, dragStart);
  p.move(dragStart, grab.x, grab.y, drop - dragStart, "power3.out");
  master.to(db, { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.25, ease: "back.out(3)" }, drop);
  cue(drop, "pop", { pitch: 7 });
  p.click(drop - 0.06);

  // …then it pulls the connection out of the API's right handle.
  const h1 = { x: 440, y: 40 };
  const h2 = { x: 560, y: 40 };
  const pull = drop + 0.16;
  p.move(drop + 0.02, h1.x, h1.y, 0.14, "power2.inOut");
  const drawDur = 0.34;
  drawEdge(dg, "api->db", pull, drawDur);
  p.move(pull, h2.x + 6, h2.y, drawDur, "power2.inOut");
  cue(pull, "draw");
  p.click(pull + drawDur - 0.02);
  p.move(pull + drawDur + 0.05, h2.x + 90, h2.y + 110, 0.5, "power2.inOut");
  master.to(p.pos, { o: 0, duration: 0.2 }, tFlip - 0.2);

  const draw = caption(front, "Draw it.", { x: 124, y: 132, size: 168 });
  riseIn(draw.words, t0 - 0.08, { dur: 0.6, stagger: 0.07 });

  /* ------------------------------------------------ Back: "It's code." */
  const code = codeBlock(OPEN_SOURCE, { size: 40, lineHeight: 1.55 });
  code.el.style.position = "absolute";
  code.el.style.left = "124px";
  code.el.style.top = "360px";
  back.append(code.el);
  const said = caption(back, "It's code.", { x: 124, y: 132, size: 168 });
  gsap.set(said.words, { yPercent: 0 });

  const file = h(
    "div",
    { class: "abs", style: { left: 1796, top: 150, transform: "translateX(-100%)", display: "flex", gap: "16px", alignItems: "center" } },
    h(
      "div",
      { class: "mono", style: { display: "flex", alignItems: "center", gap: "12px", fontSize: 26, color: "var(--ink-2)" } },
      icon("fileCode", 30),
      "architecture.arch",
    ),
    h(
      "div",
      {
        class: "mono",
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: 40,
          padding: "0 14px",
          borderRadius: 6,
          fontSize: 22,
          color: "var(--accent)",
          background: "var(--accent-soft)",
        },
      },
      icon("checkCircle", 24),
      "valid",
    ),
  );
  back.append(file);

  /* ------------------------------------------------ The flip */
  const whoosh = tFlip - 0.08;
  cue(whoosh, "whoosh", { dur: 0.6 });
  master.to(card, { scale: 0.8, duration: 0.24, ease: "power2.out" }, tFlip - 0.06);
  master.to(card, { rotationY: 180, duration: 0.62, ease: "power3.inOut" }, tFlip - 0.04);
  master.to(card, { scale: 1, duration: 0.34, ease: "power3.inOut" }, tFlip + 0.4);
  master.to([front, back], { borderRadius: 36, duration: 0.2, ease: "power2.out" }, tFlip - 0.06);
  master.to([front, back], { borderRadius: 0, duration: 0.3, ease: "power2.in" }, tFlip + 0.46);

  // Once it lands, each declaration lights up on the eighths.
  const lit = [2, 3, 4, 6, 7];
  lit.forEach((ln, i) => {
    const t = tFlip + 0.72 + i * (BEAT / 2);
    flashLine(code.lines[ln]!, t, 0.9);
    cue(t, "tick", { gain: 0.7, pitch: i * 2 });
  });

  // Flip done: rest the card flat with its back face forward, so the exit
  // below can fade and blur it without 3D flattening showing the front.
  const settled = tFlip + 0.8;
  master.set(card, { rotationY: 0 }, settled);
  master.set(back, { rotationY: 0 }, settled);
  master.set(front, { visibility: "hidden" }, settled);

  // Out: the file rushes at the camera and the title hits on the downbeat.
  master.to(card, { scale: 2.2, opacity: 0, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }, tEnd - 0.3);
  cue(tEnd - 0.34, "whoosh", { dur: 0.36, gain: 0.8 });
}
