# Archer launch film

A 37-second, 1920×1080, 60 fps launch video, rendered from code: one 3D
world in Three.js (WebGL2), driven by a single GSAP timeline that headless
Chromium seeks frame by frame, with a soundtrack in `scripts/audio/`
synthesized to the same 128 BPM grid.

Everything on screen is the product's own code, not a mock-up: documents are
parsed and laid out by `@archer/lang`, edges are routed by the app's router
(`apps/web/lib/edgeRoute.ts`), `.arch` source is coloured by the editor's
highlighter (`apps/web/lib/highlightArch.ts`), glyphs and colours come from
`@archer/catalog` (the catalog wall shows every type it has), the MCP shot
lists the tools the server really registers, and the drop is the dashboard's
AI Support Agent sample. Marketing surfaces keep glyphs rather than vendor
logos, as the landing page does. `test/sources.test.ts` validates every
document the film shows.

## Commands

```sh
pnpm --filter @archer/video dev       # live preview with scrubber + soundtrack (space, ←/→, [ ])
pnpm --filter @archer/video render    # → out/archer-launch.mp4
pnpm --filter @archer/video snap 3.2 14 30.5          # stills → out/snaps/
pnpm --filter @archer/video snap --sheet 0 37 0.5 6   # contact sheet
pnpm --filter @archer/video music     # out/cues.json → out/soundtrack.wav
pnpm --filter @archer/video test
```

`render` bundles the page, reads the sound cues the shots registered, mixes
the soundtrack, renders PNG frames in headless pages (kept in `out/frames/`,
so `--from 12 --to 14` re-renders one stretch, `--no-encode` stops there
and `--skip-frames` only re-encodes), then encodes H.264 + AAC with BT.709
tags. Other flags: `--workers <n>`, `--no-audio`, `--crf <n>`.

It needs Chromium with WebGL2 and ffmpeg: set `CHROMIUM_PATH` (the
`chromium-headless-shell` build renders through SwiftShader when there is no
GPU; it takes about a second a frame, so a full render is ~40 minutes, and
more workers than two don't help because SwiftShader already uses every core)
and `FFMPEG` (or have `ffmpeg` on the PATH). `out/` is not committed.

## How it's built

- `src/time.ts` — the clock: BPM, bars, and `SECTION`, the bar each part of the
  film starts on. The soundtrack's arrangement follows the same map, so change
  a section's bar there and the music moves with it.
- `src/engine.ts` — the paused master timeline (film seconds, with a pre-roll so
  moves can start before frame 0), `onFrame` hooks, and `peek` (the state a
  frame earlier, for motion blur).
- `src/three/` — the 3D kit. `stage.ts`: renderer, camera rig and grade (bloom,
  ACES, FXAA, then aberration, vignette, grain, flash, fade and motion blur
  from the camera's own movement), `live()` visibility windows and `cut()`.
  `floor.ts`: the canvas' dot grid as an endless floor with shockwaves and
  colour pools. `slab.ts`, `tube.ts`, `diagram3d.ts`: components, connections,
  planes and whole documents. `chars.ts`: `.arch` source as instanced
  characters that fly. `tiles.ts`: catalog types as instanced tiles.
  `text3d.ts`: extruded type from the real font outlines. `fx.ts`, `rays.ts`:
  sparks, rings, flares, dust, light rays. `panel.ts`, `picture.ts`: flat UI
  (code pane, terminal, windows, the pointer) painted with Archer's tokens.
- `src/film.ts` → `src/shots/*` — one module per shot, each on its own set in
  the one world (`sets.ts`): `open` (Draw it. / It's code.), `title`, `loop`
  (canvas ⇄ file), `catalog`, `nest` (zoom in / schemas), `mcp`, `agents`,
  `repo`, `embed`, `build` (Copy for agent), `drop`, `end`.
- `src/text.ts` — the captions: serif words rising in masks, on an overlay
  above the WebGL canvas.
- `src/sources.ts` — every `.arch` document on screen.
- `src/cues.ts` — shots call `cue(t, "pop")` where a sound belongs; the render
  writes them to `out/cues.json` for the soundtrack.

Rendering must be deterministic, because each worker loads the page on its
own and seeks straight to its frames: nothing runs on wall-clock time, every
tween sits on the master timeline at an absolute time, and everything else
(particles, flying characters, tiles, orbits) is a closed-form function of
film time, computed in a `stage().before` hook. Show an object for a stretch
with `live(obj, from, to)`; it applies before any hook reads visibility.
