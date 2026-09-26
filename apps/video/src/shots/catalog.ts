/**
 * Bar 7, "350+ components.": every type in the catalog, as a tile. They
 * burst out from behind the camera, streak past it and slam into a curved
 * wall around the viewer, filling it from the middle out; a wave of light
 * runs across the finished wall, then the camera whips away.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { caption, riseIn, riseOut, shade } from "../text";
import { bezier, clamp01, easeOut, rand, tumble } from "../three/chars";
import { stage } from "../three/stage";
import { TYPES, tileField } from "../three/tiles";
import { SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

export const TYPE_COUNT = Math.floor(TYPES.length / 10) * 10;

const COLS = 22;
const PITCH = 0.9;
const TILE = 0.76;
/** The wall is a slice of a cylinder around a vertical axis through the camera. */
const RADIUS = 18;

export function catalogShot(film: Film): void {
  const { rig, live, cut } = stage();
  const t0 = at(SECTION.features);
  const t1 = at(SECTION.features + 1);
  const S = SET.catalog;
  const n = TYPES.length;
  const rows = Math.ceil(n / COLS);
  const axis = new THREE.Vector3(S.x, 0, S.z + 6);
  const eye = new THREE.Vector3(S.x, 7.2, S.z + 1);

  // Slots on the wall, and the order they fill in: from the middle out.
  const slot: THREE.Vector3[] = [];
  const face: THREE.Quaternion[] = [];
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const th = ((c - (COLS - 1) / 2) * PITCH) / RADIUS;
    slot.push(new THREE.Vector3(axis.x + RADIUS * Math.sin(th), 0.9 + (rows - 1 - r) * PITCH, axis.z - RADIUS * Math.cos(th)));
    face.push(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th));
    const dc = (c - (COLS - 1) / 2) / (COLS / 2);
    const dr = (r - (rows - 1) / 2) / (rows / 2);
    order.push(Math.min(1, Math.hypot(dc, dr * 0.9) / 1.2));
  }
  const FLY = 0.5;
  const land = order.map((d, i) => t0 + 0.14 + d * 0.72 + rand(i, 40) * 0.12);
  const from = slot.map((_, i) =>
    eye.clone().add(new THREE.Vector3((rand(i, 41) - 0.5) * 16, (rand(i, 42) - 0.5) * 9, 1.5 + rand(i, 43) * 5)),
  );
  const ctrl = slot.map((s, i) =>
    from[i]!.clone().lerp(s, 0.45).add(new THREE.Vector3((rand(i, 44) - 0.5) * 6, (rand(i, 45) - 0.5) * 4, 0)),
  );
  const q0 = new THREE.Quaternion();
  const tSweep = t0 + 1.02;
  const tBlast = t1 - 0.3;

  const field = tileField((i, t, o) => {
    const u = (t - (land[i]! - FLY)) / FLY;
    if (u < 0) return false;
    if (u < 1) {
      const e = easeOut(u);
      bezier(from[i]!, ctrl[i]!, slot[i]!, e, o.p);
      tumble(i, Math.PI * 3 * (1 - e), q0);
      o.q.copy(face[i]!).multiply(q0);
      o.s = TILE * (0.5 + 0.5 * e);
      o.glow = 1.8;
      return true;
    }
    o.p.copy(slot[i]!);
    o.q.copy(face[i]!);
    const since = t - land[i]!;
    // The landing punch: a little overshoot toward the viewer, and a flash.
    o.p.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(face[i]!), 0.5 * Math.exp(-since / 0.06) * (since < 0.3 ? 1 : 0));
    o.s = TILE;
    const sweep = Math.exp(-(((t - tSweep) * 1.4 - order[i]!) ** 2) / 0.012);
    o.glow = 1 + 2.2 * Math.exp(-since / 0.14) + 1.6 * sweep;
    if (t > tBlast) {
      // Out: the wall blows apart toward the viewer.
      const b = clamp01((t - tBlast) / 0.3);
      o.p.lerp(eye, b * b * (0.6 + rand(i, 46) * 0.5));
      tumble(i, Math.PI * 2 * b, q0);
      o.q.multiply(q0);
    }
    return true;
  });
  live(field.group, t0 - 0.05, t1 + 0.02);

  shade(film.overlay, t0, t1);
  const title = caption(film.overlay, `${TYPE_COUNT}+ components.`, { x: 124, y: 110, size: 150 });
  riseIn(title.words, t0 + 0.06, { stagger: 0.06 });
  riseOut(title.words, t1 - 0.22, { dur: 0.22 });

  for (let k = 0; k < 8; k++) cue(t0 + 0.14 + k * 0.1, "tick", { gain: 0.5, pitch: k * 2 });
  cue(tSweep, "success", { gain: 0.5 });
  cue(tBlast, "whoosh", { dur: 0.4 });

  // Camera: in the middle of it all, turning slowly, then thrown sideways.
  // It opens on the tail of a whip, swinging in from the left.
  cut(t0);
  master.set(rig, { x: eye.x - 1.5, y: eye.y - 0.4, z: eye.z + 2.5, tx: S.x - 10, ty: 7.4, tz: S.z - 12, fov: 60, roll: 0, shake: 0 }, t0);
  master.to(rig, { tx: S.x - 3, duration: 0.32, ease: "expo.out" }, t0);
  master.to(rig, { x: eye.x + 0.8, y: eye.y + 0.2, z: eye.z + 0.5, tx: S.x + 2.5, ty: 7.8, fov: 54, duration: tBlast - t0 - 0.32, ease: "power1.inOut" }, t0 + 0.32);
  master.to(rig, { tx: S.x + 20, ty: 6, tz: S.z - 4, duration: 0.3, ease: "power3.in" }, tBlast);
}
