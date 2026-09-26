/**
 * Bars 15–17, drop 2. "Your whole system.": out of the white-out, a real
 * AI support agent's architecture (the dashboard's sample) slams down piece
 * by piece on the sixteenths and wires itself up. "One file.": its source
 * streams up out of the boxes into one tall sheet of code. "Every agent.":
 * agents swarm it. Then the headline, a word to a beat, in 3D.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { AI_SUPPORT_AGENT } from "../../../web/lib/samples/ai-support-agent";
import { caption, riseIn, riseOut } from "../text";
import { ADVANCE, LINE, bezier, chars, clamp01, codeChars, easeInOut, rand, tumble } from "../three/chars";
import { diagram3d } from "../three/diagram3d";
import { fx } from "../three/fx";
import { ACCENT } from "../three/paint";
import { badgeTexture } from "../three/slab";
import { stage } from "../three/stage";
import { text3d } from "../three/text3d";
import { BEAT, SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

const FILE = AI_SUPPORT_AGENT.slice(0, AI_SUPPORT_AGENT.indexOf("\nlayout {"));

export function dropShot(film: Film): void {
  const { scene, rig, grade, live, cut } = stage();
  const t0 = at(SECTION.drop);
  const t1 = at(SECTION.drop + 1);
  const t2 = at(SECTION.drop + 2);
  const tEnd = at(SECTION.end);
  const D = SET.drop;
  const set = diagram3d(AI_SUPPORT_AGENT, D, film.floor);
  live(set.root, t0 - 0.5, tEnd + 0.02);

  /* ------------------------------------------------ Your whole system. */
  cut(t0);
  master.fromTo(grade, { flash: 1 }, { flash: 0, duration: 0.45, ease: "power2.out", immediateRender: false }, t0);
  master.fromTo(grade, { aberration: 0.025 }, { aberration: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, t0);
  master.set(grade, { zoom: 0 }, t0);
  cue(t0, "impact");
  film.floor.wave({ t0, x: D.x, z: D.z, speed: 26, strength: 3, decay: 0.9 });
  fx().flare({ t0, x: D.x - 1, y: 1.6, z: D.z - 1.5, size: 0.9, stretch: 16, dur: 0.7, glow: 2.4, color: 0x9ff7d8 });

  const order = [
    "knowledge",
    "tools",
    "agent",
    "guardrails",
    "widget",
    "llm",
    "tools.orders",
    "tools.refunds",
    "memory",
    "knowledge.retriever",
    "knowledge.embeddings",
    "knowledge.vectors",
    "knowledge.ingest",
    "evals",
    "team",
  ];
  order.forEach((path, k) => {
    const t = t0 + 0.06 + k * (BEAT / 4);
    const plane = set.planes.get(path);
    if (plane) {
      const g = plane.group;
      plane.walls.value = 0.25;
      g.visible = false;
      master.set(g, { visible: true }, t - 0.35);
      master.fromTo(g.position, { y: 10 }, { y: 0, duration: 0.35, ease: "power2.in", immediateRender: false }, t - 0.35);
      master.fromTo(plane.glow, { value: 5 }, { value: 1.1, duration: 0.6, ease: "power2.out", immediateRender: false }, t);
      const w = set.world(g.position.clone().setY(0));
      fx().ring({ t0: t, x: w.x, z: w.z, radius: 18, dur: 0.8, width: 1, glow: 1.6, color: set.d.boxes.find((b) => b.path === path)!.color });
      cue(t, "pop", { pitch: -5 });
      return;
    }
    set.slab(path).drop(t, { pitch: [0, 2, 4, 7, 9, 12][k % 6], height: 9 });
  });
  const edges = [...set.tubes.keys()];
  edges.forEach((key, i) => {
    set.tube(key).draw(t0 + 1.0 + i * 0.06, 0.24, i % 2 === 0);
    set.tube(key).flow(t0 + 1.4 + i * 0.03, 2, 0.8 + rand(i, 80) * 0.4);
  });
  master.fromTo(rig, { shake: 0.14 }, { shake: 0, duration: 1.2, ease: "power2.out", immediateRender: false }, t0);

  const lines = [
    { text: "Your whole system.", in: t0 + 0.35, out: t1 - 0.14 },
    { text: "One file.", in: t1 + 0.02, out: t1 + BEAT * 2 - 0.12 },
    { text: "Every agent.", in: t1 + BEAT * 2 + 0.02, out: t2 - 0.1 },
  ];
  for (const l of lines) {
    const c = caption(film.overlay, l.text, { x: 124, y: 110, size: 150 });
    riseIn(c.words, l.in, { stagger: 0.06 });
    riseOut(c.words, l.out - 0.06, { dur: 0.22, stagger: 0.015 });
  }

  /* ---------------------------------------------------------- One file. */
  // The source, out of the boxes it describes, up into one sheet behind them.
  const list = codeChars(FILE);
  const EM = 0.34;
  const maxLine = Math.max(...list.map((c) => c.line));
  const sheetTop = 3 + (maxLine + 1) * LINE * EM;
  const sheet = new THREE.Vector3(D.x - 11, sheetTop, D.z - 21);
  const lineText = FILE.split("\n");
  const owner = lineText.map((l) => /^\s*component (\w+)/.exec(l)?.[1]);
  const pathOf = (line: number) => {
    // The nearest component declaration at or above this line, with its parent.
    let parent: string | undefined;
    let found: string | undefined;
    for (let i = 0; i <= line; i++) {
      const id = owner[i];
      if (!id) continue;
      if (/^\s{2}/.test(lineText[i]!)) found = `${parent}.${id}`;
      else {
        parent = id;
        found = id;
      }
    }
    return found && set.slabs.has(found) ? found : undefined;
  };
  const from = list.map((c, i) => {
    const p = pathOf(c.line);
    if (!p) return set.world(new THREE.Vector3((rand(i, 81) - 0.5) * 20, 0.3, (rand(i, 82) - 0.5) * 18));
    const s = set.slab(p);
    return set.world(s.group.position.clone().add(new THREE.Vector3((rand(i, 83) - 0.5) * s.spec.w, s.h, (rand(i, 84) - 0.5) * s.spec.d)));
  });
  const to = list.map((c) => new THREE.Vector3(sheet.x + (c.col + 0.5) * ADVANCE * EM, sheet.y - (c.line + 0.5) * LINE * EM, sheet.z));
  const leave = list.map((c, i) => t1 - 0.05 + (c.line / maxLine) * 0.35 + rand(i, 85) * 0.2);
  const ctrl = new THREE.Vector3();
  const q0 = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  chars().add({
    chars: list,
    at(i, t, o) {
      if (t < leave[i]! || t > tEnd + 0.02) return false;
      const u = clamp01((t - leave[i]!) / 0.6);
      const e = easeInOut(u);
      ctrl.copy(from[i]!).lerp(to[i]!, 0.5);
      ctrl.y += 6;
      bezier(from[i]!, ctrl, to[i]!, e, o.p);
      tumble(i, Math.PI * 2 * (1 - e), q0);
      o.q.slerpQuaternions(q0, ident, e);
      o.s = EM * (0.5 + 0.5 * e);
      const since = t - leave[i]! - 0.6;
      o.glow = since < 0 ? 2.6 : 1.3 + 2.2 * Math.exp(-since / 0.2);
      return true;
    },
  });
  cue(t1 - 0.05, "whoosh", { dur: 0.6 });

  /* ------------------------------------------------------- Every agent. */
  const tAgents = t1 + BEAT * 2;
  const orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(5) });
  const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(2.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const center = set.world(new THREE.Vector3(0, 0, 0));
  const orbGeo = new THREE.SphereGeometry(0.28, 18, 12);
  const trailGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (let k = 0; k < 6; k++) {
    const orb = new THREE.Group();
    orb.add(new THREE.Mesh(orbGeo, orbMat));
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), depthWrite: false }));
    badge.scale.setScalar(0.8);
    badge.position.y = 0.75;
    orb.add(badge);
    scene.add(orb);
    const start = tAgents - 0.1 + k * 0.06;
    live(orb, start, tEnd + 0.02);
    const trail = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(trailGeo, trailMat);
      scene.add(m);
      live(m, start, tEnd + 0.02);
      return m;
    });
    const r = 13 + (k % 3) * 3.5;
    const h = 3 + (k % 2) * 2.5;
    const w = (k % 2 ? -1 : 1) * (1.1 + k * 0.08);
    const ph = (k / 6) * Math.PI * 2;
    const pos = (t: number, out: THREE.Vector3) => {
      const a = ph + (t - tAgents) * w;
      // They dive in from high above, then circle.
      const dive = Math.exp(-Math.max(0, t - start) / 0.25);
      // …and clear out upward for the headline.
      const away = Math.max(0, t - (t2 - 0.25)) ** 2 * 40;
      return out.set(center.x + Math.cos(a) * r, h + dive * 18 + away + Math.sin((t - tAgents) * 3 + k) * 0.6, center.z + Math.sin(a) * r);
    };
    stage().before((t) => {
      pos(t, orb.position);
      trail.forEach((m, j) => {
        pos(t - (j + 1) * 0.018, m.position);
        m.scale.setScalar(1 - j / trail.length);
      });
    });
  }
  ["agent", "tools.refunds", "knowledge.retriever", "memory", "evals", "llm"].forEach((p, k) => set.slab(p).addBadge(tAgents + 0.25 + k * 0.07));
  cue(tAgents, "whoosh", { dur: 0.5 });

  /* ------------------------------------------------ The headline in 3D */
  const words = [
    { text: "Software", line: 0, beat: 0 },
    { text: "architecture", line: 0, beat: 0.75 },
    { text: "for your", line: 1, beat: 1.75 },
    { text: "agents", line: 1, beat: 2.5 },
  ];
  const SIZE = 1.8;
  // Just under the bloom threshold: crisp, not glowing.
  const ink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xecebe7).multiplyScalar(1.05) });
  const meshes = words.map((w) => text3d(w.text, { font: "serif", size: SIZE, depth: 0.32, bevel: 0.02, face: ink }));
  const widths = meshes.map((m) => {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!;
    return b.max.x - b.min.x;
  });
  const period = new THREE.Mesh(new THREE.SphereGeometry(SIZE * 0.1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.3) }));
  const head = new THREE.Group();
  const HEAD = set.world(new THREE.Vector3(0, 7.2, 10));
  head.position.copy(HEAD);
  scene.add(head);
  live(head, t2 - 0.1, tEnd + 0.02);
  const gap = SIZE * 0.32;
  for (const line of [0, 1]) {
    const ids = words.map((w, i) => (w.line === line ? i : -1)).filter((i) => i >= 0);
    const total = ids.reduce((s, i) => s + widths[i]!, 0) + gap * (ids.length - 1) + (line === 1 ? SIZE * 0.3 : 0);
    let x = -total / 2;
    for (const i of ids) {
      meshes[i]!.position.set(x + widths[i]! / 2, line === 0 ? SIZE * 0.62 : -SIZE * 0.68, 0);
      x += widths[i]! + gap;
    }
    if (line === 1) period.position.set(x - gap + SIZE * 0.14, -SIZE * 0.68 - SIZE * 0.3, 0.1);
  }
  words.forEach((w, i) => {
    const m = meshes[i]!;
    head.add(m);
    const t = at(SECTION.drop + 2, w.beat);
    const home = m.position.clone();
    m.visible = false;
    master.set(m, { visible: true }, t);
    master.fromTo(m.position, { z: home.z + 7 }, { z: home.z, duration: 0.28, ease: "expo.out", immediateRender: false }, t);
    master.fromTo(m.scale, { x: 1.5, y: 1.5, z: 1.5 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: "expo.out", immediateRender: false }, t);
    master.fromTo(m.rotation, { x: -0.5 }, { x: 0, duration: 0.4, ease: "back.out(2)", immediateRender: false }, t);
    master.fromTo(grade, { flash: 0.28 }, { flash: 0, duration: 0.22, ease: "power2.out", immediateRender: false }, t);
    master.fromTo(rig, { shake: 0.09 }, { shake: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, t);
    cue(t, "tick", { gain: 0.9, pitch: [0, 4, 7, 12][i] });
    const wp = HEAD.clone().add(m.position);
    fx().burst({ t0: t, x: wp.x, y: wp.y, z: wp.z, count: 90, speed: 7, up: 0, life: 0.7, size: 0.06, color: i === 3 ? ACCENT : 0xecebe7, gravity: 0 });
  });
  head.add(period);
  period.visible = false;
  const tDot = at(SECTION.drop + 2, 2.5) + 0.12;
  master.set(period, { visible: true }, tDot);
  master.fromTo(period.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: "back.out(4)", immediateRender: false }, tDot);
  // A dark veil drops over the diagram behind the words.
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), veilMat);
  veil.position.set(0, 0, -1.6);
  head.add(veil);
  master.to(veilMat, { opacity: 0.62, duration: 0.3, ease: "power2.out" }, t2 - 0.1);
  // Out: the words blow toward the lens into the end card's flash.
  meshes.forEach((m, i) => {
    master.to(m.position, { z: 12, x: m.position.x * 1.8, y: m.position.y * 2 + (i - 1.5) * 0.5, duration: 0.3, ease: "power3.in" }, tEnd - 0.3);
    master.to(m.rotation, { x: (rand(i, 86) - 0.5) * 2, y: (rand(i, 87) - 0.5) * 2, duration: 0.3, ease: "power2.in" }, tEnd - 0.3);
  });
  master.to(grade, { flash: 0.9, duration: 0.12, ease: "power2.in" }, tEnd - 0.12);

  /* ------------------------------------------------------------ Camera */
  const P = (x: number, y: number, z: number) => ({ x: D.x + x, y, z: D.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: D.x + x, ty: y, tz: D.z + z });
  master.set(rig, { ...P(-5, 2.2, 8), ...T(0, 1.2, -1.5), fov: 56, roll: -6, shake: 0 }, t0);
  // Bar 15: low among the landings, craning up and back to take it all in.
  master.to(rig, { ...P(-12, 15, 20), ...T(0, 0, -0.5), fov: 48, roll: 0, duration: t1 - t0 + 0.1, ease: "power2.inOut" }, t0 + 0.05);
  // Bar 16: round to see the file rise behind, then the swarm.
  master.to(rig, { ...P(3, 12, 24), ...T(-2, 5.5, -9), fov: 48, duration: BEAT * 2, ease: "power2.inOut" }, t1 + 0.1);
  master.to(rig, { ...P(14, 9, 18), ...T(0, 3, -4), duration: t2 - t1 - BEAT * 2 - 0.05, ease: "sine.inOut" }, t1 + BEAT * 2 + 0.1);
  // Bar 17: square on to the headline, easing back.
  master.to(rig, { ...P(0, 7.5, 24.5), ...T(0, 7.0, 10), fov: 42, duration: 0.35, ease: "power3.out" }, t2 - 0.12);
  master.to(rig, { ...P(0, 7.3, 26), duration: tEnd - t2 - 0.25, ease: "sine.inOut" }, t2 + 0.23);
}
