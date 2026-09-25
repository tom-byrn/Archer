"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ShaderMount, getShaderColorFromString } from "@paper-design/shaders-react";
import { useIsDark } from "@/lib/useIsDark";
import { cx } from "../ui";

/**
 * A straight fade from --landing-fade into the page color (--landing-bg) down
 * its box, grey to black in dark mode, drawn as a 4x4 Bayer dither: Paper's
 * Dithering shader has no linear shape, so this runs a small fragment shader
 * of our own through its ShaderMount. `fadeLength` is the fraction of the
 * box's height, from the top, over which the fade runs, and `curve` how much
 * sooner it ends at the side edges than in the middle, as a fraction of the
 * height: the gentle arc of its lower edge. The smooth CSS gradient under it
 * (`.landing-dither` in landing.css) covers first paint and any browser
 * without WebGL. Static, so nothing to pause for reduced motion.
 */
export function Dither({
  className,
  fadeLength,
  curve = 0,
}: {
  className: string;
  fadeLength: number;
  curve?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();
  // The two colors as the stylesheet has them for the page's theme, read again
  // when it changes. Until they are read there is no shader, so it never
  // draws the other theme's colors (or none) over the CSS gradient.
  const [colors, setColors] = useState<{ back: string; front: string } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const back = style.getPropertyValue("--landing-bg").trim();
    const front = style.getPropertyValue("--landing-fade").trim();
    if (!back || !front) return;
    setColors((prev) => (prev?.back === back && prev.front === front ? prev : { back, front }));
  }, [isDark]);

  // ShaderMount sends its uniforms again whenever this object changes.
  const uniforms = useMemo(
    () =>
      colors && {
        ...UNIFORMS,
        u_fadeLength: fadeLength,
        u_curve: curve,
        u_colorBack: getShaderColorFromString(colors.back),
        u_colorFront: getShaderColorFromString(colors.front),
      },
    [colors, fadeLength, curve],
  );

  return (
    <div
      ref={ref}
      className={cx("landing-dither", className)}
      // The CSS gradient fades over the same length as the shader.
      style={{ "--dither-length": `${fadeLength * 100}%` } as CSSProperties}
      aria-hidden
    >
      {uniforms && (
        <ShaderMount
          className="absolute inset-0"
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          speed={0}
        />
      )}
    </div>
  );
}

/**
 * Page backdrop: the fade down the first screen of the page, arcing slightly.
 * It scrolls away with the content, leaving the plain page.
 */
export function DitherBackdrop() {
  return (
    <Dither
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-svh"
      fadeLength={0.85}
      curve={0.15}
    />
  );
}

const UNIFORMS = {
  // Size of one dither cell, in CSS pixels.
  u_pxSize: 2,
};

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_pxSize;
uniform float u_fadeLength;
uniform float u_curve;

out vec4 fragColor;

const int bayer4x4[16] = int[16](
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
);

void main() {
  vec2 cell = floor(gl_FragCoord.xy / (u_pxSize * u_pixelRatio));
  vec2 uv = (cell + .5) * u_pxSize * u_pixelRatio / u_resolution;
  // Distance down from the top edge (gl_FragCoord counts up from the bottom),
  // pushed further down toward the sides so the fade's edge arcs slightly.
  float x = 2. * uv.x - 1.;
  float down = 1. - uv.y + u_curve * x * x;
  float shade = pow(clamp(1. - down / u_fadeLength, 0., 1.), 1.6);

  ivec2 p = ivec2(mod(cell, 4.));
  float threshold = (float(bayer4x4[p.y * 4 + p.x]) + .5) / 16.;
  float on = step(threshold, shade);

  fragColor = mix(u_colorBack, u_colorFront, on);
}
`;
