/**
 * Bars 7–14: one feature a bar, each a station on one long dotted canvas.
 * The camera whips from station to station on the downbeats (motion blur
 * on the dot grid sells the speed) while the kicker and title roll over.
 */
import { canvasView, type CanvasView } from "../camera";
import { cue } from "../cues";
import { h, layer } from "../dom";
import { gsap, master, showBetween } from "../engine";
import { caption, riseIn, riseOut } from "../text";
import { SECTION, at } from "../time";
import { agentsStation, mcpStation, repoStation, shareStation } from "./features-agents";
import { catalogStation, nestingStation, payloadStation, strictStation } from "./features-canvas";

export interface StationCtx {
  view: CanvasView;
  /** Screen-space layer over the canvas (panels, bubbles, breadcrumbs). */
  overlay: HTMLElement;
  t0: number;
  t1: number;
}

export interface Station {
  kicker: string;
  title: string;
  /** Where the camera sits for this station (world centre and zoom). */
  cam: { x: number; y: number; z: number };
  /** Arrive by gliding from the last station's camera instead of a whip. */
  glide?: boolean;
  build(ctx: StationCtx): void;
}

const STATIONS: Station[] = [
  catalogStation,
  strictStation,
  nestingStation,
  payloadStation,
  mcpStation,
  agentsStation,
  repoStation,
  shareStation,
];

/** When the features end: the build takes over. */
export const FEATURES_END = at(SECTION.build);

export function featuresScene(stage: HTMLElement): void {
  const tStart = at(SECTION.features);
  const root = layer(stage);
  showBetween(root, tStart - 0.4, FEATURES_END + 0.05);

  const view = canvasView(root, { cam: { ...STATIONS[0]!.cam } });
  const overlay = h("div", { class: "abs", style: { width: 1920, height: 1080 } });
  root.append(overlay);
  const titles = h("div", { class: "abs", style: { width: 1920, height: 1080 } });
  root.append(titles);

  STATIONS.forEach((station, i) => {
    const t0 = at(SECTION.features + i);
    const t1 = at(SECTION.features + i + 1);

    // Camera: whip (or glide) in, arriving just after the downbeat.
    if (i > 0 && !station.glide) {
      const start = t0 - 0.26;
      master.to(view.cam, { ...station.cam, duration: 0.5, ease: "expo.inOut" }, start);
      master.to(view.cam, { blurX: 34, duration: 0.22, ease: "power2.in" }, start + 0.02);
      master.to(view.cam, { blurX: 0, duration: 0.24, ease: "power2.out" }, start + 0.24);
      cue(start, "whoosh", { dur: 0.46, gain: 0.85 });
    }

    station.build({ view, overlay, t0, t1 });

    // Kicker and title, rolling over on the bar line.
    const kicker = h(
      "div",
      { class: "kicker abs", style: { left: 126, top: 104 } },
      h("span", { class: "accent" }, String(i + 1).padStart(2, "0")),
      h("span", { style: { display: "inline-block", width: "18px" } }),
      station.kicker,
    );
    titles.append(kicker);
    gsap.set(kicker, { opacity: 0 });
    const title = caption(titles, station.title, { x: 120, y: 142, size: 112 });
    const tin = i === 0 ? t0 - 0.06 : t0 + 0.02;
    master.fromTo(kicker, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.35, ease: "expo.out", immediateRender: false }, tin);
    riseIn(title.words, tin + 0.02, { stagger: 0.045 });
    const tout = t1 - 0.2;
    master.to(kicker, { opacity: 0, x: 24, duration: 0.2, ease: "power2.in" }, tout);
    riseOut(title.words, tout, { stagger: 0.018, dur: 0.24 });
    if (station.title.startsWith("350+")) countUp(title.words[0]!, tin);
  });

  // In: push the editor off to the left (same move as loop.ts' exit).
  master.fromTo(root, { x: 1920 }, { x: 0, duration: 0.5, ease: "power3.inOut", immediateRender: false }, tStart - 0.32);
  gsap.set(root, { x: 1920 });
  const blur = { b: 1 };
  master.fromTo(
    blur,
    { b: 1 },
    {
      b: 0,
      duration: 0.4,
      ease: "power2.out",
      immediateRender: false,
      onUpdate: () => (view.el.style.filter = blur.b > 0.01 ? `blur(${(blur.b * 8).toFixed(2)}px)` : ""),
    },
    tStart - 0.12,
  );
}

/** "350+" counts up from 100 as it rises: tabular figures, so nothing shifts. */
function countUp(word: HTMLSpanElement, t: number) {
  const target = parseInt(word.textContent ?? "0", 10);
  word.style.fontFeatureSettings = '"tnum"';
  const n = { v: 100 };
  const render = () => {
    word.textContent = `${Math.round(n.v)}+`;
  };
  master.fromTo(n, { v: 100 }, { v: target, duration: 0.9, ease: "power3.out", immediateRender: false, onUpdate: render }, t);
  render();
}
