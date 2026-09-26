/** Load every face the film sets before anything measures text. */
const FACES = [
  '500 100px "Newsreader Variable"',
  '400 100px "Newsreader Variable"',
  '400 100px "Inter Variable"',
  '500 100px "Inter Variable"',
  '600 100px "Inter Variable"',
  '700 100px "Inter Variable"',
  '400 100px "Geist Mono Variable"',
  '500 100px "Geist Mono Variable"',
  '700 100px "Playfair Display"',
  '900 100px "Playfair Display"',
];

export async function loadFonts(): Promise<void> {
  await Promise.all(FACES.map((f) => document.fonts.load(f, "Archer AaBb 0123 →·")));
  await document.fonts.ready;
}
