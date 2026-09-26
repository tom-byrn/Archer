/**
 * The film: one 3D world on the Archer canvas, built scene by scene onto the
 * master timeline, with captions on an overlay above the WebGL canvas.
 */
import { onFrame } from "./engine";
import { kick } from "./shots/beat";
import type { Film } from "./shots/context";
import { openScene } from "./shots/open";
import { createFloor } from "./three/floor";
import { createStage } from "./three/stage";
import { loadOutlineFonts } from "./three/text3d";
import { h } from "./dom";

export async function buildFilm(host: HTMLElement): Promise<void> {
  await loadOutlineFonts();
  const stage = createStage(host);
  const floor = createFloor();
  const overlay = h("div", { class: "abs", style: { width: 1920, height: 1080, pointerEvents: "none" } });
  host.append(overlay);
  const film: Film = { floor, overlay };

  stage.before((t) => {
    floor.pulse.value = kick(t) * 0.8;
  });

  openScene(film);

  // Last: every other hook has run, so the frame reflects this time.
  onFrame((t) => stage.render(t));
}
