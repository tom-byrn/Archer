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

/** The grade: all tweenable. */
export interface Grade {
  bloom: number;
  aberration: number;
  vignette: number;
  grain: number;
  flash: number;
  fade: number;
  exposure: number;
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
    uRes: { value: new THREE.Vector2(WIDTH, HEIGHT) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberration, uVignette, uGrain, uFlash, uFade, uSeed;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 dir = c * uAberration * (0.4 + r2 * 3.0);
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + dir).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - dir).b
      );
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
  render(t: number): void;
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
  const grade: Grade = { bloom: 0.85, aberration: 0, vignette: 1, grain: 0.022, flash: 0, fade: 0, exposure: 1 };

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
  const shakeAt = (t: number, f: number, p: number) =>
    Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.13 + p * 1.7) * 0.3 + Math.sin(t * f * 4.7 + p * 0.3) * 0.1;

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
    render(t) {
      for (const fn of hooks) fn(t);
      const k = rig.shake;
      camera.position.set(rig.x + k * shakeAt(t, 23, 0.4), rig.y + k * shakeAt(t, 19, 2.1), rig.z + k * shakeAt(t, 29, 4.2));
      camera.lookAt(rig.tx + k * 0.5 * shakeAt(t, 17, 1.3), rig.ty, rig.tz);
      if (rig.roll) camera.rotateZ(THREE.MathUtils.degToRad(rig.roll));
      if (camera.fov !== rig.fov) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }
      bloom.strength = grade.bloom;
      renderer.toneMappingExposure = grade.exposure;
      const u = gradePass.uniforms;
      u.uAberration!.value = grade.aberration;
      u.uVignette!.value = grade.vignette;
      u.uGrain!.value = grade.grain;
      u.uFlash!.value = grade.flash;
      u.uFade!.value = grade.fade;
      u.uSeed!.value = Math.round(t * FPS) % 97;
      composer.render();
    },
  };
  current = s;
  (window as unknown as { __stage: unknown }).__stage = { ...s, composer, bloom };
  return s;
}
