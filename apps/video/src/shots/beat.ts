import { BAR, BEAT, SECTION, at } from "../time";

/**
 * How hard the picture pumps with the kick at film time t: a spike on each
 * beat that decays in ~0.1 s, scaled by the section (none in the break,
 * strongest in the drops). Closed form, so any frame knows it.
 */
export function kick(t: number): number {
  if (t < 0) return 0;
  const bar = Math.floor(t / BAR);
  const amount =
    bar >= SECTION.end
      ? t < at(SECTION.end) + BEAT
        ? 1
        : 0
      : bar === SECTION.build
        ? 0
        : bar >= SECTION.drop || bar === SECTION.title
          ? 1
          : 0.55;
  return amount * Math.exp(-(t % BEAT) / 0.1);
}
