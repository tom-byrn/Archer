/**
 * Bars 3–6, the loop. The canvas lies on the floor and its file stands
 * behind it as a wall of code. Drag a component in and its line flies up
 * into the file; draw a connection and its line follows; let an agent type
 * two lines and they pour down onto the canvas as a component and a wire.
 * Then the camera circles the pair while beams tie every box to its line:
 * always in sync.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { layoutDiagram } from "../diagram";
import { LOOP_LAYOUT, LOOP_LINES, LOOP_SOURCE } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import {
  ADVANCE,
  LINE,
  bezier,
  chars,
  clamp01,
  codeChars,
  easeInOut,
  easeOut,
  rand,
  smooth,
  tumble,
  type CharState,
} from "../three/chars";
import { fx } from "../three/fx";
import { CODE_BG, INK_3, LINE_2, MONO, ACCENT, rgba } from "../three/paint";
import { cursorSprite, panel } from "../three/panel";
import { Slab, badgeTexture } from "../three/slab";
import { stage } from "../three/stage";
import { Tube } from "../three/tube";
import { BEAT, SECTION, at } from "../time";
import type { Film } from "./context";

const CELL = 40;
/** The loop's set: the canvas centred here, the file standing behind it. */
export const LOOP_AT = new THREE.Vector3(1.4, 0, -18);

/** The code wall: em size, its text block's top-left corner (set-relative) and its turn toward the camera. */
const EM = 0.4;
const WALL = new THREE.Vector3(4.4, 8.0, -6.6);
const WALL_YAW = -0.42;
const ROW = LINE * EM;
const COL = ADVANCE * EM;
const WALL_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), WALL_YAW);
/** Along a line of the wall, and out of it toward the viewer. */
const ACROSS = new THREE.Vector3(1, 0, 0).applyQuaternion(WALL_Q);
const OUT = new THREE.Vector3(0, 0, 1).applyQuaternion(WALL_Q);

/** A point on the wall (set-relative): column and row of the text block, and how far out of it. */
function onWall(col: number, row: number, out = 0): THREE.Vector3 {
  return WALL.clone().addScaledVector(ACROSS, col * COL).addScaledVector(OUT, out).setY(WALL.y - row * ROW);
}

export function loopShot(film: Film): void {
  const { scene, rig, live } = stage();
  const t0 = at(SECTION.loop);
  const tEnd = at(SECTION.features);
  const bar = (n: number, beat = 0) => at(SECTION.loop + n, beat);

  const root = new THREE.Group();
  root.position.copy(LOOP_AT);
  scene.add(root);
  live(root, t0 - 0.6, tEnd + 0.05);
  const world = (v: THREE.Vector3) => v.clone().add(LOOP_AT);

  /* ------------------------------------------------------------ Canvas */
  const d = layoutDiagram(LOOP_SOURCE + LOOP_LAYOUT);
  const ox = -(d.bounds.x + d.bounds.w / 2) / CELL;
  const oz = -(d.bounds.y + d.bounds.h / 2) / CELL + 1.2;
  const slabs = new Map<string, Slab>();
  for (const b of d.boxes) {
    const s = new Slab({ name: b.name, type: b.type, color: b.color, glyph: b.glyph, w: b.w / CELL, d: b.h / CELL }, film.floor);
    root.add(s.group);
    s.at(b.x / CELL + ox + b.w / CELL / 2, b.y / CELL + oz + b.h / CELL / 2);
    slabs.set(b.path, s);
  }
  const tubes = new Map<string, Tube>();
  for (const e of d.edges) {
    const pts = e.points.map((p) => new THREE.Vector3(p.x / CELL + ox, 0.17, p.y / CELL + oz));
    const tube = new Tube(pts).label(e.chip?.type, e.chip?.label);
    tube.drawn.value = 0;
    root.add(tube.group);
    tubes.set(e.key, tube);
  }
  const slab = (p: string) => slabs.get(p)!;
  const tube = (k: string) => tubes.get(k)!;
  /** A random point on a slab's top face, in the world. */
  const onFace = (p: string, i: number) => {
    const s = slab(p);
    return world(
      new THREE.Vector3(
        s.group.position.x + (rand(i, 1) - 0.5) * s.spec.w * 0.85,
        s.h + 0.05,
        s.group.position.z + (rand(i, 2) - 0.5) * s.spec.d * 0.8,
      ),
    );
  };
  const onTube = (k: string, i: number) => world(tube(k).curve.getPointAt(0.08 + rand(i, 3) * 0.84));

  // What is already there: three boxes and two wires, back on the beat.
  ["web", "api", "db"].forEach((p, k) => slab(p).rise(t0 - 0.22 + k * 0.09, { pitch: k * 2, spin: 0.6 }));
  tube("web->api").draw(t0 + 0.12, 0.22, false);
  tube("api->db").draw(t0 + 0.22, 0.22, false);
  tube("web->api").flow(t0 + 0.4, 2, 1);
  tube("api->db").flow(t0 + 0.5, 2, 1);

  /* ----------------------------------------------------------- The file */
  const tDrop = bar(0, 2); // the cache lands
  const tConn = bar(1, 1); // the api → cache wire starts
  const tType1 = bar(2, 0) + 0.08; // the agent types the jobs component…
  const tType2 = bar(2, 1) + 0.02; // …and its connection
  const KEY = 0.014;
  const lineOf = (text: string) => LOOP_LINES.indexOf(text);
  const L = {
    cache: lineOf(`component cache "Cache" @redis`),
    jobs: lineOf(`component jobs "Jobs" @aws.sqs`),
    reads: lineOf(`api -> cache @reads`),
    queue: lineOf(`api -> jobs @queue : "enqueue"`),
  };
  /** When each added line opens its row in the file. */
  const opens: [number, number][] = [
    [L.cache, tDrop - 0.05],
    [L.reads, tConn + 0.3],
    [L.jobs, tType1 - 0.12],
    [L.queue, tType2 - 0.1],
  ];
  const row = (line: number, t: number) => {
    let r = line;
    for (const [l, t1] of opens) if (l < line) r -= 1 - smooth(clamp01((t - t1) / 0.22));
    return r;
  };
  const wallOrigin = world(WALL);
  const slotAt = (line: number, col: number, t: number, out: THREE.Vector3) =>
    out
      .copy(wallOrigin)
      .addScaledVector(ACROSS, (col + 0.5) * COL)
      .setY(wallOrigin.y - (row(line, t) + 0.5) * ROW);

  // The pane behind the text.
  const cols = Math.max(...LOOP_LINES.map((l) => l.length));
  const paneW = cols * COL + 1.3;
  const paneH = LOOP_LINES.length * ROW + 1.35;
  const pane = panel({
    w: paneW,
    h: paneH,
    px: 90,
    draw(ctx, W, H, px) {
      ctx.beginPath();
      ctx.roundRect(4, 4, W - 8, H - 8, 0.22 * px);
      ctx.fillStyle = rgba(CODE_BG, 0.88);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE_2;
      ctx.stroke();
      ctx.fillStyle = rgba("#ffffff", 0.04);
      ctx.fillRect(6, 6, W - 12, 0.62 * px);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(0.42 * px, 0.34 * px, 0.08 * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `500 ${Math.round(0.28 * px)}px ${MONO}`;
      ctx.fillStyle = INK_3;
      ctx.fillText("acme.arch", 0.65 * px, 0.44 * px);
    },
  });
  pane.position
    .copy(WALL)
    .addScaledVector(ACROSS, paneW / 2 - 0.65)
    .addScaledVector(OUT, -0.05)
    .setY(WALL.y + 0.85 - paneH / 2);
  pane.quaternion.copy(WALL_Q);
  root.add(pane);
  live(pane, t0 - 0.05, tEnd + 0.05);
  master.fromTo(pane.scale, { x: 0.6, y: 0.02 }, { x: 1, y: 1, duration: 0.45, ease: "expo.out", immediateRender: false }, t0 - 0.05);

  const list = codeChars(LOOP_SOURCE);
  /** Per line: when its characters get to the file, and how. */
  type Arrival = { kind: "there"; t: number } | { kind: "fly"; t: number; from: (i: number) => THREE.Vector3 } | { kind: "type"; t: number };
  const arrival = (line: number): Arrival => {
    if (line === L.cache) return { kind: "fly", t: tDrop + 0.04, from: (i) => onFace("cache", i) };
    if (line === L.reads) return { kind: "fly", t: tConn + 0.36, from: (i) => onTube("api->cache", i) };
    if (line === L.jobs) return { kind: "type", t: tType1 };
    if (line === L.queue) return { kind: "type", t: tType2 };
    return { kind: "there", t: t0 - 0.02 + line * 0.025 };
  };
  const arrivals = LOOP_LINES.map((_, l) => arrival(l));
  const startCol = (c: { line: number }) => list.findIndex((x) => x.line === c.line);
  const firstOfLine = list.map((c) => startCol(c));
  const from = list.map((c, i) => {
    const a = arrivals[c.line]!;
    return a.kind === "fly" ? a.from(i) : null;
  });
  const leave = list.map((c, i) => arrivals[c.line]!.t + rand(i, 10) * 0.16);
  const FLY = 0.5;
  /** When character i is in its place, glowing its arrival flash. */
  const landed = list.map((c, i) => {
    const a = arrivals[c.line]!;
    if (a.kind === "fly") return leave[i]! + FLY;
    if (a.kind === "type") return a.t + (i - firstOfLine[i]!) * KEY;
    return a.t + c.col * 0.008;
  });
  const q0 = new THREE.Quaternion();
  const ident = WALL_Q;
  const slot = new THREE.Vector3();
  const ctrl = new THREE.Vector3();

  /** Sync (bar 6): when each line's beam arrives and it flashes. */
  const syncFlash: number[] = LOOP_LINES.map(() => Infinity);

  chars().add({
    chars: list,
    at(i, t, o: CharState) {
      const c = list[i]!;
      const a = arrivals[c.line]!;
      slotAt(c.line, c.col, t, slot);
      if (a.kind === "fly") {
        if (t < leave[i]!) return false;
        const u = clamp01((t - leave[i]!) / FLY);
        if (u < 1) {
          const e = easeInOut(u);
          ctrl.copy(from[i]!).lerp(slot, 0.5);
          ctrl.y += 2.4 + rand(i, 5) * 2;
          ctrl.x += (rand(i, 4) - 0.5) * 3;
          bezier(from[i]!, ctrl, slot, e, o.p);
          tumble(i, Math.PI * 2, q0);
          o.q.slerpQuaternions(q0, ident, e);
          o.s = EM * (0.4 + 0.6 * e);
          o.glow = 2.6;
          return true;
        }
      } else if (t < landed[i]!) return false;
      o.p.copy(slot);
      o.q.copy(WALL_Q);
      const since = t - landed[i]!;
      const pop = a.kind === "there" ? clamp01(since / 0.16) : 1;
      o.s = EM * (a.kind === "type" ? 1 + 0.5 * Math.exp(-since / 0.05) : pop);
      const synced = t - syncFlash[c.line]!;
      o.glow = 1.15 + 2.2 * Math.exp(-since / 0.18) + (synced >= 0 ? 2.4 * Math.exp(-synced / 0.2) : 0);
      return true;
    },
  });
  // Sounds: the file writing itself, and each flight landing.
  cue(tDrop + 0.5, "tick", { gain: 0.7, pitch: 7 });
  cue(tConn + 0.86, "tick", { gain: 0.7, pitch: 9 });
  for (const [t, n] of [
    [tType1, LOOP_LINES[L.jobs]!.length],
    [tType2, LOOP_LINES[L.queue]!.length],
  ] as const)
    for (let k = 0; k < n; k += 3) cue(t + k * KEY, "key", { gain: 0.5 });

  /* ----------------------------------------------- Bar 3: drag it in */
  const drag = caption(film.overlay, "Drag it in.", { x: 124, y: 110, size: 150 });
  riseIn(drag.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(drag.words, bar(1) - 0.2);

  const cache = slab("cache");
  const home = cache.group.position.clone();
  const hand = cursorSprite(0.95);
  root.add(hand);
  live(hand, t0 + 0.2, tDrop + 0.5);
  const carry = { u: 0, lift: 1 };
  const path = [new THREE.Vector3(home.x + 6, 3.2, home.z + 11), new THREE.Vector3(home.x + 3, 3.6, home.z + 3), home.clone().setY(1.1)];
  cache.hideUntil(t0 + 0.2);
  master.fromTo(carry, { u: 0 }, { u: 1, duration: tDrop - 0.14 - (t0 + 0.2), ease: "power2.out", immediateRender: false }, t0 + 0.2);
  master.fromTo(carry, { lift: 1 }, { lift: 0, duration: 0.14, ease: "power2.in", immediateRender: false }, tDrop - 0.14);
  const tilt = new THREE.Euler();
  stage().before((t) => {
    if (t < t0 + 0.2 || t > tDrop + 0.6) return;
    const g = cache.group;
    if (t < tDrop) {
      bezier(path[0]!, path[1]!, path[2]!, carry.u, g.position);
      g.position.y = THREE.MathUtils.lerp(0, g.position.y, carry.lift);
      tilt.set(0.25 * carry.lift * (1 - carry.u) + 0.08 * carry.lift, 0.5 * (1 - carry.u), -0.18 * carry.lift);
      g.rotation.copy(tilt);
    } else {
      g.position.copy(home);
      g.rotation.set(0, 0, 0);
    }
    // The pointer holds the box by its top-right corner, then lets go.
    const let_go = clamp01((t - tDrop) / 0.45);
    hand.position.set(g.position.x + 1.1 + let_go * 1.4, g.position.y + cache.h + 0.35 + let_go * 1.6, g.position.z - 0.2);
    hand.material.opacity = 1 - let_go;
  });
  cache.flash(tDrop, true);
  cue(tDrop, "pop", { pitch: 5 });
  cue(t0 + 0.2, "whoosh", { dur: 0.5, gain: 0.5 });
  master.fromTo(rig, { shake: 0.06 }, { shake: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, tDrop);

  /* ------------------------------------------------ Bar 4: connect it */
  const connect = caption(film.overlay, "Connect it.", { x: 124, y: 110, size: 150 });
  riseIn(connect.words, bar(1) + 0.02, { stagger: 0.06 });
  riseOut(connect.words, bar(2) - 0.2);
  const wire = tube("api->cache");
  wire.draw(tConn, 0.34);
  wire.flow(tConn + 0.5, 2, 0.9);
  const pen = cursorSprite(0.8);
  root.add(pen);
  live(pen, tConn - 0.3, tConn + 0.75);
  stage().before((t) => {
    if (t < tConn - 0.3 || t > tConn + 0.75) return;
    const p = clamp01(wire.drawn.value);
    const at = wire.curve.getPointAt(Math.max(0.001, p));
    const intro = clamp01((t - (tConn - 0.3)) / 0.3);
    const out = clamp01((t - (tConn + 0.4)) / 0.35);
    pen.position.set(at.x + 0.05 + out * 1.2, 0.5 + (1 - easeOut(intro)) * 1.4 + out * 1.4, at.z + 0.05);
    pen.material.opacity = intro * (1 - out);
  });

  /* ---------------------------------------- Bar 5: let your agent write */
  const agent = caption(film.overlay, "Or let your agent\nwrite it.", { x: 124, y: 104, size: 120, lineHeight: 1.02 });
  riseIn(agent.words, bar(2) + 0.02, { stagger: 0.05 });
  riseOut(agent.words, bar(3) - 0.2);

  // The agent's caret and avatar ride along the line being typed.
  const caret = new THREE.Mesh(
    new THREE.PlaneGeometry(COL * 0.9, ROW * 0.78),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(2.2), transparent: true }),
  );
  caret.quaternion.copy(WALL_Q);
  scene.add(caret);
  const avatar = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), depthWrite: false }));
  avatar.scale.setScalar(0.5);
  scene.add(avatar);
  live(caret, tType1 - 0.1, tType2 + 0.8);
  live(avatar, tType1 - 0.1, tType2 + 0.8);
  stage().before((t) => {
    const second = t >= tType2 - 0.02;
    const line = second ? L.queue : L.jobs;
    const n = LOOP_LINES[line]!.length;
    const k = Math.min(n, Math.max(0, (t - (second ? tType2 : tType1)) / KEY));
    slotAt(line, k, t, slot);
    caret.position.copy(slot).addScaledVector(ACROSS, -COL * 0.1).addScaledVector(OUT, 0.02);
    (caret.material as THREE.MeshBasicMaterial).opacity = k >= n ? (Math.floor(t * 4) % 2 ? 0.2 : 1) : 1;
    avatar.position.copy(wallOrigin).addScaledVector(ACROSS, -0.55).addScaledVector(OUT, 0.05).setY(slot.y);
  });

  // Then the two lines pour down onto the canvas, as a box and a wire.
  const pour = (line: number, tFrom: number, target: (i: number) => THREE.Vector3) => {
    const idx = list.map((c, i) => (c.line === line ? i : -1)).filter((i) => i >= 0);
    const sub = idx.map((i) => list[i]!);
    const go = sub.map((_, k) => tFrom + rand(k, 31) * 0.14);
    const land = sub.map((_, k) => target(idx[k]!));
    const start = new THREE.Vector3();
    chars().add({
      chars: sub,
      at(k, t, o) {
        const u = (t - go[k]!) / 0.42;
        if (u < 0 || u > 1) return false;
        const e = easeInOut(u);
        slotAt(line, sub[k]!.col, go[k]!, start);
        ctrl.copy(start).lerp(land[k]!, 0.5);
        ctrl.y += 1.5;
        ctrl.z += 2.5;
        bezier(start, ctrl, land[k]!, e, o.p);
        tumble(k, Math.PI * 1.6 * e, o.q);
        o.s = EM * (1 - 0.6 * e);
        o.glow = 2.8;
        o.a = 1 - smooth(clamp01((u - 0.75) / 0.25));
        return true;
      },
    });
  };
  const tPour1 = tType2 - 0.1;
  const tJobs = bar(2, 2) - 0.2; // lands on beat 3
  pour(L.jobs, tPour1, (i) => onFace("jobs", i));
  slab("jobs").rise(tJobs, { pitch: 7 });
  slab("jobs").addBadge(tJobs + 0.3);
  const tPour2 = tType2 + LOOP_LINES[L.queue]!.length * KEY + 0.04;
  pour(L.queue, tPour2, (i) => onTube("api->jobs", i));
  const tWire = tPour2 + 0.38;
  tube("api->jobs").draw(tWire, 0.3);
  tube("api->jobs").flow(tWire + 0.35, 2, 0.9);
  slab("api").addBadge(tWire + 0.3);
  cue(tPour1, "whoosh", { dur: 0.5, gain: 0.5 });

  /* ------------------------------------------- Bar 6: always in sync */
  const tSync = bar(3);
  const sync = caption(film.overlay, "Always in sync.", { x: 124, y: 110, size: 150 });
  riseIn(sync.words, tSync + 0.02, { stagger: 0.06 });
  riseOut(sync.words, tEnd - 0.22, { dur: 0.22 });
  // Beams from each box and wire up to its line, in pairs on the beats.
  const links: { line: number; from: () => THREE.Vector3; box?: Slab }[] = [
    ...["web", "api", "db", "cache", "jobs"].map((p) => ({
      line: lineOf(LOOP_LINES.find((l) => l.startsWith(`component ${p} `))!),
      from: () => world(slab(p).group.position.clone().setY(slab(p).h + 0.1)),
      box: slab(p),
    })),
    ...["web->api", "api->db", "api->cache", "api->jobs"].map((k) => {
      const [s, tg] = k.split("->");
      return {
        line: lineOf(LOOP_LINES.find((l) => l.startsWith(`${s} -> ${tg} `))!),
        from: () => world(tube(k).curve.getPointAt(0.5).setY(0.3)),
      };
    }),
  ];
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(ACCENT).multiplyScalar(2.4),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(4) });
  const sparkGeo = new THREE.SphereGeometry(0.07, 10, 8);
  links.forEach((link, k) => {
    const t1 = tSync + 0.06 + (k % 5) * BEAT * 0.5 + Math.floor(k / 5) * BEAT * 0.25;
    const a = link.from();
    const b = new THREE.Vector3();
    slotAt(link.line, -0.8, tEnd, b);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 1.2, 1.2));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 40, 0.022, 6, false);
    const mesh = new THREE.Mesh(geo, beamMat);
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    scene.add(mesh, spark);
    live(mesh, t1, tEnd + 0.05);
    live(spark, t1, tEnd + 0.05);
    const drawn = { value: 0 };
    master.fromTo(drawn, { value: 0 }, { value: 1, duration: 0.24, ease: "power2.out", immediateRender: false }, t1);
    stage().before((t) => {
      geo.setDrawRange(0, Math.floor(drawn.value * 40) * 6 * 6);
      // A pulse riding the beam, up and back down.
      const u = ((t - t1) / 0.9) % 2;
      spark.position.copy(curve.getPointAt(Math.max(0, u < 1 ? u : 2 - u) * drawn.value));
    });
    syncFlash[link.line] = t1 + 0.24;
    if (link.box)
      master.fromTo(link.box.glow, { value: 3.5 }, { value: 0.55, duration: 0.5, ease: "power2.out", immediateRender: false }, t1);
    cue(t1, "tick", { gain: 0.5, pitch: [0, 3, 5, 7, 10, 12, 15, 17, 19][k] });
  });
  fx().dust({ t0: t0, t1: tEnd, center: world(new THREE.Vector3(0, 4, -1)), size: new THREE.Vector3(26, 9, 18), count: 260, glow: 1.1, dot: 0.04 });

  /* ------------------------------------------------------------ Camera */
  // In over the title: up and over the word, then down onto the canvas.
  const c = LOOP_AT;
  const cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => ({
    x: c.x + x,
    y,
    z: c.z + z,
    tx: c.x + tx,
    ty,
    tz: c.z + tz,
  });
  master.to(rig, { ...cam(-7, 11, 17, 1.5, 2.2, -1.5), ty: 2.2, fov: 40, duration: 0.62, ease: "power3.inOut" }, t0 - 0.42);
  // Bar 3: in with the box as it is dragged over, then up toward the file.
  master.to(rig, { ...cam(-7.5, 6.8, 12, 2.6, 2.1, 0), ty: 2.1, duration: tDrop - t0 - 0.2, ease: "sine.inOut" }, t0 + 0.2);
  master.to(rig, { ...cam(-6.5, 7.6, 11, 3.6, 3.4, -2.2), ty: 3.4, duration: bar(1) - tDrop, ease: "sine.inOut" }, tDrop);
  // Bar 4: low and close on api and cache.
  master.to(rig, { ...cam(9.5, 4.2, 12, 3.4, 2.0, -0.5), ty: 2.0, fov: 38, duration: 0.55, ease: "power3.inOut" }, bar(1) - 0.2);
  master.to(rig, { x: c.x + 7.5, y: 3.9, z: c.z + 11, duration: bar(2) - bar(1) - 0.3, ease: "none" }, bar(1) + 0.35);
  // Bar 5: along the file as the agent types (the lines run away to the
  // right), then back with the pour.
  const eye = onWall(0, 7, 5.6).addScaledVector(ACROSS, -4.6);
  const look = onWall(12, 8.5);
  master.to(
    rig,
    { x: c.x + eye.x, y: eye.y + 0.6, z: c.z + eye.z, tx: c.x + look.x, ty: look.y, tz: c.z + look.z, fov: 44, duration: 0.5, ease: "power3.inOut" },
    bar(2) - 0.2,
  );
  master.to(rig, { ...cam(-7, 9, 15.5, 2.2, 1.9, -0.5), ty: 1.9, fov: 40, duration: 0.6, ease: "power2.inOut" }, tPour1 + 0.05);
  // Bar 6: wide, circling the pair.
  master.to(rig, { ...cam(15, 8, 13, 3, 3.2, -1.5), ty: 3.2, duration: tEnd - tSync - 0.15, ease: "sine.inOut" }, tSync - 0.1);
  // Out: a whip to the right.
  master.to(rig, { tx: c.x + 30, tz: c.z + 10, ty: 2, duration: 0.25, ease: "power3.in" }, tEnd - 0.25);
  cue(tEnd - 0.25, "whoosh", { dur: 0.35, gain: 0.8 });
}
