import "./random";
import "./styles.css";
import { cues } from "./cues";
import { seek } from "./engine";
import { loadFonts } from "./fonts";
import { mountPreview } from "./preview";
import { buildFilm } from "./film";
import { DURATION, FPS, HEIGHT, WIDTH } from "./time";

async function main() {
  await loadFonts();
  const stage = document.getElementById("stage")!;
  await buildFilm(stage);
  seek(0);
  const render = new URLSearchParams(location.search).has("render");
  window.__video = {
    fps: FPS,
    duration: DURATION,
    width: WIDTH,
    height: HEIGHT,
    cues: cues(),
    async seek(t: number) {
      seek(t);
      // Two frames: styles applied, then painted, before the capture.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
  };
  if (!render) mountPreview();
}

declare global {
  interface Window {
    __video?: {
      fps: number;
      duration: number;
      width: number;
      height: number;
      cues: import("./cues").Cue[];
      seek(t: number): Promise<void>;
    };
  }
}

void main();
