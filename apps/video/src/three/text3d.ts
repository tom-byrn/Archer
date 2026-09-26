/**
 * Type as sculpture: the wordmark (Playfair Display 900) and headline words
 * (Newsreader) extruded with bevels, a polished ink face and dark metal
 * sides that catch the rim light. Outlines come from opentype.js.
 */
import * as THREE from "three";
import opentype, { type Font } from "opentype.js";
import newsreaderUrl from "../../../web/app/welcome/fonts/Newsreader-500-opsz72.ttf";
import playfairUrl from "@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff";

type FontKey = "display" | "serif";
const fonts = new Map<FontKey, Font>();

/** Load the outline fonts; call before building any 3D text. */
export async function loadOutlineFonts(): Promise<void> {
  for (const [key, url] of [
    ["display", playfairUrl],
    ["serif", newsreaderUrl],
  ] as const) {
    const buf = await (await fetch(url)).arrayBuffer();
    fonts.set(key, opentype.parse(buf));
  }
}

export interface Text3DOpts {
  font?: FontKey;
  /** Cap height-ish size in world units (the font size). */
  size: number;
  depth?: number;
  bevel?: number;
  /** Letter spacing in ems (negative tightens). */
  tracking?: number;
  face?: THREE.Material;
  side?: THREE.Material;
}

let faceMat: THREE.Material | null = null;
let sideMat: THREE.Material | null = null;

/** Shapes for `text`, baseline at y=0, starting at x=0, in world units. */
function shapes(text: string, font: Font, size: number, tracking: number): THREE.Shape[] {
  const out: THREE.Shape[] = [];
  let x = 0;
  for (const ch of text) {
    const path = font.getPath(ch, x, 0, size, { kerning: false });
    const sp = new THREE.ShapePath();
    for (const c of path.commands) {
      if (c.type === "M") sp.moveTo(c.x, -c.y);
      else if (c.type === "L") sp.lineTo(c.x, -c.y);
      else if (c.type === "Q") sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
      else if (c.type === "C") sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    }
    // Holes are found by containment, so the font's winding doesn't matter.
    out.push(...sp.toShapes());
    x += font.getAdvanceWidth(ch, size) + tracking * size;
  }
  return out;
}

/** Extruded text centred on its bounding box, facing +z. */
export function text3d(text: string, o: Text3DOpts): THREE.Mesh {
  const font = fonts.get(o.font ?? "display");
  if (!font) throw new Error("outline fonts not loaded");
  const depth = o.depth ?? o.size * 0.18;
  const bevel = o.bevel ?? o.size * 0.022;
  const geo = new THREE.ExtrudeGeometry(shapes(text, font, o.size, o.tracking ?? 0), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 4,
    curveSegments: 10,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -depth / 2);
  faceMat ??= new THREE.MeshPhysicalMaterial({ color: 0xecebe7, metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
  sideMat ??= new THREE.MeshPhysicalMaterial({ color: 0x17181b, metalness: 0.75, roughness: 0.28, clearcoat: 0.6 });
  return new THREE.Mesh(geo, [o.face ?? faceMat, o.side ?? sideMat]);
}
