/**
 * Load every face the captions and the canvas-painted textures use before
 * anything measures text. (The 3D wordmark reads its font file directly.)
 */
const FACES = [
  '500 100px "Newsreader Variable"',
  '400 100px "Newsreader Variable"',
  '400 100px "Inter Variable"',
  '500 100px "Inter Variable"',
  '600 100px "Inter Variable"',
  '700 100px "Inter Variable"',
  '400 100px "Geist Mono Variable"',
  '500 100px "Geist Mono Variable"',
];

export async function loadFonts(): Promise<void> {
  await Promise.all(FACES.map((f) => document.fonts.load(f, "Archer AaBb 0123 →·")));
  await document.fonts.ready;
}
