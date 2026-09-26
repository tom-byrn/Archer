/**
 * A whole Archer document as a 3D set: components as slabs, planes (a
 * component with children, drawn as a plane) as glass boxes with glowing
 * edges and their title, connections as tubes on the app's routes. Built
 * from real source through the same layout and router as the canvas.
 */
import * as THREE from "three";
import { layoutDiagram, type Box, type Diagram } from "../diagram";
import type { Floor } from "./floor";
import { INK, INK_3, MONO, SANS, canvas, fit, glyphMarkup, icon, rgba, texture } from "./paint";
import { Slab } from "./slab";
import { stage } from "./stage";
import { Tube } from "./tube";

const CELL = 40;

/** A plane as a glass box: floor plate, walls you can fade, lit edges, a title. */
export class PlaneBox {
  readonly group = new THREE.Group();
  /** Wall opacity; tween it (0 opens the box). */
  readonly walls = { value: 0.55 };
  /** Edge brightness; tween it. */
  readonly glow = { value: 1.1 };
  readonly w: number;
  readonly d: number;
  readonly height: number;

  constructor(box: Box, height = 2.2) {
    const w = (this.w = box.w / CELL);
    const d = (this.d = box.h / CELL);
    this.height = height;
    const color = new THREE.Color(box.color);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, d),
      new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.85 }),
    );
    plate.position.y = 0.02;
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x07080a,
      roughness: 0.45,
      metalness: 0,
      specularIntensity: 0.25,
      envMapIntensity: 0.3,
      transparent: true,
      opacity: this.walls.value,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), glass);
    shell.position.y = height / 2;
    shell.renderOrder = 2;

    const edgeMat = new THREE.MeshBasicMaterial({ color: color.clone() });
    const edges = new THREE.Group();
    const r = 0.028;
    const bar = (len: number) => new THREE.CylinderGeometry(r, r, len, 6);
    for (const y of [0.03, height])
      for (const z of [-d / 2, d / 2]) {
        const m = new THREE.Mesh(bar(w), edgeMat);
        m.rotation.z = Math.PI / 2;
        m.position.set(0, y, z);
        edges.add(m);
      }
    for (const y of [0.03, height])
      for (const x of [-w / 2, w / 2]) {
        const m = new THREE.Mesh(bar(d), edgeMat);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, y, 0);
        edges.add(m);
      }
    for (const x of [-w / 2, w / 2])
      for (const z of [-d / 2, d / 2]) {
        const m = new THREE.Mesh(bar(height), edgeMat);
        m.position.set(x, height / 2, z);
        edges.add(m);
      }

    // The plane's header, as the canvas draws it: glyph tile, name, type.
    const PX = 200;
    const hw = Math.min(w * 0.6, 6.5);
    const hh = 0.62;
    const { c, ctx } = canvas(Math.round(hw * PX), Math.round(hh * PX));
    const tile = hh * PX * 0.78;
    const ty = (hh * PX - tile) / 2;
    ctx.beginPath();
    ctx.roundRect(4, ty, tile, tile, 18);
    ctx.fillStyle = rgba(box.color, 0.2);
    ctx.fill();
    icon(ctx, glyphMarkup(box.glyph), 4 + tile * 0.2, ty + tile * 0.2, tile * 0.6, box.color);
    ctx.fillStyle = INK;
    ctx.font = `600 ${Math.round(hh * PX * 0.46)}px ${SANS}`;
    const x0 = tile + 30;
    ctx.fillText(fit(ctx, box.name, hw * PX * 0.62), x0, hh * PX * 0.66);
    const nameW = ctx.measureText(box.name).width;
    ctx.fillStyle = INK_3;
    ctx.font = `400 ${Math.round(hh * PX * 0.36)}px ${MONO}`;
    ctx.fillText(box.type ?? "", x0 + nameW + 24, hh * PX * 0.64);
    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(hw, hh),
      new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }),
    );
    header.position.set(-w / 2 + hw / 2 + 0.25, height + 0.42, d / 2);

    this.group.add(plate, shell, edges, header);
    stage().before(() => {
      glass.opacity = this.walls.value;
      shell.visible = this.walls.value > 0.01;
      edgeMat.color.copy(color).multiplyScalar(this.glow.value);
    });
  }
}

export interface Diagram3D {
  d: Diagram;
  root: THREE.Group;
  slabs: Map<string, Slab>;
  planes: Map<string, PlaneBox>;
  tubes: Map<string, Tube>;
  slab(path: string): Slab;
  tube(key: string): Tube;
  /** A set-relative point, in the world. */
  world(v: THREE.Vector3): THREE.Vector3;
}

/** Build `source` (with its layout block) centred on `at`. */
export function diagram3d(source: string, at: THREE.Vector3, floor?: Floor, o: { lift?: number } = {}): Diagram3D {
  const d = layoutDiagram(source);
  const ox = -(d.bounds.x + d.bounds.w / 2) / CELL;
  const oz = -(d.bounds.y + d.bounds.h / 2) / CELL;
  const root = new THREE.Group();
  root.position.copy(at);
  stage().scene.add(root);
  const slabs = new Map<string, Slab>();
  const planes = new Map<string, PlaneBox>();
  for (const b of d.boxes) {
    const x = b.x / CELL + ox + b.w / CELL / 2;
    const z = b.y / CELL + oz + b.h / CELL / 2;
    if (b.plane) {
      const p = new PlaneBox(b);
      p.group.position.set(x, 0, z);
      root.add(p.group);
      planes.set(b.path, p);
      continue;
    }
    const s = new Slab({ name: b.name, type: b.type, color: b.color, glyph: b.glyph, w: b.w / CELL, d: b.h / CELL }, floor);
    root.add(s.group);
    s.at(x, z);
    slabs.set(b.path, s);
  }
  const tubes = new Map<string, Tube>();
  for (const e of d.edges) {
    const pts = e.points.map((p) => new THREE.Vector3(p.x / CELL + ox, o.lift ?? 0.17, p.y / CELL + oz));
    const chipAt = e.chip ? new THREE.Vector3(e.chip.x / CELL + ox, o.lift ?? 0.17, e.chip.y / CELL + oz) : undefined;
    const tube = new Tube(pts).label(e.chip?.type, e.chip?.label, chipAt);
    tube.drawn.value = 0;
    root.add(tube.group);
    tubes.set(e.key, tube);
  }
  return {
    d,
    root,
    slabs,
    planes,
    tubes,
    slab: (p) => slabs.get(p)!,
    tube: (k) => tubes.get(k)!,
    world: (v) => v.clone().add(at),
  };
}
