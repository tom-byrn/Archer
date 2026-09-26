/**
 * The film: one 3D world on the Archer canvas, built shot by shot onto the
 * master timeline, with captions on an overlay above the WebGL canvas.
 */
import { onFrame, peek } from "./engine";
import { kick } from "./shots/beat";
import type { Film } from "./shots/context";
import { openShot } from "./shots/open";
import { titleShot } from "./shots/title";
import { loopShot } from "./shots/loop";
import { catalogShot } from "./shots/catalog";
import { nestShot } from "./shots/nest";
import { mcpShot } from "./shots/mcp";
import { agentsShot } from "./shots/agents";
import { repoShot } from "./shots/repo";
import { embedShot } from "./shots/embed";
import { buildShot } from "./shots/build";
import { dropShot } from "./shots/drop";
import { endShot } from "./shots/end";
import { createFloor } from "./three/floor";
import { createStage } from "./three/stage";
import { loadOutlineFonts } from "./three/text3d";
import { h } from "./dom";
import { FPS } from "./time";

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

  openShot(film);
  titleShot(film);
  loopShot(film);
  catalogShot(film);
  nestShot(film);
  mcpShot(film);
  agentsShot(film);
  repoShot(film);
  embedShot(film);
  buildShot(film);
  dropShot(film);
  endShot(film);

  // Last: every other hook has run, so the frame reflects this time. The rig a
  // frame earlier gives the camera's motion blur.
  onFrame((t) => {
    const prev = peek(t - 1 / FPS, t, () => ({ ...stage.rig }));
    stage.render(t, prev);
  });
}
