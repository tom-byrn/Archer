/**
 * Bar 18, the final hit: the wordmark assembles out of the flash, rays turn
 * behind it, the headline sits under it, and the call to action rises: the
 * site, as a button. A slow push while the chord rings out, then black.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import arrowRight from "@phosphor-icons/core/assets/bold/arrow-right-bold.svg";
import { cue } from "../cues";
import { master } from "../engine";
import { caption, riseIn } from "../text";
import { rand } from "../three/chars";
import { fx } from "../three/fx";
import { ACCENT, ACCENT_INK, MONO, canvas, icon, texture } from "../three/paint";
import { rays } from "../three/rays";
import { stage } from "../three/stage";
import { letters3d } from "../three/text3d";
import { BEAT, DURATION, SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";
import { HEADLINE } from "./title";

export function endShot(film: Film): void {
  const { scene, rig, grade, live, cut } = stage();
  const t0 = at(SECTION.end);
  const E = SET.end;
  const root = new THREE.Group();
  root.position.copy(E).add(new THREE.Vector3(0, 4.2, 0));
  scene.add(root);
  live(root, t0 - 0.02, DURATION + 1);

  const ink = new THREE.Color(0xecebe7);
  const face = new THREE.MeshBasicMaterial({ color: ink.clone() });
  const heat = { value: 0 };
  stage().before(() => face.color.copy(ink).multiplyScalar(1 + heat.value * 4));
  const word = letters3d("Archer", { font: "display", size: 2.5, depth: 0.6, tracking: -0.04, face });
  root.add(word.group);
  word.letters.forEach((m, i) => {
    const home = m.position.clone();
    // In from all round, landing together on the hit.
    const dir = new THREE.Vector3((rand(i, 90) - 0.5) * 2, (rand(i, 91) - 0.5) * 1.2, 1).normalize();
    master.fromTo(
      m.position,
      { x: home.x + dir.x * 14, y: home.y + dir.y * 9, z: 10 },
      { x: home.x, y: home.y, z: 0, duration: 0.5, ease: "expo.out", immediateRender: false },
      t0 - 0.02,
    );
    master.fromTo(
      m.rotation,
      { x: (rand(i, 92) - 0.5) * 4, y: (rand(i, 93) - 0.5) * 4, z: (rand(i, 94) - 0.5) * 2 },
      { x: 0, y: 0, z: 0, duration: 0.7, ease: "back.out(1.4)", immediateRender: false },
      t0 - 0.02,
    );
  });
  master.fromTo(heat, { value: 1 }, { value: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, t0);

  cut(t0);
  cue(t0, "impact");
  master.fromTo(grade, { flash: 0.8 }, { flash: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(grade, { aberration: 0.02 }, { aberration: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, t0);
  master.set(grade, { zoom: 0, exposure: 1, fade: 0 }, t0);
  master.fromTo(rig, { shake: 0.14 }, { shake: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, t0);
  const c = root.position;
  fx().ring({ t0, x: c.x, y: c.y, z: c.z, radius: 14, dur: 0.8, width: 0.8, glow: 2, color: ACCENT, upright: true });
  fx().flare({ t0, x: c.x, y: c.y, z: c.z + 0.8, size: 1.5, stretch: 14, dur: 0.8, glow: 2.4, color: 0x9ff7d8 });
  fx().burst({ t0, x: c.x, y: c.y, z: c.z, count: 360, speed: 14, up: 0, drag: 2.2, gravity: -1, life: 1.5, size: 0.06, glow: 3, color: 0xffffff });
  fx().ring({ t0, x: c.x, z: c.z, radius: 16, dur: 1, width: 0.9, glow: 2, color: ACCENT });
  film.floor.wave({ t0, x: c.x, z: c.z, speed: 22, strength: 2.6, decay: 0.9 });
  fx().dust({ t0, t1: DURATION + 1, center: new THREE.Vector3(c.x, 4, c.z + 2), size: new THREE.Vector3(30, 9, 16), count: 360, glow: 1.2, dot: 0.045 });
  const beams = rays(new THREE.Vector3(c.x, c.y - 0.2, c.z - 3.5));
  master.fromTo(beams.alpha, { value: 0.8 }, { value: 0.3, duration: 1.2, ease: "power2.out", immediateRender: false }, t0);

  const tag = caption(film.overlay, HEADLINE, { x: 960, y: 650, size: 64, anchor: "center" });
  riseIn(tag.words, t0 + BEAT, { stagger: 0.05, dur: 0.6 });

  // The call to action: the site, on a real button.
  const cta = new THREE.Group();
  cta.position.set(0, -3.6, 0.6);
  root.add(cta);
  const bw = 6.2;
  const bh = 1.05;
  cta.add(
    new THREE.Mesh(
      new RoundedBoxGeometry(bw, bh, 0.4, 4, 0.2),
      new THREE.MeshPhysicalMaterial({ color: 0x0f3b2b, roughness: 0.25, metalness: 0.2, clearcoat: 1 }),
    ),
  );
  const PX = 160;
  const { c: cv, ctx } = canvas(Math.round(bw * PX), Math.round(bh * PX));
  ctx.beginPath();
  ctx.roundRect(0, 0, cv.width, cv.height, 0.2 * PX);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.fillStyle = ACCENT_INK;
  ctx.font = `600 ${Math.round(0.42 * PX)}px ${MONO}`;
  ctx.fillText("archer.tombyrne.dev", 0.5 * PX, bh * PX * 0.65);
  icon(ctx, arrowRight, (bw - 0.95) * PX, (bh * PX - 0.46 * PX) / 2, 0.46 * PX, ACCENT_INK);
  const ctaFace = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), new THREE.MeshBasicMaterial({ map: texture(cv), transparent: true }));
  ctaFace.position.z = 0.21;
  cta.add(ctaFace);
  const tCta = t0 + BEAT * 2.2;
  cta.visible = false;
  master.set(cta, { visible: true }, tCta);
  master.fromTo(cta.position, { y: -6 }, { y: -3.6, duration: 0.55, ease: "expo.out", immediateRender: false }, tCta);
  master.fromTo(cta.rotation, { x: 1.1 }, { x: 0, duration: 0.7, ease: "back.out(1.6)", immediateRender: false }, tCta);
  cue(tCta, "pop", { pitch: 12, gain: 0.6 });

  // A slow push while it rings out, then black.
  master.set(rig, { x: E.x - 1.2, y: 4.6, z: E.z + 15, tx: E.x, ty: 2.9, tz: E.z, fov: 40, roll: 0 }, t0);
  master.to(rig, { x: E.x + 0.6, y: 4.3, z: E.z + 13.2, duration: DURATION - t0, ease: "sine.out" }, t0);
  master.to(grade, { fade: 1, duration: 0.45, ease: "power1.in" }, DURATION - 0.45);
}
