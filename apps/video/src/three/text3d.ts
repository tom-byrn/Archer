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

function extrude(shapes: THREE.Shape[], depth: number, bevel: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 4,
    curveSegments: 10,
  });
}

function materials(o: Text3DOpts): THREE.Material[] {
  faceMat ??= new THREE.MeshPhysicalMaterial({ color: 0xecebe7, metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
  sideMat ??= new THREE.MeshPhysicalMaterial({ color: 0x17181b, metalness: 0.75, roughness: 0.28, clearcoat: 0.6 });
  return [o.face ?? faceMat, o.side ?? sideMat];
}

export interface Letters {
  /** Centred on the word's bounding box. */
  group: THREE.Group;
  /** One mesh per visible character, each centred on itself and placed at its slot. */
  letters: THREE.Mesh[];
  width: number;
  height: number;
}

/**
 * Extruded text as separate letters (kerned, tracked), so each can fly,
 * spin and land on its own. Rotate a letter and it turns about its middle.
 */
export function letters3d(text: string, o: Text3DOpts): Letters {
  const font = fonts.get(o.font ?? "display");
  if (!font) throw new Error("outline fonts not loaded");
  const depth = o.depth ?? o.size * 0.18;
  const bevel = o.bevel ?? o.size * 0.022;
  const mats = materials(o);
  const scale = o.size / font.unitsPerEm;
  const group = new THREE.Group();
  const letters: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  let x = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    if (ch !== " ") {
      const geo = extrude(shapes(ch, font, o.size, 0), depth, bevel);
      geo.computeBoundingBox();
      // A copy: translate() recomputes the geometry's own box.
      const bb = geo.boundingBox!.clone();
      const cx = (bb.min.x + bb.max.x) / 2;
      const cy = (bb.min.y + bb.max.y) / 2;
      geo.translate(-cx, -cy, -depth / 2);
      const m = new THREE.Mesh(geo, mats);
      m.position.set(x + cx, cy, 0);
      box.expandByPoint(new THREE.Vector3(x + bb.min.x, bb.min.y, 0));
      box.expandByPoint(new THREE.Vector3(x + bb.max.x, bb.max.y, 0));
      letters.push(m);
      group.add(m);
    }
    const next = chars[i + 1];
    const g = font.charToGlyph(ch);
    x += g.advanceWidth * scale + (o.tracking ?? 0) * o.size;
    if (next) x += font.getKerningValue(g, font.charToGlyph(next)) * scale;
  });
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  for (const m of letters) {
    m.position.x -= cx;
    m.position.y -= cy;
  }
  return { group, letters, width: box.max.x - box.min.x, height: box.max.y - box.min.y };
}

/** Extruded text centred on its bounding box, facing +z. */
export function text3d(text: string, o: Text3DOpts): THREE.Mesh {
  const font = fonts.get(o.font ?? "display");
  if (!font) throw new Error("outline fonts not loaded");
  const depth = o.depth ?? o.size * 0.18;
  const bevel = o.bevel ?? o.size * 0.022;
  const geo = extrude(shapes(text, font, o.size, o.tracking ?? 0), depth, bevel);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -depth / 2);
  return new THREE.Mesh(geo, materials(o));
}
