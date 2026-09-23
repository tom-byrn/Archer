// Shot: the landing hero from first paint — headline rises, the agent
// prompt types itself, then "Copy prompt".
const { Recorder } = require('../lib/recorder.cjs');

(async () => {
  const rec = await Recorder.launch({ name: 'hero', scale: 3 });
  await rec.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await rec.goto('/welcome', { until: 'h1', creep: false });
  await rec.hold(6200);
  const copy = await rec.page.getByRole('button', { name: 'Copy prompt' }).boundingBox();
  await rec.place(1180, 690);
  await rec.move(copy.x + copy.width / 2, copy.y + copy.height / 2, { ms: 1100 });
  await rec.hold(200);
  rec.mark('copy');
  await rec.click({ after: 1500 });
  await rec.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
