// Shot: double-click Services to drill in, then open Playback's details
// (description, source path, and its validated table + YAML payloads).
const { Recorder } = require('../lib/recorder.cjs');
const { D, editorWith, withEmbeddings } = require('./common.cjs');

(async () => {
  const rec = await Recorder.launch({ name: 'drill', scale: 3 });
  const source = withEmbeddings(D.full()).replace(
    'component stripe "Stripe" @stripe',
    'component stripe "Stripe" @stripe\n\ncomponent anthropic @anthropic',
  );
  await editorWith(rec, source);
  const plane = await rec.box('.react-flow__node[data-id="services"]');
  await rec.place(plane.x + plane.width * 0.55, plane.y + plane.height + 140);
  await rec.hold(400);
  // The plane's title row, clear of its children.
  await rec.move(plane.x + 90, plane.y + 10, { ms: 800 });
  await rec.hold(150);
  rec.mark('dblclick');
  await rec.dblclick();
  await rec.hold(900);
  rec.mark('drilled');
  const pb = await rec.box('.react-flow__node[data-id="services.playback"]');
  await rec.move(pb.cx, pb.cy, { ms: 700 });
  await rec.click({ after: 700 });
  rec.mark('details');
  // Scroll the inspector down to the payloads.
  const scrolled = await rec.page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find((el) => el.childElementCount === 0 && el.textContent.trim() === 'Payloads');
    let el = heading;
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (!el) return null;
    window.__rec.tween(el, heading.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12);
    return true;
  });
  if (!scrolled) console.warn('inspector: no scroll container found');
  await rec.move(pb.cx + 150, pb.cy + 170, { ms: 900 });
  await rec.hold(2200);
  await rec.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
