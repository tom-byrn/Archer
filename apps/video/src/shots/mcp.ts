/**
 * Bar 10, "Plug in any agent.": a terminal hangs in the dark; one command
 * types itself (the real `claude mcp add …` line from the docs); on enter,
 * all 26 of Archer's MCP tools burst out of it and swing into orbit around
 * it on three tilted rings, while the camera pulls back to take in the lot.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { MCP_COMMAND, MCP_TOOLS } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import { ADVANCE, LINE, chars, clamp01, easeOut, rand, textChars } from "../three/chars";
import { fx } from "../three/fx";
import { ACCENT, CODE_BG, INK_3, LINE_2, MONO, canvas, rgba, texture } from "../three/paint";
import { toolChip } from "../three/panel";
import { stage } from "../three/stage";
import { SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

export function mcpShot(film: Film): void {
  const { scene, rig, live, cut } = stage();
  const t0 = at(SECTION.features + 3);
  const t1 = at(SECTION.features + 4);
  const M = SET.mcp;
  const root = new THREE.Group();
  root.position.copy(M);
  scene.add(root);
  live(root, t0 - 0.05, t1 + 0.05);

  /* The terminal */
  const EM = 0.19;
  const prompt = `$ ${MCP_COMMAND}`;
  const W = prompt.length * ADVANCE * EM + 1.2;
  const H = 2.5;
  const center = new THREE.Vector3(0, 3.2, 0);
  const PX = 120;
  const { c, ctx } = canvas(Math.round(W * PX), Math.round(H * PX));
  ctx.beginPath();
  ctx.roundRect(4, 4, c.width - 8, c.height - 8, 0.2 * PX);
  ctx.fillStyle = rgba(CODE_BG, 0.94);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = LINE_2;
  ctx.stroke();
  ctx.fillStyle = rgba("#ffffff", 0.04);
  ctx.fillRect(6, 6, c.width - 12, 0.5 * PX);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => {
    ctx.beginPath();
    ctx.arc((0.34 + i * 0.26) * PX, 0.28 * PX, 0.075 * PX, 0, Math.PI * 2);
    ctx.fillStyle = rgba(col, 0.8);
    ctx.fill();
  });
  ctx.fillStyle = INK_3;
  ctx.font = `500 ${Math.round(0.2 * PX)}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText("~/acme", c.width / 2, 0.35 * PX);
  const term = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }));
  term.position.copy(center);
  root.add(term);
  master.fromTo(term.scale, { x: 0.3, y: 0.01 }, { x: 1, y: 1, duration: 0.35, ease: "expo.out", immediateRender: false }, t0 - 0.02);

  // The command, a character at a time, then the answer.
  const origin = M.clone().add(center).add(new THREE.Vector3(-W / 2 + 0.55, H / 2 - 0.85, 0.02));
  const tType = t0 + 0.12;
  const KEY = 0.0075;
  const tEnter = tType + prompt.length * KEY + 0.08;
  const line1 = textChars(prompt, "#ecebe7", 0);
  line1.forEach((ch, i) => {
    if (i === 0) ch.color = new THREE.Color(ACCENT);
  });
  const answer = `✓ Connected to archer · ${MCP_TOOLS.length} tools`;
  const line2 = textChars(answer, ACCENT, 1);
  const all = [...line1, ...line2];
  chars().add({
    chars: all,
    at(i, t, o) {
      const ch = all[i]!;
      const shown = ch.line === 0 ? tType + ch.col * KEY : tEnter + 0.1 + ch.col * 0.004;
      if (t < shown) return false;
      o.p.set(origin.x + (ch.col + 0.5) * ADVANCE * EM, origin.y - (ch.line + 0.5) * LINE * EM * 1.2, origin.z);
      o.q.identity();
      const since = t - shown;
      o.s = EM * (1 + 0.6 * Math.exp(-since / 0.04));
      o.glow = 1.05 + 1.2 * Math.exp(-since / 0.08);
      return true;
    },
  });
  for (let k = 0; k < prompt.length; k += 4) cue(tType + k * KEY, "key", { gain: 0.45 });
  cue(tEnter, "click");

  /* The tools, flung into orbit */
  const rings = [
    { r: 5.2, tilt: new THREE.Euler(0.35, 0, 0.18), speed: 0.55 },
    { r: 6.6, tilt: new THREE.Euler(-0.25, 0, -0.32), speed: -0.42 },
    { r: 8.0, tilt: new THREE.Euler(1.2, 0.3, 0.1), speed: 0.33 },
  ].map((ring) => ({ ...ring, q: new THREE.Quaternion().setFromEuler(ring.tilt) }));
  const tBurst = tEnter + 0.16;
  const chipAt = new THREE.Vector3();
  MCP_TOOLS.forEach((name, i) => {
    const ring = rings[i % 3]!;
    const k = Math.floor(i / 3);
    const perRing = Math.ceil(MCP_TOOLS.length / 3);
    const phase = (k / perRing) * Math.PI * 2 + (i % 3) * 0.7;
    const chip = toolChip(name, 0.58);
    root.add(chip);
    const leave = tBurst + rand(i, 50) * 0.18;
    live(chip, leave, t1 + 0.05);
    stage().before((t) => {
      if (t < leave) return;
      const th = phase + (t - tBurst) * ring.speed;
      chipAt.set(Math.cos(th) * ring.r, 0, Math.sin(th) * ring.r).applyQuaternion(ring.q).add(center);
      const e = easeOut(clamp01((t - leave) / 0.5));
      chip.position.copy(center).lerp(chipAt, e);
      const s = 0.3 + 0.7 * e;
      chip.scale.set(chip.userData.w * s, chip.userData.h * s, 1);
    });
    chip.userData = { w: chip.scale.x, h: chip.scale.y };
  });
  // Faint orbit lines.
  for (const ring of rings) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 0.012, 6, 160), mat);
    torus.quaternion.copy(ring.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    torus.position.copy(center);
    root.add(torus);
    master.to(mat, { opacity: 0.55, duration: 0.4 }, tBurst + 0.1);
  }
  const burst = M.clone().add(center);
  fx().flare({ t0: tBurst, x: burst.x, y: burst.y, z: burst.z + 0.2, size: 7, dur: 0.4, color: ACCENT, glow: 2 });
  fx().burst({ t0: tBurst, x: burst.x, y: burst.y, z: burst.z, count: 220, speed: 10, up: 0, life: 1, color: ACCENT, size: 0.07, gravity: 0 });
  fx().ring({ t0: tBurst, x: burst.x, y: burst.y, z: burst.z, radius: 9, dur: 0.6, width: 0.5, color: ACCENT, upright: true });
  film.floor.wave({ t0: tBurst, x: M.x, z: M.z, speed: 16, strength: 1.4, decay: 0.6 });
  cue(tBurst, "impact", { gain: 0.4 });
  cue(tBurst + 0.05, "whoosh", { dur: 0.5 });
  master.fromTo(rig, { shake: 0.1 }, { shake: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, tBurst);

  const title = caption(film.overlay, "Plug in any agent.", { x: 124, y: 110, size: 150 });
  riseIn(title.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(title.words, t1 - 0.2);

  /* Camera: tight on the command, then back and round as the tools fly */
  cut(t0);
  const P = (x: number, y: number, z: number) => ({ x: M.x + x, y, z: M.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: M.x + x, ty: y, tz: M.z + z });
  master.set(rig, { ...P(-2.2, 3.5, 8), ...T(-7, 2.9, 0), fov: 44, roll: 0, shake: 0 }, t0);
  master.to(rig, { ...T(0.4, 2.9, 0), duration: 0.3, ease: "expo.out" }, t0);
  master.to(rig, { ...P(-0.8, 3.3, 6.9), duration: tBurst - t0 - 0.3, ease: "none" }, t0 + 0.3);
  master.to(rig, { ...P(4.5, 4.8, 10.5), ...T(0.6, 2.7, 0), fov: 50, duration: t1 - tBurst - 0.25, ease: "power3.out" }, tBurst - 0.05);
  master.to(rig, { ...T(20, 3, 8), duration: 0.25, ease: "power3.in" }, t1 - 0.25);
  cue(t1 - 0.25, "whoosh", { dur: 0.35, gain: 0.8 });
}
