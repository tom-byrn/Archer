/**
 * A connection as light: a glowing tube along the edge's route (the app's
 * router, lifted into 3D with rounded corners) that draws itself from source
 * to target behind a bright spark, an arrowhead that snaps on at the end,
 * data pulses that run along it, and its label chip floating above.
 */
import * as THREE from "three";
import { cue } from "../cues";
import { master } from "../engine";
import { LINE, INK, INK_2, MONO, SANS, SURFACE, canvas, texture } from "./paint";
import { stage } from "./stage";

export interface TubeOpts {
  radius?: number;
  color?: THREE.ColorRepresentation;
  /** Brightness multiplier on the colour (>1 blooms). */
  glow?: number;
  head?: boolean;
  corner?: number;
}

/** A polyline with rounded corners, as a 3D curve. */
export function roundedPath(points: THREE.Vector3[], radius = 0.35): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = points[0]!.clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const next = points[i + 1];
    if (!next) {
      path.add(new THREE.LineCurve3(from, p.clone()));
      break;
    }
    const inDir = p.clone().sub(points[i - 1]!);
    const outDir = next.clone().sub(p);
    const k = Math.min(radius, inDir.length() / 2, outDir.length() / 2);
    const a = p.clone().sub(inDir.normalize().multiplyScalar(k));
    const b = p.clone().add(outDir.normalize().multiplyScalar(k));
    if (from.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    from = b;
  }
  return path;
}

let chipCache = new Map<string, THREE.Texture>();

/** The canvas' edge chip (nodes.tsx): mono protocol · label on a surface pill. */
export function chipSprite(type?: string, label?: string): THREE.Sprite {
  const key = `${type}|${label}`;
  let tex = chipCache.get(key);
  const S = 3;
  const measure = canvas(10, 10).ctx;
  measure.font = `400 ${14 * S}px ${MONO}`;
  const tw = type ? measure.measureText(type).width : 0;
  measure.font = `500 ${14 * S}px ${SANS}`;
  const dotW = type && label ? measure.measureText(" · ").width : 0;
  const lw = label ? measure.measureText(label).width : 0;
  const W = Math.ceil(tw + dotW + lw + 20 * S);
  const H = 26 * S;
  if (!tex) {
    const { c, ctx } = canvas(W, H);
    ctx.beginPath();
    ctx.roundRect(2, 2, W - 4, H - 4, 6 * S);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.lineWidth = 2 * S;
    ctx.strokeStyle = LINE;
    ctx.stroke();
    let x = 10 * S;
    const y = H / 2 + 5 * S;
    if (type) {
      ctx.font = `400 ${14 * S}px ${MONO}`;
      ctx.fillStyle = INK_2;
      ctx.fillText(type, x, y);
      x += tw;
    }
    if (type && label) {
      ctx.font = `500 ${14 * S}px ${SANS}`;
      ctx.fillStyle = "#6d6963";
      ctx.fillText(" · ", x, y);
      x += dotW;
    }
    if (label) {
      ctx.font = `500 ${14 * S}px ${SANS}`;
      ctx.fillStyle = INK;
      ctx.fillText(label, x, y);
    }
    tex = texture(c);
    chipCache.set(key, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const unit = 0.0056;
  sprite.scale.set(W * unit, H * unit, 1);
  return sprite;
}

export class Tube {
  readonly group = new THREE.Group();
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  /** 0–1 how much of the tube is drawn; tween it. */
  readonly drawn = { value: 1 };
  private readonly mesh: THREE.Mesh;
  private readonly head: THREE.Mesh | null;
  private readonly spark: THREE.Mesh;
  private readonly segs: number;
  private readonly radial = 8;
  private pulses: { t0: number; period: number; count: number; mesh: THREE.Mesh[] }[] = [];
  chip: THREE.Sprite | null = null;

  constructor(points: THREE.Vector3[], o: TubeOpts = {}) {
    this.curve = roundedPath(points, o.corner ?? 0.35);
    const len = this.curve.getLength();
    this.segs = Math.max(12, Math.round(len * 10));
    const color = new THREE.Color(o.color ?? 0xecebe7).multiplyScalar(o.glow ?? 1.05);
    const mat = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(this.curve, this.segs, o.radius ?? 0.035, this.radial, false), mat);
    this.group.add(this.mesh);
    if (o.head !== false) {
      const cone = new THREE.ConeGeometry(0.13, 0.34, 16);
      cone.translate(0, -0.17, 0);
      this.head = new THREE.Mesh(cone, mat);
      const end = this.curve.getPointAt(1);
      const tan = this.curve.getTangentAt(1);
      this.head.position.copy(end);
      this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      this.group.add(this.head);
    } else this.head = null;
    this.spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(4) }),
    );
    this.spark.visible = false;
    this.group.add(this.spark);

    stage().before((t) => {
      const p = Math.max(0, Math.min(1, this.drawn.value));
      const count = Math.floor(p * this.segs) * this.radial * 6;
      this.mesh.geometry.setDrawRange(0, count);
      this.mesh.visible = count > 0;
      if (this.head) this.head.visible = p >= 0.999;
      this.spark.visible = p > 0.001 && p < 0.999;
      if (this.spark.visible) this.spark.position.copy(this.curve.getPointAt(p));
      for (const pl of this.pulses) {
        pl.mesh.forEach((m, k) => {
          const age = t - pl.t0;
          m.visible = age >= 0 && p >= 0.999;
          if (!m.visible) return;
          const u = (((age / pl.period + k / pl.count) % 1) + 1) % 1;
          m.position.copy(this.curve.getPointAt(u));
        });
      }
    });
  }

  /** Draw from source to target over `dur` starting at `t`. */
  draw(t: number, dur = 0.35, sound = true): number {
    this.drawn.value = 0;
    master.fromTo(this.drawn, { value: 0 }, { value: 1, duration: dur, ease: "power2.inOut", immediateRender: false }, t);
    if (this.chip) {
      const s = this.chip.scale.clone();
      this.chip.scale.set(0.001, 0.001, 1);
      master.to(this.chip.scale, { x: s.x, y: s.y, duration: 0.3, ease: "back.out(2.5)" }, t + dur * 0.7);
    }
    if (sound) cue(t, "draw", { gain: 0.8 });
    return t + dur;
  }

  /** Already drawn. */
  shown(): this {
    this.drawn.value = 1;
    return this;
  }

  /** Data pulses running source → target, `count` at a time, one lap per `period`. */
  flow(t0: number, count = 2, period = 1.1, color: THREE.ColorRepresentation = 0x3dd39c): void {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(5) });
    const geo = new THREE.SphereGeometry(0.07, 12, 8);
    const mesh = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.pulses.push({ t0, period, count, mesh });
  }

  /** The label chip, floating over the middle of the route. */
  label(type?: string, label?: string, at?: THREE.Vector3): this {
    if (!type && !label) return this;
    const s = chipSprite(type, label);
    s.position.copy(at ?? this.curve.getPointAt(0.5)).add(new THREE.Vector3(0, 0.26, 0));
    this.group.add(s);
    this.chip = s;
    return this;
  }
}
