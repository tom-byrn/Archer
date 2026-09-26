/**
 * Catalog types as physical tiles: a glossy rounded chip per type with its
 * glyph on its tinted tile (the landing page's glyph tiles, in 3D), all
 * instanced, so hundreds can fly at once. Placement is a pure function of
 * film time per tile, like the code characters.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CATALOG, type CatalogType } from "@archer/catalog";
import { displayColor } from "../../../web/lib/svg";
import { canvas, glyphMarkup, icon, rgba } from "./paint";
import { stage } from "./stage";

const CELL = 96;
const COLS = 20;

/** Every catalog type (the film says "350+": it shows them all). */
export const TYPES: readonly CatalogType[] = CATALOG;

export interface TileState {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  /** Edge length in world units. */
  s: number;
  /** Face brightness (>1 blooms). */
  glow: number;
}

export interface TileField {
  count: number;
  /** Each tile's colour as the dark canvas draws it. */
  colors: THREE.Color[];
  group: THREE.Group;
}

/** The tiles, `at(i, t, out)` placing tile i at film time t (false hides it). */
export function tileField(at: (i: number, t: number, out: TileState) => boolean, types = TYPES): TileField {
  const n = types.length;
  const rows = Math.ceil(n / COLS);
  const { c, ctx } = canvas(COLS * CELL, rows * CELL);
  const colors: THREE.Color[] = [];
  types.forEach((ty, i) => {
    const color = displayColor(ty.color, true);
    colors.push(new THREE.Color(color));
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * CELL;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 18);
    ctx.fillStyle = "#16171a";
    ctx.fill();
    ctx.fillStyle = rgba(color, 0.14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(color, 0.4);
    ctx.stroke();
    const g = CELL * 0.48;
    icon(ctx, glyphMarkup(ty.glyph), x + (CELL - g) / 2, y + (CELL - g) / 2, g, color);
  });
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;

  const group = new THREE.Group();
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  faceGeo.setAttribute("aUv", uv);
  faceGeo.setAttribute("aGlow", glow);
  const faceMat = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas } },
    vertexShader: /* glsl */ `
      attribute vec4 aUv;
      attribute float aGlow;
      varying vec2 vUv;
      varying float vGlow;
      void main() {
        vUv = mix(aUv.xy, aUv.zw, uv);
        vGlow = aGlow;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      varying float vGlow;
      void main() {
        vec4 c = texture2D(uAtlas, vUv);
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb * vGlow, 1.0);
      }
    `,
  });
  const faces = new THREE.InstancedMesh(faceGeo, faceMat, n);
  faces.frustumCulled = false;
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
  const bodies = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 0.16, 2, 0.1), bodyMat, n);
  bodies.frustumCulled = false;
  group.add(bodies, faces);
  stage().scene.add(group);

  const st: TileState = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, glow: 1 };
  const m = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const faceOffset = new THREE.Matrix4().makeTranslation(0, 0, 0.085);
  const shrink = new THREE.Matrix4().makeScale(0.94, 0.94, 1);
  stage().before((t) => {
    if (!group.visible) return;
    let k = 0;
    for (let i = 0; i < n; i++) {
      st.glow = 1;
      if (!at(i, t, st) || st.s <= 0.001) continue;
      m.compose(st.p, st.q, scale.setScalar(st.s));
      bodies.setMatrixAt(k, m);
      m.multiply(faceOffset).multiply(shrink);
      faces.setMatrixAt(k, m);
      uv.setXYZW(k, (i % COLS) / COLS, 1 - Math.floor(i / COLS) / rows - 1 / rows, (i % COLS) / COLS + 1 / COLS, 1 - Math.floor(i / COLS) / rows);
      glow.setX(k, st.glow);
      k++;
    }
    bodies.count = faces.count = k;
    bodies.instanceMatrix.needsUpdate = true;
    faces.instanceMatrix.needsUpdate = true;
    uv.needsUpdate = true;
    glow.needsUpdate = true;
  });
  return { count: n, colors, group };
}
