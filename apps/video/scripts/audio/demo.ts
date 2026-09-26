/**
 * A stand-in for the picture's cue list (out/cues.json), so the soundtrack
 * can be rendered and judged on its own: a few of each kind, placed where
 * the film puts that kind of moment.
 */
import type { Cue, CueKind } from "../../src/cues";
import { SECTION, at } from "../../src/time";

export function demoCues(): Cue[] {
  const cues: Cue[] = [];
  const add = (t: number, kind: CueKind, opts: Omit<Cue, "t" | "kind"> = {}) => cues.push({ t, kind, ...opts });

  // Cold open: the diagram draws itself.
  [0, 4, 7].forEach((pitch, i) => add(at(SECTION.draw, 0.5 + i / 2), "pop", { pitch }));
  add(at(SECTION.draw, 2), "draw");
  add(at(SECTION.draw, 2.75), "draw", { gain: 0.8 });
  // Flip to code, typing.
  add(at(SECTION.code) - 0.2, "whoosh", { dur: 0.4 });
  for (let i = 0; i < 10; i++) add(at(SECTION.code, 1) + i * 0.07, "key");
  // Title.
  add(at(SECTION.title), "impact");
  // Canvas ↔ code: components pop in up the scale, then typing.
  [0, 2, 4, 7, 9, 12].forEach((pitch, i) => add(at(SECTION.loop, i / 2), "pop", { pitch }));
  add(at(SECTION.loop + 1, 0), "click");
  for (let i = 0; i < 20; i++) add(at(SECTION.loop + 1, 1) + i * 0.06, "key");
  add(at(SECTION.loop + 2, 2), "draw");
  add(at(SECTION.loop + 3, 0) - 0.2, "whoosh");
  for (let i = 0; i < 4; i++) add(at(SECTION.loop + 3, 1 + i / 2), "tick");
  // Features, one per bar.
  add(at(SECTION.features) - 0.25, "whoosh", { dur: 0.5 });
  add(at(SECTION.features + 1, 1), "click");
  add(at(SECTION.features + 1, 2), "snap");
  add(at(SECTION.features + 2, 1), "error");
  add(at(SECTION.features + 2, 3), "success");
  [0, 2, 4].forEach((pitch, i) => add(at(SECTION.features + 3, i), "pop", { pitch, gain: 0.8 }));
  for (let i = 0; i < 6; i++) add(at(SECTION.features + 4, i / 2), "tick");
  add(at(SECTION.features + 5, 0.5), "draw");
  add(at(SECTION.features + 6, 1), "click");
  add(at(SECTION.build - 1, 2), "success", { gain: 0.8 });
  // Break: "Copy for agent".
  add(at(SECTION.build, 1), "click");
  add(at(SECTION.build, 1.5), "success");
  // Drop 2: the big diagram.
  add(at(SECTION.drop) - 0.3, "whoosh", { dur: 0.6 });
  [0, 2, 4, 7, 9, 12, 14, 16].forEach((pitch, i) => add(at(SECTION.drop, 1 + i / 2), "pop", { pitch }));
  add(at(SECTION.drop + 1, 2), "draw");
  add(at(SECTION.drop + 2, 0), "snap");
  // End card.
  add(at(SECTION.end), "impact");

  return cues.sort((a, b) => a.t - b.t);
}
