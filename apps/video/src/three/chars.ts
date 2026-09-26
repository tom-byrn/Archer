/**
 * Code as matter: every character of an .arch file is its own instanced quad
 * (Geist Mono from a glyph atlas, coloured by the editor's highlighter), so a
 * file can fly apart, stream, swirl and reassemble in 3D. Placement is a pure
 * function of film time per character, so any frame renders on its own.
 */
import * as THREE from "three";
import { highlightArch } from "../../../web/lib/highlightArch";
import { MONO, canvas } from "./paint";
import { stage } from "./stage";

const FIRST = 32;
const LAST = 126;
const COLS = 16;
const CW = 64;
const CH = 128;
const FONT_PX = 96;
/** Advance and line height as fractions of the em (Geist Mono). */
export const ADVANCE = 0.6;
export const LINE = 1.55;

/** Token colours: the dark theme's tok-* tokens from globals.css. */
const TOKEN: Record<string, string> = {
  "tok-kw": "#3dd39c",
  "tok-string": "#a5d6ff",
  "tok-type": "#7dd3fc",
  "tok-arrow": "#f5f4f1",
  "tok-num": "#fca5a5",
  "tok-comment": "#8a857d",
  "tok-fence": "#8a857d",
  "tok-payload": "#a5a19a",
  "tok-version": "#5eead4",
};
const PLAIN = "#d3d1cc";

let atlas: THREE.Texture | null = null;
function atlasTexture(): THREE.Texture {
  if (atlas) return atlas;
  const rows = Math.ceil((LAST - FIRST + 1) / COLS);
  const { c, ctx } = canvas(COLS * CW, rows * CH);
  ctx.fillStyle = "#fff";
  ctx.font = `500 ${FONT_PX}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let code = FIRST; code <= LAST; code++) {
    const i = code - FIRST;
    ctx.fillText(String.fromCharCode(code), (i % COLS) * CW + CW / 2, Math.floor(i / COLS) * CH + CH / 2 + 4);
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = 8;
  return atlas;
}

function uvOf(ch: string): [number, number, number, number] {
  const rows = Math.ceil((LAST - FIRST + 1) / COLS);
  const i = Math.min(LAST, Math.max(FIRST, ch.charCodeAt(0))) - FIRST;
  const u0 = (i % COLS) / COLS;
  const v1 = 1 - Math.floor(i / COLS) / rows;
  return [u0, v1 - 1 / rows, u0 + 1 / COLS, v1];
}

export interface Char {
  ch: string;
  color: THREE.Color;
  /** Line and column in its file. */
  line: number;
  col: number;
}

/** An .arch source as coloured characters (spaces dropped). */
export function codeChars(source: string): Char[] {
  const out: Char[] = [];
  highlightArch(source).forEach((tokens, line) => {
    let col = 0;
    for (const tok of tokens) {
      const color = new THREE.Color(tok.className ? (TOKEN[tok.className] ?? PLAIN) : PLAIN);
      for (const ch of tok.text) {
        if (ch !== " ") out.push({ ch, color, line, col });
        col++;
      }
    }
  });
  return out;
}

/** Where a character sits in a text block: `frame` places the block, em = world units per em. */
export function slot(c: Pick<Char, "line" | "col">, frame: THREE.Matrix4, em: number): THREE.Vector3 {
  return new THREE.Vector3((c.col + 0.5) * ADVANCE * em, -(c.line + 0.5) * LINE * em, 0).applyMatrix4(frame);
}

export interface CharState {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  /** Em size in world units. */
  s: number;
  /** 0–1, or 0 to hide. */
  a: number;
  /** Brightness multiplier (>1 blooms). */
  glow: number;
}

/** A set of characters animated by one function of time. */
export interface CharRun {
  chars: Char[];
  /** Fill `out` for character i at film time t; return false to hide it. */
  at(i: number, t: number, out: CharState): boolean;
}

export class CharField {
  readonly mesh: THREE.InstancedMesh;
  private readonly runs: CharRun[] = [];
  private readonly uv: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;

  constructor(readonly capacity = 6000) {
    const geo = new THREE.PlaneGeometry(CW / FONT_PX, CH / FONT_PX);
    this.uv = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geo.setAttribute("aUv", this.uv);
    geo.setAttribute("aCol", this.col);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlasTexture() } },
      vertexShader: /* glsl */ `
        attribute vec4 aUv;
        attribute vec4 aCol;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vUv = mix(aUv.xy, aUv.zw, uv);
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          float a = texture2D(uAtlas, vUv).a * vCol.a;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vCol.rgb, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    stage().scene.add(this.mesh);

    const st: CharState = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, a: 1, glow: 1 };
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    stage().before((t) => {
      let n = 0;
      for (const run of this.runs) {
        for (let i = 0; i < run.chars.length && n < capacity; i++) {
          st.a = 1;
          st.glow = 1;
          if (!run.at(i, t, st) || st.a <= 0.002 || st.s <= 0) continue;
          const c = run.chars[i]!;
          m.compose(st.p, st.q, scale.setScalar(st.s));
          this.mesh.setMatrixAt(n, m);
          const [u0, v0, u1, v1] = uvOf(c.ch);
          this.uv.setXYZW(n, u0, v0, u1, v1);
          this.col.setXYZW(n, c.color.r * st.glow, c.color.g * st.glow, c.color.b * st.glow, st.a);
          n++;
        }
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.uv.needsUpdate = true;
      this.col.needsUpdate = true;
    });
  }

  add(run: CharRun): void {
    this.runs.push(run);
  }
}

let shared: CharField | null = null;
/** The film's one character field. */
export function chars(): CharField {
  shared ??= new CharField();
  return shared;
}

/* ------------------------------------------------------------ Motion kit */

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Deterministic per-character random in [0, 1). */
export const rand = (i: number, k: number) => {
  const s = Math.sin(i * 91.345 + k * 47.853) * 24634.6345;
  return s - Math.floor(s);
};

/** A point on a quadratic Bézier. */
export function bezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  return out.set(
    v * v * a.x + 2 * v * u * c.x + u * u * b.x,
    v * v * a.y + 2 * v * u * c.y + u * u * b.y,
    v * v * a.z + 2 * v * u * c.z + u * u * b.z,
  );
}

/** A random tumble orientation for character i. */
export function tumble(i: number, amount: number, out: THREE.Quaternion): THREE.Quaternion {
  const e = new THREE.Euler((rand(i, 7) - 0.5) * amount, (rand(i, 8) - 0.5) * amount, (rand(i, 9) - 0.5) * amount);
  return out.setFromEuler(e);
}
