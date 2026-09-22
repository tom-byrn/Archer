"use client";

import { ShaderMount } from "@paper-design/shaders-react";

/**
 * Page backdrop: a straight grey-to-black fade from the top of the viewport,
 * drawn as a 4x4 Bayer dither. Paper's Dithering shader has no linear shape,
 * so this runs a small fragment shader of our own through its ShaderMount.
 * The smooth CSS gradient under it (`.landing-dither` in landing.css) covers
 * first paint and any browser without WebGL. Static, so nothing to pause for
 * reduced motion. Fixed colors: the landing page has one look.
 */
export function DitherBackdrop() {
  return (
    <div className="landing-dither pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <ShaderMount
        className="absolute inset-0"
        fragmentShader={FRAGMENT_SHADER}
        uniforms={UNIFORMS}
        speed={0}
      />
    </div>
  );
}

const UNIFORMS = {
  // #000000 and #26272b as linear 0–1 RGBA.
  u_colorBack: [0, 0, 0, 1],
  u_colorFront: [0x26 / 255, 0x27 / 255, 0x2b / 255, 1],
  // Size of one dither cell, in CSS pixels.
  u_pxSize: 2,
  // Fraction of the viewport height, from the top, over which the fade runs.
  u_fadeLength: 0.85,
};

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_pxSize;
uniform float u_fadeLength;

out vec4 fragColor;

const int bayer4x4[16] = int[16](
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
);

void main() {
  vec2 cell = floor(gl_FragCoord.xy / (u_pxSize * u_pixelRatio));
  // gl_FragCoord counts up from the bottom: 1 at the top edge, 0 at the bottom.
  float fromTop = (cell.y + .5) * u_pxSize * u_pixelRatio / u_resolution.y;
  float shade = pow(clamp(1. - (1. - fromTop) / u_fadeLength, 0., 1.), 1.6);

  ivec2 p = ivec2(mod(cell, 4.));
  float threshold = (float(bayer4x4[p.y * 4 + p.x]) + .5) / 16.;
  float on = step(threshold, shade);

  fragColor = mix(u_colorBack, u_colorFront, on);
}
`;
