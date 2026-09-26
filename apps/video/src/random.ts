/**
 * Every render worker loads the page on its own, so anything random has to
 * come out the same each time: Math.random is a seeded generator here
 * (mulberry32). Imported first, before any scene is built.
 */
let seed = 0x5eed_a7c4;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
