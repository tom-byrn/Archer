"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ShaderMount, getShaderColorFromString } from "@paper-design/shaders-react";
import { useIsDark } from "@/lib/useIsDark";
import { cx } from "../ui";

/**
 * A straight fade from a color token (`front`, --landing-fade unless given)
 * into the page color (--landing-bg) down its box, drawn as a 4x4 Bayer
 * dither: Paper's Dithering shader has no linear shape, so this runs a small
 * fragment shader of our own through its ShaderMount. `fadeLength` is the
 * fraction of the box's height, from the top, over which the fade runs, and
 * `curve` how much sooner it ends at the side edges than in the middle, as a
 * fraction of the height: the gentle arc of its lower edge. Cells are `cell`
 * CSS pixels square, each drawn as a square or, with `dot`, as a round dot
 * that fraction of the cell across. The smooth CSS gradient under it
 * (`.landing-dither` in landing.css) covers first paint and any browser
 * without WebGL. Static, so nothing to pause for reduced motion.
 */
export function Dither({
  className,
  fadeLength,
  curve = 0,
  cell = 2,
  dot,
  front = "--landing-fade",
}: {
  className: string;
  fadeLength: number;
  curve?: number;
  cell?: number;
  dot?: number;
  front?: string;
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
    const fore = style.getPropertyValue(front).trim();
    if (!back || !fore) return;
    setColors((prev) => (prev?.back === back && prev.front === fore ? prev : { back, front: fore }));
  }, [isDark, front]);

  // ShaderMount sends its uniforms again whenever this object changes.
  const uniforms = useMemo(
    () =>
      colors && {
        u_pxSize: cell,
        u_dot: dot ?? 0,
        u_fadeLength: fadeLength,
        u_curve: curve,
        u_colorBack: getShaderColorFromString(colors.back),
        u_colorFront: getShaderColorFromString(colors.front),
      },
    [colors, fadeLength, curve, cell, dot],
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

// highp: positions are in device pixels, thousands across a wide screen.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_pxSize;
uniform float u_dot;
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
  // The cell grid, in device pixels, centered so the part-cells at opposite
  // edges match.
  float size = u_pxSize * u_pixelRatio;
  vec2 offset = .5 * mod(u_resolution, size);
  vec2 cell = floor((gl_FragCoord.xy - offset) / size);
  vec2 center = (cell + .5) * size + offset;
  vec2 uv = center / u_resolution;
  // Distance down from the top edge (gl_FragCoord counts up from the bottom),
  // pushed further down toward the sides so the fade's edge arcs slightly.
  float x = 2. * uv.x - 1.;
  float down = 1. - uv.y + u_curve * x * x;
  float shade = pow(clamp(1. - down / u_fadeLength, 0., 1.), 1.6);

  ivec2 p = ivec2(mod(cell, 4.));
  float threshold = (float(bayer4x4[p.y * 4 + p.x]) + .5) / 16.;
  float on = step(threshold, shade);

  if (u_dot > 0.) {
    // A round dot in the middle of the cell, its edge smoothed over a device
    // pixel. A part-cell at an edge gets none rather than a sliver of one.
    float r = .5 * u_dot * size;
    on *= 1. - smoothstep(r - .5, r + .5, distance(gl_FragCoord.xy, center));
    vec2 inside = step(vec2(0.), center) * step(center, u_resolution);
    on *= inside.x * inside.y;
  }

  fragColor = mix(u_colorBack, u_colorFront, on);
}
`;
