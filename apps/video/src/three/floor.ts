/**
 * The Archer canvas as an endless floor: the app's dot grid (one dot per
 * 40 px cell = one world unit) on its dark ground, fading into black with
 * distance. Light lives in it: shockwaves roll out across the dots, the whole
 * grid breathes with the kick, and components pool their colour beneath them.
 */
import * as THREE from "three";
import { stage } from "./stage";

const MAX_WAVES = 4;
const MAX_POOLS = 14;

export interface Wave {
  t0: number;
  x: number;
  z: number;
  /** World units per second. */
  speed: number;
  strength: number;
  /** Seconds for the strength to fall to 1/e. */
  decay: number;
  color?: THREE.ColorRepresentation;
}

export interface Pool {
  x: number;
  z: number;
  radius: number;
  color: THREE.Color;
  /** Brightness at film time t (0 = off). */
  intensity(t: number): number;
}

export interface Floor {
  mesh: THREE.Mesh;
  wave(w: Wave): void;
  pool(p: Pool): void;
  /** 0–1 extra brightness on every dot, e.g. a kick pulse. */
  pulse: { value: number };
}

export function createFloor(): Floor {
  const { scene, before, camera } = stage();
  const waves: Wave[] = [];
  const pools: Pool[] = [];
  const pulse = { value: 0 };

  const uniforms = {
    uGround: { value: new THREE.Color(0x0f1012) },
    uDot: { value: new THREE.Color(0x2e3238) },
    uAccent: { value: new THREE.Color(0x23c088) },
    uCam: { value: new THREE.Vector3() },
    uPulse: { value: 0 },
    uWaveCount: { value: 0 },
    uPoolCount: { value: 0 },
    uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uWaveColors: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Color()) },
    uPools: { value: Array.from({ length: MAX_POOLS }, () => new THREE.Vector4()) },
    uPoolColors: { value: Array.from({ length: MAX_POOLS }, () => new THREE.Color()) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGround, uDot, uAccent, uCam;
      uniform float uPulse;
      uniform int uWaveCount, uPoolCount;
      uniform vec4 uWaves[${MAX_WAVES}];
      uniform vec3 uWaveColors[${MAX_WAVES}];
      uniform vec4 uPools[${MAX_POOLS}];
      uniform vec3 uPoolColors[${MAX_POOLS}];
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = p - floor(p + 0.5);
        float d = length(g);
        float fp = length(fwidth(p));
        float r = 0.045 + fp * 0.35;
        float dotMask = 1.0 - smoothstep(r - fp * 0.8, r + fp * 0.8, d);
        // Where a cell shrinks to a few pixels the grid would shimmer: fade it out.
        dotMask *= 1.0 - smoothstep(0.07, 0.2, fp);

        vec3 wave = vec3(0.0);
        for (int i = 0; i < ${MAX_WAVES}; i++) {
          if (i >= uWaveCount) break;
          vec4 w = uWaves[i];
          float x = (length(p - w.xy) - w.z) / (0.9 + w.z * 0.06);
          wave += uWaveColors[i] * w.w * exp(-x * x);
        }
        vec3 pool = vec3(0.0);
        for (int i = 0; i < ${MAX_POOLS}; i++) {
          if (i >= uPoolCount) break;
          vec4 q = uPools[i];
          float f = 1.0 - smoothstep(0.0, q.z, length(p - q.xy));
          pool += uPoolColors[i] * q.w * f * f;
        }
        vec3 col = uGround + pool * 0.22 + wave * 0.05;
        vec3 dotCol = uDot * (1.0 + uPulse * 2.2) + wave * 3.0 + pool * 1.2;
        col = mix(col, dotCol, dotMask);
        float dist = length(vWorld - uCam);
        col *= 1.0 - smoothstep(18.0, 70.0, dist);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  scene.add(mesh);

  before((t) => {
    uniforms.uCam.value.copy(camera.position);
    uniforms.uPulse.value = pulse.value;
    // The most recent live waves.
    const live = waves
      .filter((w) => t >= w.t0 && w.strength * Math.exp(-(t - w.t0) / w.decay) > 0.01)
      .slice(-MAX_WAVES);
    uniforms.uWaveCount.value = live.length;
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = live[i];
      const v = uniforms.uWaves.value[i]!;
      if (!w) {
        v.set(0, 0, 0, 0);
        continue;
      }
      const age = t - w.t0;
      v.set(w.x, w.z, w.speed * age, w.strength * Math.exp(-age / w.decay));
      uniforms.uWaveColors.value[i]!.set(w.color ?? 0x23c088);
    }
    // The brightest pools nearest the camera's focus.
    const lit = pools
      .map((p) => ({ p, k: p.intensity(t) }))
      .filter((e) => e.k > 0.001)
      .sort((a, b) => b.k - a.k)
      .slice(0, MAX_POOLS);
    uniforms.uPoolCount.value = lit.length;
    for (let i = 0; i < MAX_POOLS; i++) {
      const e = lit[i];
      const v = uniforms.uPools.value[i]!;
      if (!e) {
        v.set(0, 0, 0, 0);
        continue;
      }
      v.set(e.p.x, e.p.z, e.p.radius, e.k);
      uniforms.uPoolColors.value[i]!.copy(e.p.color);
    }
  });

  return {
    mesh,
    wave: (w) => {
      waves.push(w);
      waves.sort((a, b) => a.t0 - b.t0);
    },
    pool: (p) => pools.push(p),
    pulse,
  };
}
