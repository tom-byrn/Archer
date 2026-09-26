/**
 * Where each shot is built in the one world: far enough apart that nothing
 * of one shows in another. Pure data.
 */
import * as THREE from "three";

export const SET = {
  catalog: new THREE.Vector3(220, 0, 0),
  nest: new THREE.Vector3(320, 0, 0),
  mcp: new THREE.Vector3(420, 0, 0),
  agents: new THREE.Vector3(520, 0, 0),
  repo: new THREE.Vector3(620, 0, 0),
  embed: new THREE.Vector3(720, 0, 0),
  build: new THREE.Vector3(820, 0, 0),
  drop: new THREE.Vector3(0, 0, 160),
  end: new THREE.Vector3(0, 0, 320),
} as const;
