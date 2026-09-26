/**
 * Bar 2, drop 1: the wordmark slams in on the downbeat over the landing
 * page's dithered fade, with the landing headline under it.
 */
import { ditherBackdrop } from "../backdrop";
import { cue } from "../cues";
import { h, layer } from "../dom";
import { gsap, master, showBetween } from "../engine";
import { caption, riseIn } from "../text";
import { BEAT, SECTION, at } from "../time";

export const HEADLINE = "Software architecture for your agents.";

export function titleScene(stage: HTMLElement): void {
  const t0 = at(SECTION.title);
  const tEnd = at(SECTION.loop);
  const root = layer(stage);
  root.style.background = "var(--black)";
  showBetween(root, t0, tEnd);

  const backdrop = ditherBackdrop();
  root.append(backdrop);
  const content = h("div", { class: "abs", style: { width: 1920, height: 1080 } });
  root.append(content);

  const kicker = h(
    "div",
    { class: "kicker abs", style: { left: 960, top: 262, transform: "translateX(-50%)", letterSpacing: "0.34em", fontSize: 26 } },
    "Introducing",
  );
  const word = h(
    "div",
    {
      class: "wordmark abs",
      style: { left: 960, top: 330, fontSize: 330, transform: "translateX(-50%)", color: "var(--ink)", whiteSpace: "nowrap" },
    },
    "Archer",
  );
  content.append(kicker, word);

  // A landing-page rule with diamond joints, drawn out from the middle.
  const ruleY = 690;
  const rule = h("div", { class: "rule", style: { left: 360, top: ruleY, width: 1200, height: 1.5 } });
  const jl = h("div", { class: "joint", style: { left: 360, top: ruleY + 0.75 } });
  const jr = h("div", { class: "joint", style: { left: 1560, top: ruleY + 0.75 } });
  content.append(rule, jl, jr);

  const tagline = caption(content, HEADLINE, { x: 960, y: 736, size: 76, anchor: "center" });
  tagline.el.style.color = "var(--ink)";

  const flash = h("div", { class: "abs", style: { width: 1920, height: 1080, background: "#fff", opacity: 0 } });
  root.append(flash);

  /* The hit */
  cue(t0, "impact");
  master.fromTo(
    word,
    { opacity: 0, scale: 1.45, filter: "blur(22px)", letterSpacing: "0.06em" },
    { opacity: 1, scale: 1, filter: "blur(0px)", letterSpacing: "-0.04em", duration: 0.42, ease: "expo.out", immediateRender: false },
    t0,
  );
  gsap.set(word, { opacity: 0 });
  master.fromTo(flash, { opacity: 0.22 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out", immediateRender: false }, t0);
  gsap.set(backdrop, { opacity: 0 });
  // A short shake as it lands.
  const shake = { k: 0 };
  master.fromTo(
    shake,
    { k: 1 },
    {
      k: 0,
      duration: 0.32,
      ease: "power2.out",
      immediateRender: false,
      onUpdate: () => {
        const a = shake.k * 9;
        content.style.translate = `${Math.sin(shake.k * 40) * a}px ${Math.cos(shake.k * 33) * a * 0.6}px`;
      },
    },
    t0,
  );

  master.fromTo(
    kicker,
    { opacity: 0, letterSpacing: "0.9em" },
    { opacity: 1, letterSpacing: "0.34em", duration: 0.6, ease: "expo.out", immediateRender: false },
    t0 + 0.08,
  );
  gsap.set(kicker, { opacity: 0 });
  master.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "expo.out", immediateRender: false }, t0 + BEAT * 0.75);
  gsap.set(rule, { scaleX: 0 });
  for (const j of [jl, jr]) {
    master.fromTo(j, { scale: 0 }, { scale: 1, rotation: 45, duration: 0.3, ease: "back.out(3)", immediateRender: false }, t0 + BEAT * 0.75 + 0.3);
    gsap.set(j, { scale: 0, rotation: 45 });
  }
  riseIn(tagline.words, t0 + BEAT * 1, { stagger: 0.06, dur: 0.6 });

  /* Out: a push up into the editor */
  master.to(content, { y: -260, opacity: 0, duration: 0.34, ease: "power3.in" }, tEnd - 0.34);
  master.to(backdrop, { opacity: 0, duration: 0.3, ease: "power2.in" }, tEnd - 0.3);
  cue(tEnd - 0.3, "whoosh", { dur: 0.4, gain: 0.7 });
}
