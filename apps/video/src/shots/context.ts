import type { Floor } from "../three/floor";

/** What every shot gets: the floor (waves, pools, pulse) and the overlay for type. */
export interface Film {
  floor: Floor;
  /** Screen-space layer over the WebGL canvas for captions. */
  overlay: HTMLElement;
}
