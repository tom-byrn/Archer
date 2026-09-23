#!/usr/bin/env bash
# Rebuild the launch video end to end.
#
#   ./make.sh            record every shot, then render, mix and mux
#   ./make.sh render     re-render from existing shots (after editing compose/)
#
# Needs: the web app running (pnpm dev, or `next dev` in apps/web) at
# $ARCHER_URL (default http://localhost:3100), Playwright with Chromium,
# Python 3 with numpy + scipy, and ffmpeg with libx264 ($FFMPEG).
set -euo pipefail
cd "$(dirname "$0")"

FFMPEG="${FFMPEG:-ffmpeg}"
PY="${PYTHON:-python3}"

if [[ "${1:-}" != "render" ]]; then
  for shot in hero build code sandbox cmdk drill stills; do
    node "shots/$shot.cjs"
  done
  "$PY" music/make_music.py
fi

node compose/render.cjs --out out/video-only.mp4
"$PY" music/mix.py music/music.wav out/events.json out/soundtrack.wav
"$FFMPEG" -hide_banner -loglevel error -y \
  -i out/video-only.mp4 -i out/soundtrack.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart \
  out/archer-launch.mp4
echo "→ out/archer-launch.mp4"
