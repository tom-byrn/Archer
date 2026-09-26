/**
 * A component as a physical object: a glossy rounded slab whose top face is
 * the canvas card (tinted glyph tile, name, mono type tag), a thin rim in the
 * type's colour, colour pooling on the floor beneath it, and a contact
 * shadow. Entrances (rise out of the floor, drop from above) come with their
 * light: a shockwave ring, sparks, a wave through the dot grid, a sound.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { cue } from "../cues";
import { master } from "../engine";
import type { Floor } from "./floor";
import { fx } from "./fx";
import { ACCENT, ACCENT_INK, INK, INK_3, LINE_2, MONO, SANS, canvas, fit, glyphMarkup, icon, rgba, texture } from "./paint";
import { stage } from "./stage";
import robot from "@phosphor-icons/core/assets/bold/robot-bold.svg";

export interface SlabSpec {
  name: string;
  type?: string;
  color: string;
  glyph: string;
  /** Footprint in world units (canvas cells). */
  w: number;
  d: number;
  h?: number;
}

const PX = 256;

function faceTexture(s: SlabSpec): THREE.CanvasTexture {
  const W = Math.round(s.w * PX);
  const H = Math.round(s.d * PX);
  const { c, ctx } = canvas(W, H);
  const r = 0.12 * PX;
  const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
  grad.addColorStop(0, "#1d1f23");
  grad.addColorStop(1, "#141518");
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, r);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = LINE_2;
  ctx.stroke();

  const tile = 0.8 * PX;
  const tx = 0.26 * PX;
  const ty = (H - tile) / 2;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tile, tile, 0.12 * PX);
  ctx.fillStyle = rgba(s.color, 0.17);
  ctx.fill();
  const g = 0.46 * PX;
  icon(ctx, glyphMarkup(s.glyph), tx + (tile - g) / 2, ty + (tile - g) / 2, g, s.color);

  const x = tx + tile + 0.26 * PX;
  const maxW = W - x - 0.2 * PX;
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(0.34 * PX)}px ${SANS}`;
  ctx.fillText(fit(ctx, s.name, maxW), x, H / 2 - 0.04 * PX);
  ctx.fillStyle = INK_3;
  ctx.font = `400 ${Math.round(0.26 * PX)}px ${MONO}`;
  ctx.fillText(fit(ctx, s.type ?? "component", maxW), x, H / 2 + 0.34 * PX);
  return texture(c);
}

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A rounded-rect outline `width` thick, lying flat (XZ). */
export function outlineGeometry(w: number, d: number, r: number, width: number): THREE.BufferGeometry {
  const outer = roundedRectShape(w, d, r);
  const inner = roundedRectShape(w - width * 2, d - width * 2, Math.max(0.01, r - width));
  outer.holes.push(new THREE.Path(inner.getPoints(8).reverse()));
  const geo = new THREE.ShapeGeometry(outer, 8);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

let bodyMat: THREE.MeshPhysicalMaterial | null = null;
let shadowTex: THREE.Texture | null = null;
let badgeTex: THREE.Texture | null = null;

function shadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.9)");
  g.addColorStop(0.6, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** The canvas' agent-touched badge (canvas.css .arch-badge): a green disc with a robot. */
export function badgeTexture(): THREE.Texture {
  if (badgeTex) return badgeTex;
  const { c, ctx } = canvas(128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  icon(ctx, robot, 30, 30, 68, ACCENT_INK);
  badgeTex = texture(c);
  return badgeTex;
}

export class Slab {
  readonly group = new THREE.Group();
  readonly h: number;
  /** Rim and floor-pool brightness; tween it. */
  readonly glow = { value: 0.55 };
  badge: THREE.Sprite | null = null;
  private readonly rimMat: THREE.MeshBasicMaterial;
  private readonly color: THREE.Color;

  constructor(
    readonly spec: SlabSpec,
    private readonly floor?: Floor,
  ) {
    const h = (this.h = spec.h ?? 0.34);
    bodyMat ??= new THREE.MeshPhysicalMaterial({
      color: 0x16171a,
      roughness: 0.3,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(spec.w, h, spec.d, 3, 0.09), bodyMat);
    body.position.y = h / 2;
    const tex = faceTexture(spec);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w - 0.02, spec.d - 0.02),
      // Unlit: the card reads exactly as the canvas draws it, and its text stays
      // under the bloom threshold. The glossy body around it carries the light.
      new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = h + 0.003;
    this.color = new THREE.Color(spec.color);
    this.rimMat = new THREE.MeshBasicMaterial({ color: this.color.clone() });
    const rim = new THREE.Mesh(outlineGeometry(spec.w - 0.03, spec.d - 0.03, 0.1, 0.035), this.rimMat);
    rim.position.y = h + 0.006;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w * 1.35, spec.d * 1.6),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    this.group.add(shadow, body, face, rim);

    stage().before(() => {
      this.rimMat.color.copy(this.color).multiplyScalar(this.glow.value);
    });
    if (floor) {
      const g = this.group;
      const self = this;
      floor.pool({
        get x() {
          return g.position.x;
        },
        get z() {
          return g.position.z;
        },
        radius: Math.max(spec.w, spec.d) * 0.95,
        color: this.color,
        intensity: () => (g.visible ? self.glow.value * Math.max(0, Math.min(1, 1 + g.position.y)) : 0),
      });
    }
  }

  at(x: number, z: number): this {
    this.group.position.set(x, 0, z);
    return this;
  }

  /** The agent badge, popping onto the top-right corner at `t`. */
  addBadge(t: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), depthTest: false }));
    s.position.set(this.spec.w / 2 - 0.08, this.h + 0.2, -this.spec.d / 2 + 0.08);
    s.scale.setScalar(0.001);
    s.renderOrder = 10;
    this.group.add(s);
    this.badge = s;
    master.to(s.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.35, ease: "back.out(3)" }, t);
  }

  /** Hidden until `t`. */
  hideUntil(t: number): void {
    this.group.visible = false;
    master.set(this.group, { visible: true }, t);
  }

  /** Erupt out of the floor at `t`, landing on the beat with a burst of light. */
  rise(t: number, o: { spin?: number; pitch?: number; big?: boolean } = {}): number {
    const g = this.group;
    this.hideUntil(t);
    const land = t + 0.2;
    master.fromTo(g.position, { y: -(this.h + 0.4) }, { y: 0, duration: 0.5, ease: "back.out(2.2)", immediateRender: false }, t);
    master.fromTo(g.rotation, { y: o.spin ?? 0.9 }, { y: 0, duration: 0.7, ease: "power3.out", immediateRender: false }, t);
    master.fromTo(g.scale, { x: 0.7, y: 0.7, z: 0.7 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(2)", immediateRender: false }, t);
    this.flash(land, o.big);
    cue(land, "pop", { pitch: o.pitch ?? 0 });
    return land;
  }

  /** Fall from the sky and slam down at `t` (the landing). */
  drop(t: number, o: { height?: number; pitch?: number } = {}): number {
    const g = this.group;
    const fall = 0.42;
    this.hideUntil(t - fall);
    master.fromTo(g.position, { y: o.height ?? 7 }, { y: 0, duration: fall, ease: "power2.in", immediateRender: false }, t - fall);
    master.fromTo(g.rotation, { x: 0.25, z: -0.2 }, { x: 0, z: 0, duration: fall, ease: "power2.in", immediateRender: false }, t - fall);
    master.fromTo(g.scale, { y: 0.55 }, { y: 1, duration: 0.45, ease: "elastic.out(1.1, 0.35)", immediateRender: false }, t);
    this.flash(t, true);
    cue(t, "pop", { pitch: o.pitch ?? 0 });
    return t;
  }

  /** Just appear in place (already on the canvas). */
  show(t = -10): void {
    this.hideUntil(t);
  }

  /** The light of an arrival: rim flare, floor pool, ring, sparks, a wave. */
  flash(t: number, big = false): void {
    const { x, z } = this.group.position;
    const f = fx();
    master.fromTo(this.glow, { value: 4.5 }, { value: 0.55, duration: 1.1, ease: "power2.out", immediateRender: false }, t);
    f.ring({ t0: t, x, z, radius: Math.max(this.spec.w, this.spec.d) * (big ? 1.5 : 1.1), dur: 0.7, color: this.spec.color, width: 0.35 });
    this.floor?.wave({ t0: t, x, z, speed: big ? 14 : 10, strength: big ? 1.4 : 0.9, decay: 0.45, color: this.spec.color });
    f.burst({
      t0: t,
      x,
      y: this.h,
      z,
      count: big ? 110 : 60,
      speed: big ? 7 : 4.5,
      up: 0.55,
      life: 0.9,
      color: this.spec.color,
      size: 0.07,
      glow: 3,
    });
  }
}

export { ACCENT, INK };
