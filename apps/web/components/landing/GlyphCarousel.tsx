import type { CSSProperties } from "react";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { displayColor } from "@/lib/useIsDark";

// The catalog types that go by, in order, so no two neighbours (the last and
// the first included) share a color or a glyph.
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

/**
 * A row of catalog glyph tiles, between Features and FAQ, running left to
 * right the whole way across the band and fading out toward the column's
 * rules. The row is drawn twice, end to end, and the pair moves one row's
 * length before starting over, so the loop has no seam. CSS only
 * (`.landing-glyph-strip` and `.landing-glyph-track` in landing.css); it
 * stands still for reduced motion.
 */
export function GlyphCarousel() {
  const row = TAGS.map((tag) => <Tile key={tag} tag={tag} />);
  return (
    // Its own box clips the tiles, so the band's joints, which overhang it, stay whole.
    <div className="landing-glyph-strip absolute inset-0 overflow-hidden" aria-hidden>
      <div className="landing-glyph-track">
        <div className="landing-glyph-row">{row}</div>
        <div className="landing-glyph-row">{row}</div>
      </div>
    </div>
  );
}

/** One type: its glyph on a tint of its color, as in Features. */
function Tile({ tag }: { tag: string }) {
  const entry = lookupType(tag);
  const style = {
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
