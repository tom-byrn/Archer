# Launch video

The ~104 s launch video, built from the real app. Nothing here is part of the
product build; it's a standalone pipeline.

```
shots/     Playwright scripts that drive the real app and record frames
lib/       the frame-exact recorder
compose/   the edit: an HTML stage rendered frame by frame (renderAt(t))
music/     the synthesized temp music bed and the final mix
make.sh    everything, in order
```

## How it works

**Recording.** `lib/recorder.cjs` drives Chromium on a fake clock: every JS
timer and `requestAnimationFrame` follows it, and every CSS animation and
transition is paused and seeked to the same virtual time before each
screenshot. So a shot renders identically on any machine, at any speed —
each frame is exactly 1/60 s after the last, with scripted input (mouse
paths, typing) applied between frames. Headless Chromium draws no pointer, so
the recorder logs the cursor (position, button, CSS cursor) per frame and the
compositor draws it.

The app runs locally (`ARCHER_URL`, default `http://localhost:3000`). The
recorder swaps in local copies of the app's fonts (Inter, Playfair Display,
Newsreader, plus Geist Mono for the system monospace stack), so it works even
where Google Fonts is unreachable. Only public pages are filmed (landing,
`/sandbox/<slug>`), so no real credentials are needed; without them every page
shows the "not configured" panel, so start the app with placeholders:

```sh
cd apps/web   # its `dev` script is plain `next dev -p 3000` (no Convex)
NEXT_PUBLIC_CONVEX_URL=https://placeholder.convex.cloud \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_$(printf 'clerk.example.com$' | base64)" \
pnpm dev
```

The recorder blocks requests to those placeholder hosts, so nothing waits on them.

Setup: `cd video && npm install` (Playwright + the fonts; this folder is not
part of the pnpm workspace), ffmpeg with libx264 on `PATH` (or `FFMPEG=…`),
and Python 3 with numpy and scipy (plus matplotlib for the optional spectrogram).

**Shots.**

| shot | what it records |
| --- | --- |
| `hero` | the landing hero from first paint: headline, the agent prompt typing, Copy prompt |
| `build` | the canvas drawing `shots/doc.cjs` as each declaration is written into the (hidden) code editor |
| `code` | the code modal: declare Embeddings, a typo'd connection (real E101), the fix, back to the canvas |
| `sandbox` | the landing sandbox: drag Billing (layout line updates), retype Postgres as Neon (declaration updates) |
| `cmdk` | ⌘K → "anthropic" → Enter |
| `drill` | double-click Services, open Playback's details (table + YAML payloads) |
| `stills` | landing feature tiles and the MCP clients row |

`shots/doc.cjs` is the document the editor shots use: a trimmed cut of the
docs' Music Streaming example with a layout that reads at 1080p. It validates
clean with `archer check`.

**Staged parts.** The signed-in features (history, sharing, repo link, teams)
are shown with the landing page's own feature tiles, the "written by your
agent" card replays the file the canvas is drawing, and the terminal's
`archer push` line is the CLI's real output format for a signed-in push. The
`archer check` output is real.

**Edit.** `compose/stage.js` lays scenes on a 100 BPM grid (bar = 2.4 s) so
cuts land on downbeats. Preview any moment with
`node compose/render.cjs --stills 12.5,30,57`.

**Music.** `music/make_music.py` synthesizes a temp bed with numpy/scipy (no
samples). Replace `music/music.wav` with a licensed track (48 kHz WAV, 100.8 s)
and run `./make.sh render`.
