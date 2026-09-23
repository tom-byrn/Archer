// Shot: ⌘K, search the catalog, Enter — the component lands on the canvas.
const { Recorder } = require('../lib/recorder.cjs');
const { D, editorWith, withEmbeddings } = require('./common.cjs');

(async () => {
  const rec = await Recorder.launch({ name: 'cmdk', scale: 3 });
  await editorWith(rec, withEmbeddings(D.full()));
  await rec.hold(500);
  rec.mark('open');
  await rec.key('Control+k', { after: 350 });
  rec.mark('type');
  await rec.type('anthropic', { cps: 11 });
  await rec.hold(650);
  rec.mark('enter');
  await rec.key('Enter');
  await rec.hold(1800);
  await rec.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
