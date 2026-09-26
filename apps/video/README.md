# Archer launch film

A 37-second, 1920×1080, 60 fps launch video, rendered from code: the page in
`src/` is one GSAP timeline that Chromium seeks frame by frame, and the
soundtrack in `scripts/audio/` is synthesized to the same 128 BPM grid.

Everything on screen is the product's own code, not a mock-up: documents are
parsed and laid out by `@archer/lang`, edges are routed by the app's router
(`apps/web/lib/edgeRoute.ts`), `.arch` source is coloured by the editor's
highlighter (`apps/web/lib/highlightArch.ts`), glyphs and colours come from
`@archer/catalog`, and the finale is the dashboard's AI Support Agent sample.
Marketing surfaces keep glyphs rather than vendor logos, as the landing page
does. `test/sources.test.ts` validates every document the film shows.

## Commands

```sh
pnpm --filter @archer/video dev       # live preview with scrubber + soundtrack (space, ←/→, [ ])
pnpm --filter @archer/video render    # → out/archer-launch.mp4
pnpm --filter @archer/video snap 3.2 14 30.5          # stills → out/snaps/
pnpm --filter @archer/video snap --sheet 0 39 0.5 6   # contact sheet
pnpm --filter @archer/video music     # out/cues.json → out/soundtrack.wav
pnpm --filter @archer/video test
```

`render` bundles the page, reads the sound cues the scenes registered, mixes
the soundtrack, renders PNG frames in parallel headless pages (kept in
`out/frames/`, so `--from 12 --to 14` re-renders one stretch and
`--skip-frames` only re-encodes), then encodes H.264 + AAC with BT.709 tags.
Other flags: `--workers <n>`, `--no-audio`, `--crf <n>`.

It needs Chromium and ffmpeg: set `CHROMIUM_PATH` (or run
`npx playwright install chromium-headless-shell`, or have Chrome installed)
and `FFMPEG` (or have `ffmpeg` on the PATH). `out/` is not committed.

## How it's built

- `src/time.ts` — the clock: BPM, bars, and `SECTION`, the bar each part of the
  film starts on. The soundtrack's arrangement follows the same map, so change
  a section's bar there and the music moves with it.
- `src/engine.ts` — the paused master timeline (film seconds, with a pre-roll so
  moves can start before frame 0) and `onFrame` hooks for state that GSAP
  tweens on plain objects, like cameras and the pointer.
- `src/film.ts` → `src/scenes/*` — one module per part: `open` (Draw it. / the
  canvas flips to its code), `title`, `loop` (canvas ⇄ file: drag and connect,
  then an agent writes), `features` (seven stations on one canvas,
  whip-panned), `finale` (Copy for agent, the drop, the end card).
- `src/diagram.ts`, `src/code.ts`, `src/codepane.ts`, `src/camera.ts`,
  `src/pointer.ts`, `src/text.ts` — the building blocks.
- `src/sources.ts` — every `.arch` document on screen.
- `src/cues.ts` — scenes call `cue(t, "pop")` where a sound belongs; the render
  writes them to `out/cues.json` for the soundtrack.

Rendering must be deterministic, because each worker loads the page on its
own and seeks straight to its frames: `Math.random` is seeded
(`src/random.ts`), nothing runs on wall-clock time, and every tween sits on
the master timeline at an absolute time. Hide layers with `showBetween`;
reveal things inside them with opacity, never `visibility: visible`, which
would show through a hidden layer.
