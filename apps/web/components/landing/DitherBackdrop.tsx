"use client";

import { Dithering } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

/**
 * Page backdrop: a grey-to-black fade from the top of the viewport, drawn as
 * a 4x4 Bayer dither by Paper's Dithering shader (a large sphere centred above
 * the viewport, so only its lit top edge shows). The smooth CSS gradient
 * under it (`.landing-dither` in landing.css) covers first paint and any
 * browser without WebGL. Fixed colors: the landing page has one look.
 */
export function DitherBackdrop() {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <div className="landing-dither pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <Dithering
        className="absolute inset-0"
        colorBack="#000000"
        colorFront="#1f2023"
        shape="sphere"
        type="4x4"
        size={2}
        scale={3.5}
        offsetY={-1.3}
        speed={reduceMotion ? 0 : 0.15}
      />
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}
