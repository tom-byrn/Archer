/** The film, scene by scene, in order. Each scene adds itself to the master timeline. */
import { featuresScene } from "./scenes/features";
import { finaleScene } from "./scenes/finale";
import { loopScene } from "./scenes/loop";
import { openScene } from "./scenes/open";
import { titleScene } from "./scenes/title";

export function buildFilm(stage: HTMLElement): void {
  openScene(stage);
  titleScene(stage);
  loopScene(stage);
  featuresScene(stage);
  finaleScene(stage);
}
