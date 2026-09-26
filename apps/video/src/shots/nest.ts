/**
 * Bars 8–9. "Zoom into anything.": a private network lands on the canvas as
 * a dark glass box; the camera dives at it, the walls dissolve as it passes
 * through, and inside, its own components light up. "Real schemas,
 * inside.": the orders database opens and its table unfolds above it as a
 * hologram, row by row.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { NEST_LAYOUT, NEST_SOURCE } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import { diagram3d } from "../three/diagram3d";
import { fx } from "../three/fx";
import { CODE_BG, INK, INK_2, INK_3, LINE_2, MONO, SANS, canvas, glyphMarkup, icon, rgba, texture } from "../three/paint";
import { stage } from "../three/stage";
import { BEAT, SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

/** The orders table, as the source's schema block has it. */
const ROWS: [string, string][] = [
  ["id", "uuid"],
  ["customer_id", "uuid"],
  ["total_cents", "int"],
  ["status", "text"],
  ["created_at", "timestamptz"],
];
const DESC = "Every order, with its line items and refunds.";

export function nestShot(film: Film): void {
  const { rig, live, cut } = stage();
  const t0 = at(SECTION.features + 1);
  const t1 = at(SECTION.features + 2);
  const t2 = at(SECTION.features + 3);
  const N = SET.nest;
  const set = diagram3d(NEST_SOURCE + NEST_LAYOUT, N, film.floor);
  live(set.root, t0 - 0.05, t2 + 0.05);
  const box = set.planes.get("vpc")!;
  const vpcColor = set.d.boxes.find((b) => b.path === "vpc")!.color;
  const inside = ["vpc.queue", "vpc.worker", "vpc.orders"];

  /* ------------------------------------------------ Zoom into anything */
  set.slab("web").rise(t0 - 0.12, { pitch: 0 });
  set.slab("api").rise(t0 - 0.02, { pitch: 3 });
  set.tube("web->api").draw(t0 + 0.12, 0.2, false);
  // The network slams down from above, closed.
  const g = box.group;
  g.visible = false;
  master.set(g, { visible: true }, t0 - 0.3);
  const land = t0 + BEAT * 0.5;
  master.fromTo(g.position, { y: 9 }, { y: 0, duration: 0.3, ease: "power2.in", immediateRender: false }, land - 0.3);
  master.fromTo(g.scale, { y: 0.6 }, { y: 1, duration: 0.5, ease: "elastic.out(1, 0.4)", immediateRender: false }, land);
  box.walls.value = 0.82;
  master.fromTo(box.glow, { value: 5 }, { value: 1.2, duration: 0.6, ease: "power2.out", immediateRender: false }, land);
  const c = set.world(g.position.clone().setY(0));
  fx().ring({ t0: land, x: c.x, z: c.z, radius: 16, dur: 0.8, width: 0.9, color: vpcColor, glow: 2 });
  fx().burst({ t0: land, x: c.x, y: 0.2, z: c.z, count: 160, speed: 9, up: 0.25, life: 0.9, color: vpcColor, size: 0.08 });
  film.floor.wave({ t0: land, x: c.x, z: c.z, speed: 16, strength: 1.8, decay: 0.6, color: vpcColor });
  cue(land, "impact", { gain: 0.45 });
  master.fromTo(rig, { shake: 0.12 }, { shake: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, land);
  set.tube("api->vpc.queue").draw(land + 0.1, 0.25);
  set.tube("web->api").flow(land, 2, 0.9);

  // The dive: the walls melt as the camera goes through them, and the
  // inside wakes up.
  const tDive = t0 + 0.72;
  master.to(box.walls, { value: 0.05, duration: 0.4, ease: "power2.in" }, tDive + 0.15);
  master.to(box.glow, { value: 3, duration: 0.2, ease: "power2.out" }, tDive + 0.4);
  inside.forEach((p, k) => set.slab(p).rise(tDive + 0.32 + k * 0.1, { pitch: 5 + k * 2, spin: 0.5 }));
  set.tube("vpc.queue->vpc.worker").draw(tDive + 0.55, 0.22);
  set.tube("vpc.worker->vpc.orders").draw(tDive + 0.68, 0.22);
  set.tube("api->vpc.queue").flow(tDive + 0.4, 2, 0.8);
  set.tube("vpc.queue->vpc.worker").flow(tDive + 0.8, 2, 0.8);
  set.tube("vpc.worker->vpc.orders").flow(tDive + 0.9, 2, 0.8);
  cue(tDive, "whoosh", { dur: 0.5 });

  const zoom = caption(film.overlay, "Zoom into anything.", { x: 124, y: 110, size: 150 });
  riseIn(zoom.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(zoom.words, t1 - 0.2);

  const W = (x: number, y: number, z: number) => ({ x: N.x + x, y, z: N.z + z });
  const aim = (x: number, y: number, z: number) => ({ tx: N.x + x, ty: y, tz: N.z + z });
  cut(t0);
  master.set(rig, { ...W(-9, 12, 19), ...aim(-12, 0.5, 0), fov: 42, roll: 0, shake: 0 }, t0);
  master.to(rig, { ...aim(1.5, 0.5, 0), duration: 0.3, ease: "expo.out" }, t0);
  master.to(rig, { ...W(-6, 10, 16), duration: tDive - t0 - 0.3, ease: "sine.out" }, t0 + 0.3);
  // Through the wall and in, low along the chain.
  master.to(rig, { ...W(-3.2, 1.8, 2.6), ...aim(9, 0.6, -0.4), fov: 50, duration: 0.62, ease: "power3.inOut" }, tDive);
  master.to(rig, { ...W(-1.5, 1.6, 2.2), duration: t1 - tDive - 0.62, ease: "none" }, tDive + 0.62);

  /* --------------------------------------------- Real schemas, inside. */
  const orders = set.slab("vpc.orders");
  const o = set.world(orders.group.position.clone());
  // Everything else steps back.
  for (const [p, s] of set.slabs) if (p !== "vpc.orders") master.to(s.glow, { value: 0.25, duration: 0.3 }, t1);
  master.fromTo(orders.glow, { value: 4 }, { value: 1.2, duration: 0.6, ease: "power2.out", immediateRender: false }, t1 + 0.05);
  fx().burst({ t0: t1 + 0.05, x: o.x, y: orders.h, z: o.z, count: 120, speed: 5, up: 0.85, life: 0.9, color: "#5eead4", size: 0.07 });
  cue(t1 + 0.05, "whoosh", { dur: 0.3, gain: 0.6 });

  const PW = 5.6;
  const RH = 0.46;
  const panelH = 1.25 + (ROWS.length + 1) * RH + 0.3;
  const holo = new THREE.Group();
  holo.position.set(o.x, orders.h + 0.25, o.z + 0.2);
  holo.rotation.y = 0.35;
  stage().scene.add(holo);
  live(holo, t1, t2 + 0.05);
  const PX = 180;
  const back = (() => {
    const { c: cv, ctx } = canvas(Math.round(PW * PX), Math.round(panelH * PX));
    ctx.beginPath();
    ctx.roundRect(4, 4, cv.width - 8, cv.height - 8, 0.18 * PX);
    ctx.fillStyle = rgba(CODE_BG, 0.9);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba("#5eead4", 0.55);
    ctx.stroke();
    const tile = 0.5 * PX;
    ctx.beginPath();
    ctx.roundRect(0.28 * PX, 0.22 * PX, tile, tile, 16);
    ctx.fillStyle = rgba(orders.spec.color, 0.22);
    ctx.fill();
    icon(ctx, glyphMarkup(orders.spec.glyph), 0.28 * PX + tile * 0.2, 0.22 * PX + tile * 0.2, tile * 0.6, orders.spec.color);
    ctx.fillStyle = INK;
    ctx.font = `600 ${Math.round(0.3 * PX)}px ${SANS}`;
    ctx.fillText("Orders DB", 0.95 * PX, 0.56 * PX);
    ctx.fillStyle = INK_2;
    ctx.font = `400 ${Math.round(0.2 * PX)}px ${SANS}`;
    ctx.fillText(DESC, 0.3 * PX, 1.02 * PX);
    return cv;
  })();
  const panelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, panelH),
    new THREE.MeshBasicMaterial({ map: texture(back), transparent: true, depthWrite: false }),
  );
  panelMesh.position.y = panelH / 2;
  holo.add(panelMesh);
  const tUnfold = t1 + 0.12;
  master.fromTo(panelMesh.scale, { x: 0.05, y: 0.02 }, { x: 1, y: 1, duration: 0.42, ease: "expo.out", immediateRender: false }, tUnfold);
  master.fromTo(panelMesh.position, { y: 0 }, { y: panelH / 2, duration: 0.42, ease: "expo.out", immediateRender: false }, tUnfold);
  // A light column from the database up into the panel.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.4, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#5eead4").multiplyScalar(0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = -0.1;
  holo.add(beam);
  master.fromTo(beam.scale, { y: 0.01 }, { y: panelH * 0.9, duration: 0.4, ease: "expo.out", immediateRender: false }, tUnfold);
  master.fromTo(beam.position, { y: 0 }, { y: (panelH * 0.9) / 2 - 0.1, duration: 0.4, ease: "expo.out", immediateRender: false }, tUnfold);
  master.to(beam.material, { opacity: 0, duration: 0.5 }, tUnfold + 0.5);

  const rowTex = (cells: [string, string], head: boolean) => {
    const { c: cv, ctx } = canvas(Math.round((PW - 0.6) * PX), Math.round(RH * PX));
    if (!head) {
      ctx.fillStyle = rgba("#ffffff", 0.035);
      ctx.fillRect(0, 2, cv.width, cv.height - 4);
    }
    ctx.font = `${head ? 500 : 500} ${Math.round(0.21 * PX)}px ${MONO}`;
    ctx.fillStyle = head ? INK_3 : INK;
    ctx.fillText(cells[0], 0.2 * PX, RH * PX * 0.64);
    ctx.fillStyle = head ? INK_3 : "#7dd3fc";
    ctx.fillText(cells[1], 2.75 * PX, RH * PX * 0.64);
    ctx.fillStyle = LINE_2;
    ctx.fillRect(0, cv.height - 2, cv.width, 2);
    return texture(cv);
  };
  const lines: [string, string][] = [["column", "type"], ...ROWS];
  lines.forEach((cells, k) => {
    const mat = new THREE.MeshBasicMaterial({ map: rowTex(cells, k === 0), transparent: true, depthWrite: false, color: 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.6, RH), mat);
    const y = panelH - 1.3 - k * RH - RH / 2;
    m.position.set(0, y, 0.02);
    holo.add(m);
    const tr = tUnfold + 0.3 + k * 0.1;
    master.fromTo(m.position, { x: -1.2 }, { x: 0, duration: 0.35, ease: "expo.out", immediateRender: false }, tr);
    master.fromTo(mat, { opacity: 0 }, { opacity: 1, duration: 0.15, immediateRender: false }, tr);
    // Each row lands with a flash.
    master.fromTo(mat.color, { r: 3, g: 3, b: 3 }, { r: 1, g: 1, b: 1, duration: 0.35, ease: "power2.out", immediateRender: false }, tr + 0.05);
    mat.opacity = 0;
    if (k > 0) cue(tr, "tick", { gain: 0.6, pitch: 5 + k * 2 });
  });

  const schemas = caption(film.overlay, "Real schemas, inside.", { x: 124, y: 110, size: 150 });
  riseIn(schemas.words, t1 + 0.04, { stagger: 0.06 });
  riseOut(schemas.words, t2 - 0.2);

  // Round to face the table as it unfolds (on the right of the frame, clear
  // of the caption), then a slow push.
  master.to(rig, { x: o.x - 3.2, y: 3.9, z: o.z + 9.8, tx: o.x - 2.4, ty: 3.4, tz: o.z, fov: 42, duration: 0.55, ease: "power3.inOut" }, t1 - 0.1);
  master.to(rig, { x: o.x - 2.2, y: 3.6, z: o.z + 8.8, tx: o.x - 1.9, ty: 3.35, duration: t2 - t1 - 0.75, ease: "sine.inOut" }, t1 + 0.45);
  // Out: whip.
  master.to(rig, { tx: o.x + 22, ty: 1, tz: o.z - 6, duration: 0.25, ease: "power3.in" }, t2 - 0.25);
  cue(t2 - 0.25, "whoosh", { dur: 0.35, gain: 0.8 });
}
