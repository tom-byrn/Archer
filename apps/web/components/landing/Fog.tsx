/**
 * Page backdrop: three blurred gradient layers drifting slowly past each
 * other. Adapted from shadcn.io's Fog background (https://www.shadcn.io/background/fog):
 * fixed behind the whole page like the original, but colored from the tokens
 * (see `.landing-fog` in landing.css) so it follows light and dark mode.
 */
export function Fog({ speed = 1 }: { speed?: number }) {
  const layer = (background: string, opacity: number, name: string, seconds: number) => (
    <div
      className="landing-fog-layer absolute h-[120%] w-[200%]"
      style={{ background, opacity, animation: `${name} ${seconds / speed}s ease-in-out infinite` }}
    />
  );
  return (
    <div className="landing-fog pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ filter: "blur(80px)" }}>
        {layer(
          `radial-gradient(ellipse 50% 40% at 25% 50%, var(--fog-a), transparent),
           radial-gradient(ellipse 40% 50% at 75% 60%, var(--fog-b), transparent)`,
          0.35,
          "landing-fog-1",
          100,
        )}
        {layer(
          `radial-gradient(ellipse 60% 35% at 30% 40%, var(--fog-b), transparent),
           radial-gradient(ellipse 45% 45% at 70% 70%, var(--fog-a), transparent)`,
          0.45,
          "landing-fog-2",
          80,
        )}
        {layer(
          `radial-gradient(ellipse 55% 50% at 40% 55%, var(--fog-a), transparent),
           radial-gradient(ellipse 50% 35% at 60% 35%, var(--fog-b), transparent)`,
          0.4,
          "landing-fog-3",
          60,
        )}
      </div>
    </div>
  );
}
