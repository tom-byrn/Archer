/**
 * Bar 2, drop 1: the file, pulled into a point, detonates. White-out, a
 * shockwave, sparks, and the wordmark's letters blast out of the core to
 * lock into "Archer", white-hot and cooling to ink, with rays turning behind
 * it and the landing headline under it. Then the camera flies up over the
 * word and down onto the canvas.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { caption, riseIn, riseOut } from "../text";
import { rand } from "../three/chars";
import { fx } from "../three/fx";
import { rays } from "../three/rays";
import { stage } from "../three/stage";
import { letters3d } from "../three/text3d";
import { BEAT, SECTION, at } from "../time";
import type { Film } from "./context";
import { CORE } from "./open";

export const HEADLINE = "Software architecture for your agents.";

export function titleScene(film: Film): void {
  const { scene, rig, grade, live } = stage();
  const t0 = at(SECTION.title);
  const t1 = at(SECTION.loop);
  const root = new THREE.Group();
  root.position.copy(CORE);
  scene.add(root);
  live(root, t0, t1 + 0.5);

  /* The word */
  // The faces unlit, in ink (a glossy face mirrors the room's lights and
  // blooms); the bevels and sides are dark metal that catch the light.
  const ink = new THREE.Color(0xecebe7);
  const face = new THREE.MeshBasicMaterial({ color: ink.clone() });
  const heat = { value: 0 };
  stage().before(() => face.color.copy(ink).multiplyScalar(1 + heat.value * 5));
  const word = letters3d("Archer", { font: "display", size: 2.6, depth: 0.6, tracking: -0.04, face });
  root.add(word.group);
  const n = word.letters.length;
  word.letters.forEach((m, i) => {
    const home = m.position.clone();
    const t = t0 + Math.abs(i - (n - 1) / 2) * 0.03;
    master.set(m.scale, { x: 0.001, y: 0.001, z: 0.001 }, t0 - 0.02);
    master.fromTo(
      m.position,
      { x: home.x * 0.08, y: home.y * 0.08, z: -1.5 },
      { x: home.x, y: home.y, z: 0, duration: 0.62, ease: "expo.out", immediateRender: false },
      t,
    );
    master.fromTo(
      m.rotation,
      { x: (rand(i, 21) - 0.5) * 5, y: (rand(i, 22) - 0.5) * 6, z: (rand(i, 23) - 0.5) * 3 },
      { x: 0, y: 0, z: 0, duration: 0.8, ease: "back.out(1.5)", immediateRender: false },
      t,
    );
    master.fromTo(m.scale, { x: 0.1, y: 0.1, z: 0.1 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(2.2)", immediateRender: false }, t);
  });
  master.fromTo(heat, { value: 1 }, { value: 0, duration: 0.85, ease: "power2.out", immediateRender: false }, t0);

  /* The hit */
  cue(t0, "impact");
  master.fromTo(grade, { flash: 0.85 }, { flash: 0, duration: 0.22, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(grade, { aberration: 0.035 }, { aberration: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(grade, { zoom: 0.07 }, { zoom: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(rig, { shake: 0.2 }, { shake: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, t0);
  const f = fx();
  const { x, y, z } = CORE;
  f.flare({ t0, x, y, z, size: 9, dur: 0.35, glow: 2 });
  f.burst({ t0, x, y, z, count: 480, speed: 18, up: 0, drag: 2.4, gravity: -1.2, life: 1.4, size: 0.06, glow: 3.2, color: 0xffffff });
  f.burst({ t0, x, y, z, count: 300, speed: 11, up: 0, drag: 2, gravity: -2, life: 1.6, size: 0.08, glow: 3.5, color: 0x23c088, seed: 3 });
  f.ring({ t0, x, y, z, radius: 10, dur: 0.6, width: 0.6, glow: 2.4, color: 0xffffff, upright: true });
  f.ring({ t0: t0 + 0.06, x, y, z, radius: 16, dur: 0.9, width: 0.9, glow: 2, color: 0x23c088, upright: true });
  f.ring({ t0, x, z, radius: 14, dur: 0.9, width: 0.8, glow: 2.2, color: 0x23c088 });
  film.floor.wave({ t0, x, z, speed: 24, strength: 3.2, decay: 0.8 });
  f.dust({ t0, t1: t1 + 0.5, center: new THREE.Vector3(x, 3.5, z + 2), size: new THREE.Vector3(30, 9, 16), count: 380, glow: 1.3, dot: 0.045 });

  const beams = rays(new THREE.Vector3(x, y - 0.2, z - 3.5));
  master.fromTo(beams.alpha, { value: 0.9 }, { value: 0.3, duration: 1.1, ease: "power2.out", immediateRender: false }, t0);
  master.to(beams.alpha, { value: 0, duration: 0.35, ease: "power2.in" }, t1 - 0.45);

  /* The headline */
  const tag = caption(film.overlay, HEADLINE, { x: 960, y: 770, size: 70, anchor: "center" });
  riseIn(tag.words, t0 + BEAT * 0.9, { stagger: 0.05, dur: 0.6 });
  riseOut(tag.words, t1 - 0.5, { dur: 0.25, stagger: 0.015 });

  /* Camera: a slow drift round the word, then up and over it */
  master.to(rig, { x: -0.6, y: 3.0, z: 10.6, tx: 1.4, ty: 3.05, tz: -0.5, fov: 34, duration: t1 - t0 - 0.4, ease: "power2.out" }, t0);
}
