/**
 * Bar 14, the break: "Hand it to your agent." One button, "Copy for agent";
 * the pointer presses it on the beat and the file comes out as a tunnel of
 * its own characters. The camera dives in and accelerates with the riser
 * until the code is streaks of light, and the drop whites it all out.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import copy from "@phosphor-icons/core/assets/bold/copy-bold.svg";
import { cue } from "../cues";
import { master } from "../engine";
import { AI_SUPPORT_AGENT } from "../../../web/lib/samples/ai-support-agent";
import { caption, riseIn, riseOut } from "../text";
import { chars, clamp01, codeChars, rand } from "../three/chars";
import { fx } from "../three/fx";
import { ACCENT, ACCENT_INK, SANS, canvas, icon, texture } from "../three/paint";
import { cursorSprite } from "../three/panel";
import { stage } from "../three/stage";
import { BEAT, SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

/** The sample's source without its layout block: what an agent is handed. */
const FILE = AI_SUPPORT_AGENT.slice(0, AI_SUPPORT_AGENT.indexOf("\nlayout {"));

export function buildShot(film: Film): void {
  const { scene, rig, grade, live, cut } = stage();
  const t0 = at(SECTION.build);
  const t1 = at(SECTION.drop);
  const B = SET.build;
  const root = new THREE.Group();
  root.position.copy(B);
  scene.add(root);
  live(root, t0 - 0.05, t1 + 0.02);
  master.set(grade, { fade: 0 }, t0);

  /* The button */
  const bw = 5.4;
  const bh = 1.25;
  const button = new THREE.Group();
  button.position.set(0, 3, 0);
  root.add(button);
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(bw, bh, 0.5, 4, 0.24),
    new THREE.MeshPhysicalMaterial({ color: 0x0f3b2b, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  const PX = 160;
  const { c, ctx } = canvas(Math.round(bw * PX), Math.round(bh * PX));
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 0.24 * PX);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  icon(ctx, copy, 0.55 * PX, (bh * PX - 0.52 * PX) / 2, 0.52 * PX, ACCENT_INK);
  ctx.fillStyle = ACCENT_INK;
  ctx.font = `600 ${Math.round(0.46 * PX)}px ${SANS}`;
  ctx.fillText("Copy for agent", 1.3 * PX, bh * PX * 0.64);
  const faceMat = new THREE.MeshBasicMaterial({ map: texture(c), transparent: true });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bh - 0.04), faceMat);
  face.position.z = 0.26;
  button.add(body, face);
  master.fromTo(button.scale, { x: 0.4, y: 0.4, z: 0.4 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(2)", immediateRender: false }, t0 - 0.02);
  master.fromTo(button.rotation, { x: -0.6, y: 0.5 }, { x: 0.12, y: -0.18, duration: 0.8, ease: "expo.out", immediateRender: false }, t0 - 0.02);

  // The press, on beat 2.
  const click = t0 + BEAT;
  const hand = cursorSprite(0.95);
  root.add(hand);
  live(hand, t0 + 0.05, click + 0.5);
  const handAt = { x: 5, y: 0.6, z: 1.2 };
  master.fromTo(handAt, { x: 5, y: 0.6 }, { x: 1.2, y: 2.75, duration: click - t0 - 0.12, ease: "power3.out", immediateRender: false }, t0 + 0.05);
  master.to(handAt, { x: 2.6, y: 1.2, duration: 0.4, ease: "power2.in" }, click + 0.1);
  stage().before(() => hand.position.set(handAt.x, handAt.y, handAt.z));
  master.to(button.position, { z: -0.2, duration: 0.06, ease: "power2.in" }, click);
  master.to(button.position, { z: 0, duration: 0.3, ease: "elastic.out(1, 0.4)" }, click + 0.06);
  master.fromTo(faceMat.color, { r: 3, g: 3, b: 3 }, { r: 1, g: 1, b: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, click);
  cue(click, "click");
  const bc = B.clone().add(new THREE.Vector3(0, 3, 0.3));
  fx().ring({ t0: click, x: bc.x, y: bc.y, z: bc.z, radius: 7, dur: 0.5, width: 0.4, color: ACCENT, upright: true });
  fx().burst({ t0: click, x: bc.x, y: bc.y, z: bc.z + 0.3, count: 160, speed: 9, up: 0, life: 0.8, color: ACCENT, size: 0.06, gravity: 0 });
  // Then it falls away beneath the dive.
  master.to(button.position, { y: -2.5, duration: 0.5, ease: "power2.in" }, click + 0.45);
  master.to(button.rotation, { x: 1.2, duration: 0.5, ease: "power2.in" }, click + 0.45);

  /* The tunnel: every character of the file, lighting up from the button out */
  const list = codeChars(FILE);
  const LEN = 110;
  const place = list.map((_, i) => {
    const th = rand(i, 70) * Math.PI * 2;
    const r = 2.3 + rand(i, 71) * 4.2;
    return new THREE.Vector3(Math.cos(th) * r, 3 + Math.sin(th) * r * 0.85, -1 - rand(i, 72) * LEN);
  });
  const lit = place.map((p, i) => click + 0.05 + (-p.z / LEN) * 0.55 + rand(i, 73) * 0.08);
  chars().add({
    chars: list,
    at(i, t, o) {
      if (t < lit[i]! || t > t1 + 0.02) return false;
      o.p.copy(place[i]!).add(B);
      o.q.identity();
      const since = t - lit[i]!;
      o.s = 0.42 * clamp01(since / 0.12);
      o.glow = 1.3 + 2 * Math.exp(-since / 0.15) + clamp01((t - (t1 - 0.6)) / 0.6) * 2.5;
      return true;
    },
  });

  const say = caption(film.overlay, "Hand it to your agent.", { x: 124, y: 110, size: 150 });
  riseIn(say.words, t0 + 0.06, { stagger: 0.06 });
  riseOut(say.words, t1 - 0.4, { dur: 0.25 });

  /* Camera: on the button, then the dive */
  cut(t0);
  const P = (x: number, y: number, z: number) => ({ x: B.x + x, y, z: B.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: B.x + x, ty: y, tz: B.z + z });
  master.set(rig, { ...P(-1.2, 3.4, 9.5), ...T(0.2, 2.9, 0), fov: 40, roll: 0, shake: 0 }, t0);
  master.to(rig, { ...P(-0.6, 3.2, 8.2), duration: click - t0, ease: "power1.inOut" }, t0);
  master.to(rig, { ...P(0, 3.05, -LEN * 0.9), ...T(0, 3, -LEN - 30), fov: 64, duration: t1 - click - 0.2, ease: "power3.in" }, click + 0.2);
  master.to(rig, { roll: 25, duration: t1 - click - 0.2, ease: "power2.in" }, click + 0.2);
  master.fromTo(grade, { aberration: 0 }, { aberration: 0.02, duration: t1 - click, ease: "power2.in", immediateRender: false }, click);
  master.to(grade, { flash: 1, duration: 0.14, ease: "power2.in" }, t1 - 0.14);
  cue(click + 0.2, "whoosh", { dur: t1 - click - 0.2, gain: 0.9 });
}
