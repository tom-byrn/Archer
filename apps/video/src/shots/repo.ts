/**
 * Bar 12, "Lives in your repo.": the history of a branch as light. The
 * main line runs out across the canvas, an agent's branch forks off, its
 * commits land with the .arch file's diff riding above them, and it merges
 * back in a flash: the file on the branch is the truth, and it's synced.
 */
import * as THREE from "three";
import gitBranch from "@phosphor-icons/core/assets/bold/git-branch-bold.svg";
import fileCode from "@phosphor-icons/core/assets/bold/file-code-bold.svg";
import checkCircle from "@phosphor-icons/core/assets/fill/check-circle-fill.svg";
import { cue } from "../cues";
import { master } from "../engine";
import { caption, riseIn, riseOut } from "../text";
import { fx } from "../three/fx";
import { ACCENT, CODE_BG, INK, INK_2, LINE_2, MONO, SANS, SURFACE, canvas, icon, rgba, texture } from "../three/paint";
import { stage } from "../three/stage";
import { Tube } from "../three/tube";
import { SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

const Y = 0.7;

/** A flat label in world units `h` tall: optional icon, text. */
function label(text: string, o: { h: number; mono?: boolean; color?: string; glyph?: string; ground?: string; border?: string }): THREE.Mesh {
  const S = 120;
  const measure = canvas(10, 10).ctx;
  measure.font = `${o.mono ? 500 : 600} ${0.5 * S}px ${o.mono ? MONO : SANS}`;
  const iconW = o.glyph ? 0.75 * S : 0;
  const W = Math.ceil(measure.measureText(text).width + iconW + 0.6 * S);
  const H = S;
  const { c, ctx } = canvas(W, H);
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 0.28 * S);
  ctx.fillStyle = o.ground ?? SURFACE;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = o.border ?? LINE_2;
  ctx.stroke();
  if (o.glyph) icon(ctx, o.glyph, 0.26 * S, 0.22 * S, 0.56 * S, o.color ?? INK_2);
  ctx.font = measure.font;
  ctx.fillStyle = o.color ?? INK;
  ctx.fillText(text, 0.3 * S + iconW, 0.66 * S);
  const m = new THREE.Mesh(new THREE.PlaneGeometry((W / H) * o.h, o.h), new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }));
  return m;
}

/** The .arch file's diff on a card. */
function diffCard(lines: string[]): THREE.Mesh {
  const PX = 130;
  const w = 5.2;
  const h = 0.8 + lines.length * 0.42;
  const { c, ctx } = canvas(Math.round(w * PX), Math.round(h * PX));
  ctx.beginPath();
  ctx.roundRect(4, 4, c.width - 8, c.height - 8, 0.16 * PX);
  ctx.fillStyle = rgba(CODE_BG, 0.95);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = LINE_2;
  ctx.stroke();
  icon(ctx, fileCode, 0.22 * PX, 0.14 * PX, 0.34 * PX, INK_2);
  ctx.font = `500 ${Math.round(0.22 * PX)}px ${MONO}`;
  ctx.fillStyle = INK_2;
  ctx.fillText("architecture.arch", 0.66 * PX, 0.38 * PX);
  ctx.fillStyle = LINE_2;
  ctx.fillRect(0, 0.56 * PX, c.width, 2);
  lines.forEach((l, i) => {
    const y = (0.62 + i * 0.42) * PX;
    ctx.fillStyle = rgba(ACCENT, 0.12);
    ctx.fillRect(4, y, c.width - 8, 0.4 * PX);
    ctx.fillStyle = ACCENT;
    ctx.font = `500 ${Math.round(0.21 * PX)}px ${MONO}`;
    ctx.fillText(l, 0.2 * PX, y + 0.28 * PX);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }));
}

export function repoShot(film: Film): void {
  const { scene, rig, live, cut } = stage();
  const t0 = at(SECTION.features + 5);
  const t1 = at(SECTION.features + 6);
  const R = SET.repo;
  const root = new THREE.Group();
  root.position.copy(R);
  scene.add(root);
  live(root, t0 - 0.05, t1 + 0.05);

  const V = (x: number, z: number) => new THREE.Vector3(x, Y, z);
  const main = new Tube([V(-16, 0), V(16, 0)], { radius: 0.06, head: false, color: 0xa5a19a, glow: 0.8 });
  const branch = new Tube([V(-7, 0), V(-5, 4.5), V(1, 4.5), V(3, 0)], { radius: 0.06, head: false, color: ACCENT, glow: 1.2, corner: 1.4 });
  root.add(main.group, branch.group);
  const tMain = t0 - 0.05;
  main.draw(tMain, 1.25, false);
  const tFork = t0 + 0.3;
  branch.draw(tFork, 0.75, false);
  cue(tFork, "draw");

  // Commits: pop as the line reaches them.
  const commitGeo = new THREE.SphereGeometry(0.32, 24, 16);
  const ringGeo = new THREE.TorusGeometry(0.46, 0.035, 8, 40);
  const commit = (at: THREE.Vector3, t: number, color: THREE.ColorRepresentation, k: number) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.85) });
    g.add(new THREE.Mesh(commitGeo, mat));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4) }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.position.copy(at);
    root.add(g);
    live(g, t, t1 + 0.05);
    master.fromTo(g.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: "back.out(3)", immediateRender: false }, t);
    master.fromTo(mat.color, { r: 4, g: 4, b: 4 }, { r: mat.color.r, g: mat.color.g, b: mat.color.b, duration: 0.4, ease: "power2.out", immediateRender: false }, t);
    const w = at.clone().add(R);
    fx().burst({ t0: t, x: w.x, y: w.y, z: w.z, count: 40, speed: 4, up: 0.3, life: 0.6, color, size: 0.06 });
    cue(t, "tick", { gain: 0.6, pitch: k * 2 });
    return g;
  };
  [-13, -10].forEach((x, k) => commit(V(x, 0), tMain + ((x + 16) / 32) * 1.25, 0xecebe7, k));
  // The agent's branch: two commits, each with the file's diff above it.
  const diffs = [[`+ component jobs "Jobs" @aws.sqs`], [`+ api -> jobs @queue : "enqueue"`]];
  [-2.2, 0.8].forEach((x, k) => {
    const t = tFork + 0.3 + k * 0.2;
    commit(V(x, 4.5), t, ACCENT, 3 + k);
    const card = diffCard(diffs[k]!);
    card.position.set(x, Y + 1.7 + k * 0.1, 4.5);
    root.add(card);
    live(card, t, t1 + 0.05);
    master.fromTo(card.position, { y: Y }, { y: Y + 1.7, duration: 0.45, ease: "expo.out", immediateRender: false }, t + 0.02);
    master.fromTo(card.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.4, ease: "back.out(2)", immediateRender: false }, t + 0.02);
  });
  // The merge.
  const tMerge = tFork + 0.75;
  const merge = commit(V(3, 0), tMerge, ACCENT, 6);
  merge.scale.setScalar(1.3);
  const mw = V(3, 0).add(R);
  fx().ring({ t0: tMerge, x: mw.x, z: mw.z, radius: 9, dur: 0.7, width: 0.6, color: ACCENT, glow: 2.4 });
  fx().burst({ t0: tMerge, x: mw.x, y: Y, z: mw.z, count: 150, speed: 8, up: 0.4, life: 0.9, color: ACCENT, size: 0.07 });
  film.floor.wave({ t0: tMerge, x: mw.x, z: mw.z, speed: 15, strength: 1.6, decay: 0.6 });
  cue(tMerge, "success");
  master.fromTo(rig, { shake: 0.08 }, { shake: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, tMerge);
  [-7, 7, 11].forEach((x, k) => commit(V(x, 0), x < 3 ? tMain + ((x + 16) / 32) * 1.25 : tMerge + 0.12 + k * 0.08, 0xecebe7, 7 + k));

  const synced = label("Synced", { h: 0.62, glyph: checkCircle, color: ACCENT, border: rgba(ACCENT, 0.5) });
  synced.position.set(3, Y + 1.25, 0);
  root.add(synced);
  live(synced, tMerge + 0.05, t1 + 0.05);
  master.fromTo(synced.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.4, ease: "back.out(3)", immediateRender: false }, tMerge + 0.05);
  const mainTag = label("main", { h: 0.5, mono: true, glyph: gitBranch });
  mainTag.position.set(-13, Y + 0.95, 0);
  root.add(mainTag);
  const branchTag = label("agent/add-jobs", { h: 0.5, mono: true, glyph: gitBranch, color: ACCENT, border: rgba(ACCENT, 0.45) });
  branchTag.position.set(-4.2, Y + 0.95, 4.5);
  root.add(branchTag);
  live(branchTag, tFork + 0.15, t1 + 0.05);

  const title = caption(film.overlay, "Lives in your repo.", { x: 124, y: 110, size: 150 });
  riseIn(title.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(title.words, t1 - 0.2);

  /* Camera: along the history, low, then up as it merges */
  cut(t0);
  const P = (x: number, y: number, z: number) => ({ x: R.x + x, y, z: R.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: R.x + x, ty: y, tz: R.z + z });
  master.set(rig, { ...P(-9, 3.6, 8.5), ...T(-18, 1, 2), fov: 44, roll: -4, shake: 0 }, t0);
  master.to(rig, { ...T(-5, 1.3, 2), roll: 0, duration: 0.3, ease: "expo.out" }, t0);
  master.to(rig, { ...P(-0.5, 5, 9.5), ...T(1.2, 1.4, 2.2), duration: t1 - t0 - 0.55, ease: "sine.inOut" }, t0 + 0.3);
  master.to(rig, { ...T(24, 1, 8), duration: 0.25, ease: "power3.in" }, t1 - 0.25);
  cue(t1 - 0.25, "whoosh", { dur: 0.35, gain: 0.8 });
}
