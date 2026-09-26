/**
 * Bars 0–1. "Draw it.": the canvas ignites under a low camera, three
 * components erupt out of the floor on the kicks, and light shoots between
 * them as the camera cranes up. "It's code.": each box and each connection
 * bursts into the characters of its own line of .arch, which stream up and
 * lock into a wall of glowing code; then the whole file is pulled into a
 * point, the silence before the drop.
 */
import * as THREE from "three";
import { master } from "../engine";
import { layoutDiagram } from "../diagram";
import { OPEN_LAYOUT, OPEN_SOURCE } from "../sources";
import { cue } from "../cues";
import { caption, riseIn, riseOut } from "../text";
import { CharState, bezier, chars, clamp01, codeChars, easeInOut, rand, slot, tumble } from "../three/chars";
import { BEAT, SECTION, at } from "../time";
import { Slab } from "../three/slab";
import { stage } from "../three/stage";
import { Tube } from "../three/tube";
import type { Film } from "./context";

const CELL = 40;

/** Where the file collapses at the end of bar 1, and the title explodes from. */
export const CORE = new THREE.Vector3(1.4, 3.3, -0.5);

export function openShot(film: Film): void {
  const { scene, rig } = stage();
  const t0 = at(SECTION.draw);
  const d = layoutDiagram(OPEN_SOURCE + OPEN_LAYOUT);
  const ox = -(d.bounds.x + d.bounds.w / 2) / CELL;
  const oz = -(d.bounds.y + d.bounds.h / 2) / CELL;

  const slabs = new Map<string, Slab>();
  for (const b of d.boxes) {
    const s = new Slab({ name: b.name, type: b.type, color: b.color, glyph: b.glyph, w: b.w / CELL, d: b.h / CELL }, film.floor);
    s.at(b.x / CELL + ox + b.w / CELL / 2, b.y / CELL + oz + b.h / CELL / 2);
    scene.add(s.group);
    slabs.set(b.path, s);
  }
  const tubes = new Map<string, Tube>();
  for (const e of d.edges) {
    const pts = e.points.map((p) => new THREE.Vector3(p.x / CELL + ox, 0.17, p.y / CELL + oz));
    const tube = new Tube(pts).label(e.chip?.type, e.chip?.label);
    tube.drawn.value = 0;
    scene.add(tube.group);
    tubes.set(e.key, tube);
  }

  // The grid ignites from the middle on the very first kick.
  film.floor.wave({ t0: t0 - 0.06, x: 0, z: 0, speed: 16, strength: 2.4, decay: 0.8 });

  slabs.get("web")!.rise(t0 - 0.2, { pitch: 0 });
  slabs.get("api")!.rise(t0 + BEAT - 0.2, { pitch: 4, spin: -0.9 });
  slabs.get("db")!.drop(t0 + BEAT * 2, { pitch: 7 });
  tubes.get("web->api")!.draw(t0 + BEAT * 1.25, 0.32);
  tubes.get("api->db")!.draw(t0 + BEAT * 2.35, 0.32);
  tubes.get("web->api")!.flow(t0 + BEAT * 2, 2, 0.9);
  tubes.get("api->db")!.flow(t0 + BEAT * 3, 2, 0.9);

  // Camera: low beside the first box, craning up and across to take all three in.
  Object.assign(rig, { x: -9.5, y: 1.1, z: 5.2, tx: -5.2, ty: 0.35, tz: 0.2, fov: 36 });
  master.to(rig, { x: 1, y: 9.5, z: 14.5, tx: 0.5, ty: -0.4, tz: -0.5, duration: at(SECTION.code) - t0 + 0.3, ease: "power2.inOut" }, t0 - 0.3);

  const draw = caption(film.overlay, "Draw it.", { x: 124, y: 110, size: 168 });
  riseIn(draw.words, t0 - 0.08, { dur: 0.6, stagger: 0.07 });

  /* ---------------------------------------------------------- It's code. */
  const t1 = at(SECTION.code);
  const t2 = at(SECTION.title);
  riseOut(draw.words, t1 - 0.16);
  const said = caption(film.overlay, "It's code.", { x: 124, y: 110, size: 168 });
  riseIn(said.words, t1 + 0.12, { dur: 0.6, stagger: 0.07 });
  riseOut(said.words, t2 - 0.34, { dur: 0.25 });

  // The wall the file assembles into, facing the camera's end mark.
  const em = 0.44;
  const center = CORE;
  const widthCols = 38;
  // A little below the core, so the top line clears the caption.
  const frame = new THREE.Matrix4().makeTranslation(center.x - (widthCols * 0.6 * em) / 2, center.y - 0.8 + (8 * 1.55 * em) / 2, center.z);
  const list = codeChars(OPEN_SOURCE);
  // Where each line comes from: its component's face, or its connection's tube.
  const source: Record<number, (i: number) => THREE.Vector3> = {};
  const face = (path: string) => (i: number) => {
    const s = slabs.get(path)!;
    const { x, z } = s.group.position;
    return new THREE.Vector3(x + (rand(i, 1) - 0.5) * s.spec.w * 0.9, s.h + 0.05, z + (rand(i, 2) - 0.5) * s.spec.d * 0.9);
  };
  const along = (key: string) => (i: number) => tubes.get(key)!.curve.getPointAt(rand(i, 3));
  source[0] = (i) => new THREE.Vector3((rand(i, 1) - 0.5) * 3, 0.1, (rand(i, 2) - 0.5) * 2);
  source[2] = face("web");
  source[3] = face("api");
  source[4] = face("db");
  source[6] = along("web->api");
  source[7] = along("api->db");
  const from = list.map((c, i) => source[c.line]?.(i) ?? new THREE.Vector3());
  const to = list.map((c) => slot(c, frame, em));
  const ctrl = list.map((_, i) => {
    const m = from[i]!.clone().lerp(to[i]!, 0.5);
    return m.add(new THREE.Vector3((rand(i, 4) - 0.5) * 5, 2.5 + rand(i, 5) * 2.5, (rand(i, 6) - 0.5) * 3));
  });
  const leave = list.map((c, i) => t1 + 0.04 + (c.line === 0 ? 0.3 : c.line >= 6 ? 0.18 : 0) + rand(i, 10) * 0.28);
  const fly = list.map((_, i) => 0.5 + rand(i, 11) * 0.25);
  const q0 = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  const swirlStart = t2 - 0.44;
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  chars().add({
    chars: list,
    at(i, t, o: CharState) {
      if (t < leave[i]! || t >= t2 - 0.03) return false;
      const u = clamp01((t - leave[i]!) / fly[i]!);
      const e = easeInOut(u);
      bezier(from[i]!, ctrl[i]!, to[i]!, e, o.p);
      tumble(i, Math.PI * 2.2, q0);
      o.q.slerpQuaternions(q0, ident, Math.min(1, e * 1.15));
      o.s = em * (0.35 + 0.65 * e);
      // Arriving: a flash, then the settled glow of a hologram.
      const landed = t - (leave[i]! + fly[i]!);
      o.glow = landed < 0 ? 2.2 : 1.25 + 1.6 * Math.exp(-landed / 0.12);
      if (t > swirlStart) {
        // The file is pulled into a point: a tightening spiral.
        const s = clamp01((t - swirlStart) / 0.41);
        const k = s * s;
        tmp.copy(o.p).sub(center).applyAxisAngle(axis, k * Math.PI * 3.2).multiplyScalar(1 - k);
        o.p.copy(center).add(tmp);
        o.s = em * (1 - 0.7 * k);
        o.glow = 1.3 + k * 4;
      }
      return true;
    },
  });
  cue(t2 - 0.44, "whoosh", { dur: 0.44, gain: 0.8 });

  // The boxes and wires give themselves up as their characters leave.
  for (const [path, s] of slabs) {
    const lineOf = { web: 2, api: 3, db: 4 }[path as "web" | "api" | "db"];
    const first = Math.min(...list.map((c, i) => (c.line === lineOf ? leave[i]! : Infinity)));
    master.to(s.glow, { value: 5, duration: 0.12, ease: "power2.out" }, first - 0.08);
    master.to(s.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.4, ease: "power3.in" }, first);
    master.set(s.group, { visible: false }, first + 0.41);
  }
  for (const tube of tubes.values()) {
    master.to(tube.drawn, { value: 0, duration: 0.35, ease: "power2.in" }, t1 + 0.12);
    if (tube.chip) master.to(tube.chip.scale, { x: 0.001, y: 0.001, duration: 0.2, ease: "power2.in" }, t1 + 0.1);
  }
  film.floor.wave({ t0: t1 + 0.05, x: 0, z: 0, speed: 12, strength: 1.2, decay: 0.6 });
  cue(t1 + 0.04, "whoosh", { dur: 0.7 });

  // Camera: down and round to face the wall as it forms, then a slow push.
  master.to(rig, { x: 1.9, y: 4.3, z: 13.2, tx: 1.4, ty: 3.2, tz: -0.5, duration: 1.0, ease: "power3.inOut" }, t1 - 0.12);
  master.to(rig, { z: 11.6, y: 3.9, duration: t2 - t1 - 0.88, ease: "power1.in" }, t1 + 0.88);
}
