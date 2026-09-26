/**
 * Light rays fanning out from a point behind a subject: a procedural,
 * additive backdrop (slowly turning beams and a hot core) for the hits.
 */
import * as THREE from "three";
import { stage } from "./stage";

export interface Rays {
  mesh: THREE.Mesh;
  /** Overall brightness; tween it. */
  alpha: { value: number };
}

export function rays(center: THREE.Vector3, o: { size?: number; color?: THREE.ColorRepresentation } = {}): Rays {
  const size = o.size ?? 44;
  const uniforms = {
    uTime: { value: 0 },
    uAlpha: { value: 0 },
    uColor: { value: new THREE.Color(o.color ?? 0x23c088) },
    uSize: { value: size },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAlpha, uSize;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * uSize;
          float r = length(p);
          float a = atan(p.y, p.x);
          float beams = pow(max(0.0, sin(a * 7.0 + uTime * 0.35)), 14.0)
            + 0.7 * pow(max(0.0, sin(a * 13.0 - uTime * 0.28 + 1.3)), 22.0)
            + 0.45 * pow(max(0.0, sin(a * 29.0 + uTime * 0.2 + 2.1)), 30.0);
          float fall = exp(-r * 0.14) * smoothstep(0.5, 3.5, r);
          float core = exp(-r * 0.9) * 0.35;
          vec3 col = mix(uColor, vec3(1.0), 0.35) * (beams * fall * 0.9 + core) * uAlpha;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  mesh.position.copy(center);
  mesh.renderOrder = -0.5;
  const alpha = { value: 0 };
  stage().before((t) => {
    uniforms.uTime.value = t;
    uniforms.uAlpha.value = alpha.value;
    mesh.visible = alpha.value > 0.001;
  });
  stage().scene.add(mesh);
  return { mesh, alpha };
}
