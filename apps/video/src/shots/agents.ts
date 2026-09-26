/**
 * Bar 11, "Agents draw, too.": two agents, as orbs of light with robot
 * badges, streak across an empty canvas; wherever one dips, a component
 * erupts beneath it, badged as the agent's work, and the wiring follows
 * in a rapid chain until a whole storefront stands there.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { AGENT_LAYOUT, AGENT_SOURCE } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import { diagram3d } from "../three/diagram3d";
import { ACCENT } from "../three/paint";
import { badgeTexture } from "../three/slab";
import { stage } from "../three/stage";
import { SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

interface Stop {
  t: number;
  p: THREE.Vector3;
}

/** A path through timed stops, smooth, as a function of time. */
function flight(stops: Stop[]): (t: number, out: THREE.Vector3) => THREE.Vector3 {
  const curve = new THREE.CatmullRomCurve3(
    stops.map((s) => s.p),
    false,
    "centripetal",
  );
  const n = stops.length - 1;
  return (t, out) => {
    let i = 0;
    while (i < n - 1 && t > stops[i + 1]!.t) i++;
    const a = stops[i]!;
    const b = stops[i + 1]!;
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    // Ease into and out of each stop: the orb dips, then darts on.
    const e = f * f * (3 - 2 * f);
    return curve.getPoint(Math.min(1, (i + e) / n), out);
  };
}

export function agentsShot(film: Film): void {
  const { scene, rig, live, cut } = stage();
  const t0 = at(SECTION.features + 4);
  const t1 = at(SECTION.features + 5);
  const A = SET.agents;
  const set = diagram3d(AGENT_SOURCE + AGENT_LAYOUT, A, film.floor);
  live(set.root, t0 - 0.3, t1 + 0.05);
  const top = (p: string) => set.world(set.slab(p).group.position.clone().setY(1.5));

  // Who visits what, when: each visit raises that component under the orb.
  const visits: [number, string, number][] = [
    [0, "web", t0 + 0.16],
    [1, "pay", t0 + 0.26],
    [0, "search", t0 + 0.4],
    [1, "db", t0 + 0.5],
    [0, "api", t0 + 0.66],
    [1, "mail", t0 + 0.74],
  ];
  const routes: Stop[][] = [
    [{ t: t0 - 0.25, p: set.world(new THREE.Vector3(-18, 6, -12)) }],
    [{ t: t0 - 0.2, p: set.world(new THREE.Vector3(18, 6, -12)) }],
  ];
  visits.forEach(([who, path, t], k) => {
    routes[who]!.push({ t, p: top(path) });
    set.slab(path).rise(t - 0.12, { pitch: k * 2, spin: 0.8 });
    set.slab(path).addBadge(t + 0.2);
  });
  routes[0]!.push(
    { t: t0 + 1.0, p: set.world(new THREE.Vector3(-2, 2.6, 4)) },
    { t: t0 + 1.4, p: set.world(new THREE.Vector3(-8, 3.2, 1)) },
    { t: t1 + 0.1, p: set.world(new THREE.Vector3(-6, 3.6, -6)) },
  );
  routes[1]!.push(
    { t: t0 + 1.0, p: set.world(new THREE.Vector3(10, 2.6, 1)) },
    { t: t0 + 1.4, p: set.world(new THREE.Vector3(4, 3.2, -6)) },
    { t: t1 + 0.1, p: set.world(new THREE.Vector3(-1, 3.6, -7)) },
  );

  // The wiring, in a rapid chain once the boxes stand.
  const wires = ["web->search", "web->api", "api->pay", "api->db", "api->mail"];
  wires.forEach((k, i) => {
    set.tube(k).draw(t0 + 0.82 + i * 0.09, 0.22);
    set.tube(k).flow(t0 + 1.15 + i * 0.05, 2, 0.8);
  });

  /* The orbs */
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(5) });
  const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  routes.forEach((stops) => {
    const path = flight(stops);
    const orb = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), coreMat);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), depthWrite: false }));
    badge.scale.setScalar(0.55);
    badge.position.y = 0.55;
    orb.add(core, badge);
    scene.add(orb);
    live(orb, stops[0]!.t, t1 + 0.05);
    const trail = Array.from({ length: 18 }, (_, k) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 * (1 - k / 20), 10, 8), trailMat.clone());
      scene.add(m);
      live(m, stops[0]!.t, t1 + 0.05);
      return m;
    });
    stage().before((t) => {
      path(t, orb.position);
      trail.forEach((m, k) => {
        path(t - (k + 1) * 0.014, m.position);
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - k / trail.length) * 0.8;
      });
    });
  });
  cue(t0 - 0.1, "whoosh", { dur: 0.5, gain: 0.7 });

  const title = caption(film.overlay, "Agents draw, too.", { x: 124, y: 110, size: 150 });
  riseIn(title.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(title.words, t1 - 0.2);

  /* Camera: high, circling the canvas as it fills */
  cut(t0);
  const P = (x: number, y: number, z: number) => ({ x: A.x + x, y, z: A.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: A.x + x, ty: y, tz: A.z + z });
  master.set(rig, { ...P(-6, 9.5, 12), ...T(-12, 0, 0), fov: 44, roll: 0, shake: 0 }, t0);
  master.to(rig, { ...T(0.5, 0.3, 0.5), duration: 0.3, ease: "expo.out" }, t0);
  master.to(rig, { ...P(4.5, 8, 11.5), ...T(1.2, 0.3, 0.3), duration: t1 - t0 - 0.55, ease: "sine.inOut" }, t0 + 0.3);
  master.to(rig, { ...T(24, 1, 6), duration: 0.25, ease: "power3.in" }, t1 - 0.25);
  cue(t1 - 0.25, "whoosh", { dur: 0.35, gain: 0.8 });
}
