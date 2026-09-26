/**
 * Light effects, all closed-form in time so any frame renders on its own:
 * spark bursts (additive points), shockwave rings on the floor, and soft
 * glow flares. Scenes schedule them; the stage evaluates them per frame.
 */
import * as THREE from "three";
import { stage } from "./stage";

const MAX_SPARKS = 9000;

export interface Burst {
  t0: number;
  x: number;
  y: number;
  z: number;
  count: number;
  /** Initial speed, world units per second. */
  speed: number;
  /** 0 = all directions, 1 = straight up (a fountain). */
  up?: number;
  /** Only horizontal (a ring spray along the floor). */
  flat?: boolean;
  life: number;
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  color?: THREE.ColorRepresentation;
  /** Point size in world units. */
  size?: number;
  /** Brightness multiplier (>1 blooms). */
  glow?: number;
  seed?: number;
}

export interface Ring {
  t0: number;
  x: number;
  y?: number;
  z: number;
  radius: number;
  dur: number;
  width?: number;
  color?: THREE.ColorRepresentation;
  glow?: number;
}

export interface Flare {
  t0: number;
  x: number;
  y: number;
  z: number;
  size: number;
  dur: number;
  color?: THREE.ColorRepresentation;
  glow?: number;
}

const hash = (i: number, k: number, seed: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

export interface Fx {
  burst(b: Burst): void;
  ring(r: Ring): void;
  flare(f: Flare): void;
}

let fxSingleton: Fx | null = null;
export function fx(): Fx {
  fxSingleton ??= createFx();
  return fxSingleton;
}

function createFx(): Fx {
  const { scene, before, camera } = stage();
  const bursts: Burst[] = [];
  const rings: Ring[] = [];
  const flares: Flare[] = [];

  /* Sparks */
  const pos = new Float32Array(MAX_SPARKS * 3);
  const col = new Float32Array(MAX_SPARKS * 3);
  const size = new Float32Array(MAX_SPARKS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(0.1, -mv.z);
        vColor = aColor;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a * a, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sparks = new THREE.Points(geo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);

  /* Rings and flares: pooled meshes */
  const ringMat = () =>
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uWidth: { value: 0.05 }, uAlpha: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uWidth, uAlpha; varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float x = (d - (1.0 - uWidth)) / uWidth;
          float a = exp(-x * x * 4.0) * step(d, 1.0);
          a += smoothstep(1.0, 0.0, d) * 0.12;
          gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
  const ringMeshes = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  const flareTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const flareSprites = Array.from({ length: 8 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.visible = false;
    scene.add(s);
    return s;
  });

  before((t) => {
    sparkMat.uniforms.uScale!.value = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let n = 0;
    const c = new THREE.Color();
    for (const b of bursts) {
      const age = t - b.t0;
      if (age < 0 || age > b.life * 1.6) continue;
      c.set(b.color ?? 0x3dd39c);
      const glow = b.glow ?? 2.5;
      const g = b.gravity ?? -3;
      const k = b.drag ?? 1.6;
      const seed = b.seed ?? b.t0 * 13.1;
      for (let i = 0; i < b.count && n < MAX_SPARKS; i++) {
        const life = b.life * (0.45 + hash(i, 1, seed) * 0.8);
        if (age > life) continue;
        const a = hash(i, 2, seed) * Math.PI * 2;
        const upness = b.up ?? 0.35;
        const e = b.flat ? 0 : (hash(i, 3, seed) * 2 - 1) * (1 - upness) + upness;
        const h = Math.sqrt(Math.max(0, 1 - e * e));
        const sp = b.speed * (0.35 + hash(i, 4, seed) * 0.9);
        // v(t) = v0·e^(−kt): distance travelled (1 − e^(−kt))/k, plus gravity.
        const d = (1 - Math.exp(-k * age)) / k;
        pos[n * 3] = b.x + Math.cos(a) * h * sp * d;
        pos[n * 3 + 1] = Math.max(0.01, b.y + e * sp * d + 0.5 * g * age * age);
        pos[n * 3 + 2] = b.z + Math.sin(a) * h * sp * d;
        const fade = 1 - age / life;
        const f = glow * fade * fade;
        col[n * 3] = c.r * f;
        col[n * 3 + 1] = c.g * f;
        col[n * 3 + 2] = c.b * f;
        size[n] = (b.size ?? 0.09) * (0.5 + hash(i, 5, seed));
        n++;
      }
    }
    for (let i = n; i < MAX_SPARKS; i++) size[i] = 0;
    geo.attributes.position!.needsUpdate = true;
    (geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, Math.max(1, n));

    let r = 0;
    for (const ring of rings) {
      const p = (t - ring.t0) / ring.dur;
      if (p < 0 || p > 1 || r >= ringMeshes.length) continue;
      const m = ringMeshes[r++]!;
      const e = 1 - Math.pow(1 - p, 3);
      const rad = Math.max(0.01, ring.radius * e);
      m.visible = true;
      m.position.set(ring.x, (ring.y ?? 0) + 0.02, ring.z);
      m.scale.setScalar(rad);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uColor!.value.set(ring.color ?? 0x3dd39c).multiplyScalar(ring.glow ?? 2.2);
      u.uWidth!.value = Math.min(0.9, (ring.width ?? 0.25) / rad);
      u.uAlpha!.value = (1 - p) * (1 - p);
    }
    for (; r < ringMeshes.length; r++) ringMeshes[r]!.visible = false;

    let f = 0;
    for (const fl of flares) {
      const p = (t - fl.t0) / fl.dur;
      if (p < 0 || p > 1 || f >= flareSprites.length) continue;
      const s = flareSprites[f++]!;
      s.visible = true;
      s.position.set(fl.x, fl.y, fl.z);
      s.scale.setScalar(fl.size * (0.6 + 0.4 * Math.sin(Math.min(1, p * 3) * Math.PI * 0.5)));
      const k = p < 0.12 ? p / 0.12 : Math.pow(1 - (p - 0.12) / 0.88, 2);
      (s.material as THREE.SpriteMaterial).color.set(fl.color ?? 0xffffff).multiplyScalar((fl.glow ?? 2) * k);
    }
    for (; f < flareSprites.length; f++) flareSprites[f]!.visible = false;
  });

  return {
    burst: (b) => bursts.push(b),
    ring: (r) => rings.push(r),
    flare: (fl) => flares.push(fl),
  };
}
