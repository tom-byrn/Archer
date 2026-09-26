/**
 * The 3D stage: one WebGL renderer, one scene, one camera for the whole film.
 * The master timeline tweens plain state (the camera rig, the grade) and
 * `render()` turns that state into a frame: scene → bloom → tone map →
 * grade (vignette, grain, chromatic aberration, flash, fade).
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FPS, HEIGHT, WIDTH } from "../time";

/** Where the camera is and what it looks at; every field is tweenable. */
export interface Rig {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** Degrees around the view axis. */
  roll: number;
  /** Handheld shake amplitude, world units. */
  shake: number;
}

const forward = new THREE.Vector3();
const ahead = new THREE.Vector3();
/** Where the rig's camera sits and looks (no shake). */
function aim(r: Rig, cam: THREE.PerspectiveCamera): void {
  cam.position.set(r.x, r.y, r.z);
  cam.lookAt(r.tx, r.ty, r.tz);
  if (r.roll) cam.rotateZ(THREE.MathUtils.degToRad(r.roll));
}

/** The grade: all tweenable. */
export interface Grade {
  bloom: number;
  aberration: number;
  vignette: number;
  grain: number;
  flash: number;
  fade: number;
  exposure: number;
  /** Extra zoom blur (uv fraction), e.g. on a punch-in. */
  zoom: number;
  /** Motion blur shutter: 0 = none, 0.5 = a 180° shutter. */
  shutter: number;
}

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0 },
    uVignette: { value: 1 },
    uGrain: { value: 0.02 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uSeed: { value: 0 },
    uBlur: { value: new THREE.Vector2() },
    uZoom: { value: 0 },
    uRes: { value: new THREE.Vector2(WIDTH, HEIGHT) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberration, uVignette, uGrain, uFlash, uFade, uSeed, uZoom;
    uniform vec2 uRes, uBlur;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    vec3 tap(vec2 uv, vec2 ab) {
      return vec3(texture2D(tDiffuse, uv + ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ab).b);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 ab = c * uAberration * (0.4 + r2 * 3.0);
      // Motion blur: the camera's own movement over the shutter, as a smear
      // along the pan and a radial streak along a push.
      vec2 smear = uBlur + c * uZoom;
      vec3 col;
      if (dot(smear, smear) > 1e-8) {
        col = vec3(0.0);
        float jitter = hash(vUv * uRes + uSeed * 1.7) - 0.5;
        for (int i = 0; i < 10; i++) {
          float f = (float(i) + 0.5 + jitter) / 10.0 - 0.5;
          col += tap(vUv + smear * f, ab);
        }
        col *= 0.1;
      } else {
        col = tap(vUv, ab);
      }
      float v = smoothstep(0.98, 0.3, sqrt(r2) * 1.3);
      col *= mix(1.0, v, uVignette);
      col += (hash(vUv * uRes + uSeed) - 0.5) * uGrain;
      col = mix(col, vec3(1.0), uFlash);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
  grade: Grade;
  /** Functions run before each render with the film time: animation of meshes, uniforms. */
  before(fn: (t: number) => void): void;
  /** Show `obj` only from `from` until `to` (film seconds). */
  live(obj: THREE.Object3D, from: number, to: number): void;
  /** A hard cut at `t`: no motion blur across it. */
  cut(t: number): void;
  /** Render film time t; `prev` is the rig a frame earlier (for motion blur). */
  render(t: number, prev?: Rig): void;
  canvas: HTMLCanvasElement;
}

let current: Stage | null = null;

export function stage(): Stage {
  if (!current) throw new Error("stage not created");
  return current;
}

export function createStage(host: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;left:0;top:0;width:1920px;height:1080px";
  host.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.05, 400);
  const rig: Rig = { x: 0, y: 6, z: 14, tx: 0, ty: 0, tz: 0, fov: 40, roll: 0, shake: 0 };
  const grade: Grade = { bloom: 0.85, aberration: 0, vignette: 1, grain: 0.022, flash: 0, fade: 0, exposure: 1, zoom: 0, shutter: 0.5 };

  // Key, fill and a green rim: warm ink-white from above, the accent from behind.
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x050605, 0.35);
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.position.set(-6, 14, 8);
  const rim = new THREE.DirectionalLight(0x23c088, 0.7);
  rim.position.set(8, 1.5, -12);
  scene.add(hemi, key, rim);

  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(WIDTH, HEIGHT);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(WIDTH / 2, HEIGHT / 2), 0.85, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Anti-aliasing after tone mapping, on display-space edges. FXAA: SMAA costs
  // three times as much on a software renderer for little visible gain here.
  composer.addPass(new FXAAPass());
  const gradePass = new ShaderPass(GRADE_SHADER);
  composer.addPass(gradePass);

  const hooks: ((t: number) => void)[] = [];
  /** Visibility windows, applied before any other hook reads visibility. */
  const lives: ((t: number) => void)[] = [];
  const cuts: number[] = [];
  const shakeAt = (t: number, f: number, p: number) =>
    Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.13 + p * 1.7) * 0.3 + Math.sin(t * f * 4.7 + p * 0.3) * 0.1;
  const ghost = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.05, 400);
  const blur = new THREE.Vector2();

  /** Screen-space smear and zoom streak of the camera move from `prev` to `rig`, over the shutter. */
  const motion = (t: number, prev: Rig | undefined): number => {
    blur.set(0, 0);
    if (!prev || grade.shutter <= 0) return 0;
    const dt = 1 / FPS;
    if (cuts.some((c) => c > t - dt - 1e-6 && c <= t + 1e-6)) return 0;
    aim(rig, ghost);
    ghost.fov = rig.fov;
    ghost.updateProjectionMatrix();
    ghost.updateMatrixWorld();
    // Pan: where what the camera looked at a frame ago is on screen now (an
    // orbit around a still subject keeps it sharp; a whip smears everything).
    ahead.set(prev.tx, prev.ty, prev.tz).project(ghost);
    if (ahead.z > 1) return 0;
    blur.set(ahead.x * 0.5 * grade.shutter, ahead.y * 0.5 * grade.shutter);
    // Push: forward travel against the distance to what the camera looks at,
    // plus any change of lens.
    forward.set(rig.tx - rig.x, rig.ty - rig.y, rig.tz - rig.z);
    const dist = Math.max(0.5, forward.length());
    forward.normalize();
    const travel = (rig.x - prev.x) * forward.x + (rig.y - prev.y) * forward.y + (rig.z - prev.z) * forward.z;
    const lens = Math.tan(THREE.MathUtils.degToRad(prev.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(rig.fov) / 2) - 1;
    const zoom = (travel / dist + lens) * grade.shutter * 2;
    // A jump this big is a cut, not a move.
    if (blur.length() > 0.2 || Math.abs(zoom) > 0.5) {
      blur.set(0, 0);
      return 0;
    }
    if (blur.length() < 0.0015) blur.set(0, 0);
    return Math.abs(zoom) < 0.003 ? 0 : zoom;
  };

  const s: Stage = {
    renderer,
    scene,
    camera,
    rig,
    grade,
    canvas,
    before(fn) {
      hooks.push(fn);
    },
    live(obj, from, to) {
      lives.push((t) => {
        obj.visible = t >= from && t < to;
      });
    },
    cut(t) {
      cuts.push(t);
    },
    render(t, prev) {
      // The camera first: hooks may read it (the floor's fade, spark sizes).
      const k = rig.shake;
      camera.position.set(rig.x + k * shakeAt(t, 23, 0.4), rig.y + k * shakeAt(t, 19, 2.1), rig.z + k * shakeAt(t, 29, 4.2));
      camera.lookAt(rig.tx + k * 0.5 * shakeAt(t, 17, 1.3), rig.ty, rig.tz);
      if (rig.roll) camera.rotateZ(THREE.MathUtils.degToRad(rig.roll));
      if (camera.fov !== rig.fov) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }
      for (const fn of lives) fn(t);
      for (const fn of hooks) fn(t);
      const zoom = motion(t, prev);
      bloom.strength = grade.bloom;
      renderer.toneMappingExposure = grade.exposure;
      const u = gradePass.uniforms;
      u.uAberration!.value = grade.aberration;
      u.uVignette!.value = grade.vignette;
      u.uGrain!.value = grade.grain;
      u.uFlash!.value = grade.flash;
      u.uFade!.value = grade.fade;
      u.uSeed!.value = Math.round(t * FPS) % 97;
      u.uBlur!.value.copy(blur);
      u.uZoom!.value = zoom + grade.zoom;
      composer.render();
    },
  };
  current = s;
  (window as unknown as { __stage: unknown }).__stage = { ...s, composer, bloom };
  return s;
}
