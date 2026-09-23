// Stills: landing sections the compositor pans across (feature tiles stand in
// for the signed-in features), plus the MCP clients row and the docs page.
const fs = require('fs');
const path = require('path');
const { Recorder } = require('../lib/recorder.cjs');

(async () => {
  const rec = await Recorder.launch({ name: 'stills', scale: 3 });
  const out = rec.dir;
  await rec.goto('/welcome', { until: '#features' });
  await rec.page.evaluate(() => document.querySelector('#features').scrollIntoView());
  await rec.advance(1500);
  const shots = {};
  const grab = async (name, locator) => {
    const el = rec.page.locator(locator).first();
    await el.scrollIntoViewIfNeeded();
    await rec.advance(300);
    const box = await el.boundingBox();
    await el.screenshot({ path: path.join(out, `${name}.png`) });
    shots[name] = { width: box.width, height: box.height };
  };
  await grab('features', '#features');
  await grab('clients', 'section:has-text("Works with any MCP client")');
  // Individual tiles, for close-ups.
  const titles = ['History with real diffs', 'Share a live link', 'Linked to your repo', 'Teams and roles', 'Data inside components', 'Nest and drill in'];
  for (const t of titles) {
    const slug = t.toLowerCase().replace(/[^a-z]+/g, '-');
    await grab(`tile-${slug}`, `#features h3:text-is("${t}") >> xpath=ancestor::div[contains(@class,"bg-")][1]`);
  }
  await rec.goto('/language', { until: 'h1' });
  await rec.advance(500);
  await rec.page.screenshot({ path: path.join(out, 'language.png') });
  shots.language = { width: 1280, height: 720 };
  fs.writeFileSync(path.join(out, 'stills.json'), JSON.stringify(shots, null, 2));
  await rec.browser.close();
  console.log('stills', Object.keys(shots).join(' '));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
