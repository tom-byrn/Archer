"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { displayColor } from "@/lib/useIsDark";

// The catalog types around the ring, in order, so no two neighbours (the last
// and the first included) share a color or a glyph.
const TAGS = [
  "load_balancer",
  "postgres",
  "redis",
  "llm",
  "aws.lambda",
  "kubernetes",
  "mongodb",
  "agent",
  "kafka",
  "cloudflare",
  "stripe",
  "aws.s3",
  "cdn",
  "anthropic",
  "mcp",
  "convex",
];

/** Degrees between neighbouring tiles around the ring. */
const STEP_DEG = 360 / TAGS.length;

/** How long each type stays at the front, its turn included (the turn's own length is in landing.css). */
const STEP_MS = 2400;

/**
 * Catalog glyph tiles around a ring, between Features and FAQ, that turns one
 * tile every STEP_MS like a carousel: the next type comes in from the right.
 * The tiles hide their backs, so only the front half of the ring shows. It
 * turns only while on screen in a visible tab, and not at all for reduced
 * motion.
 */
export function GlyphCarousel() {
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
    <div ref={ref} className="landing-glyph-carousel" aria-hidden>
      {/* Pushed back by the ring's radius, so the front tile sits at the page's depth, at its true size. */}
      <div
        className="landing-glyph-ring"
        style={{
          transform: `translateZ(calc(-1 * var(--ring-radius))) rotateY(${-turns * STEP_DEG}deg)`,
        }}
      >
        {TAGS.map((tag, i) => (
          <Tile key={tag} tag={tag} angle={i * STEP_DEG} />
        ))}
      </div>
    </div>
  );
}

/** One type on the ring: its glyph on a tint of its color, as in Features. */
function Tile({ tag, angle }: { tag: string; angle: number }) {
  const entry = lookupType(tag);
  const style = {
    transform: `rotateY(${angle}deg) translateZ(var(--ring-radius))`,
    "--type-light": entry?.color ?? "var(--ink-3)",
    "--type-dark": displayColor(entry?.color, true) ?? "var(--ink-3)",
  } as CSSProperties;
  return (
    <span className="landing-glyph-tile" style={style}>
      <svg
        viewBox={GLYPH_VIEWBOX}
        dangerouslySetInnerHTML={{ __html: GLYPHS[entry?.glyph ?? "box"] ?? GLYPHS.box! }}
      />
    </span>
  );
}
