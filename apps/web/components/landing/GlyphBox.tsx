"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { displayColor } from "@/lib/useIsDark";

// The catalog types the box turns through, ordered so no two in a row share a
// color or a glyph.
const TAGS = [
  "load_balancer",
  "postgres",
  "redis",
  "llm",
  "aws.lambda",
  "kubernetes",
  "agent",
  "kafka",
  "stripe",
  "cdn",
  "anthropic",
  "mcp",
];

/** How long each type shows, its turn included (the turn's own length is in landing.css). */
const STEP_MS = 2400;

/** Half the box's edge: how far each face sits from the cube's center. */
const HALF = 28;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * A cube of catalog glyph tiles, between Features and FAQ, that turns a quarter
 * upward every STEP_MS to bring the next type to the front. The cube has four
 * faces around its axis, so each face takes the type it shows next while it's
 * at the back, out of sight. It turns only while on screen in a visible tab,
 * and not at all for reduced motion.
 */
export function GlyphBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = false;
    let timer: number | undefined;
    const update = () => {
      const run = onScreen && !document.hidden && !reduce.matches;
      if (run && timer === undefined) {
        timer = window.setInterval(() => setTurns((t) => t + 1), STEP_MS);
      } else if (!run && timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      update();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", update);
    reduce.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduce.removeEventListener("change", update);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div ref={ref} className="landing-glyph-box" aria-hidden>
      {/* Pushed back half an edge, so the front face sits at the page's depth, at its true size. */}
      <div
        className="landing-glyph-cube"
        style={{ transform: `translateZ(-${HALF}px) rotateX(${turns * 90}deg)` }}
      >
        {[0, 1, 2, 3].map((face) => {
          // The last turn at which this face was at the front, or the next one
          // for the face below it, which the coming turn brings up.
          const turn = turns + 1 - mod(turns + 1 - face, 4);
          return <Face key={face} face={face} tag={TAGS[mod(turn, TAGS.length)]!} />;
        })}
      </div>
    </div>
  );
}

/** One side of the cube: a type's glyph on a tint of its color, as in Features. */
function Face({ face, tag }: { face: number; tag: string }) {
  const entry = lookupType(tag);
  const style = {
    transform: `rotateX(${-face * 90}deg) translateZ(${HALF}px)`,
    "--type-light": entry?.color ?? "var(--ink-3)",
    "--type-dark": displayColor(entry?.color, true) ?? "var(--ink-3)",
  } as CSSProperties;
  return (
    <span className="landing-glyph-face" style={style}>
      <svg
        width={26}
        height={26}
        viewBox={GLYPH_VIEWBOX}
        dangerouslySetInnerHTML={{ __html: GLYPHS[entry?.glyph ?? "box"] ?? GLYPHS.box! }}
      />
    </span>
  );
}
