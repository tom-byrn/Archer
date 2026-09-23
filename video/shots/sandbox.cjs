// Shot: the landing page's sandbox, canvas beside its source. Drag a box and
// its layout line changes; retype Postgres as Neon and its declaration does.
const { Recorder } = require('../lib/recorder.cjs');

(async () => {
  const rec = await Recorder.launch({ name: 'sandbox', scale: 3 });
  await rec.goto('/welcome', { until: '.landing-canvas .react-flow__node[data-id="billing"]' });
  // Center the sandbox in the viewport.
  const top = await rec.page.evaluate(() => {
    const box = document.querySelector('.landing-canvas').closest('.shadow-md');
    const r = box.getBoundingClientRect();
    return window.scrollY + r.top - (window.innerHeight - r.height) / 2;
  });
  await rec.page.evaluate((y) => window.scrollTo(0, y), top);
  await rec.advance(500);
  rec.meta = { sandboxBox: await rec.box('.landing-canvas') };

  const billing = await rec.box('.landing-canvas .react-flow__node[data-id="billing"]');
  await rec.place(billing.cx + 160, billing.cy + 150);
  await rec.hold(500);
  await rec.move(billing.cx, billing.cy, { ms: 700 });
  await rec.hold(120);
  rec.mark('drag');
  await rec.down();
  await rec.hold(80);
  await rec.move(billing.cx - 4, billing.cy + 84, { ms: 750, arc: 0.03 });
  await rec.hold(100);
  await rec.up();
  rec.mark('dropped');
  await rec.hold(1300);

  const db = await rec.box('.landing-canvas .react-flow__node[data-id="db"]');
  await rec.move(db.cx, db.cy, { ms: 700 });
  await rec.click({ after: 500 });
  rec.mark('selected');
  const neon = await rec.box('.landing-canvas button[aria-pressed]:has-text("Neon")');
  await rec.move(neon.cx, neon.cy, { ms: 700 });
  await rec.hold(150);
  rec.mark('retype');
  await rec.click({ after: 1500 });
  await rec.finish({ sandboxBox: rec.meta.sandboxBox });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
