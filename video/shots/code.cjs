// Shot: edit the code. Open the .arch source, declare Embeddings inside
// Storage, then connect the Recommender to it — with a typo first, so the
// validator's E101 shows, then the fix. Close the code and the canvas has it.
const { Recorder } = require('../lib/recorder.cjs');
const { D, editorWith } = require('./common.cjs');

/** Scroll the code so `needle`'s line sits at `frac` of the editor height, over `ms`. */
async function scrollCodeTo(rec, needle, { frac = 0.3, ms = 700 } = {}) {
  const top = await rec.cm(
    `const line = view.state.doc.toString().split('\\n').findIndex((l) => l.includes(arg.needle)) + 1;
     const block = view.lineBlockAt(view.state.doc.line(line).from);
     return Math.max(0, block.top - view.scrollDOM.clientHeight * arg.frac);`,
    { needle, frac },
  );
  await rec.page.evaluate((t) => window.__rec.tween(document.querySelector('.cm-scroller'), t), top);
  await rec.hold(ms);
}

/** Screen point just past the end of the line `offset` lines after the one containing `needle`. */
async function lineEndPoint(rec, needle, offset = 0) {
  return rec.cm(
    `const n = view.state.doc.toString().split('\\n').findIndex((l) => l.includes(arg.needle)) + 1 + arg.offset;
     const line = view.state.doc.line(n);
     const c = view.coordsAtPos(line.to);
     return { x: c.right + 36, y: (c.top + c.bottom) / 2 };`,
    { needle, offset },
  );
}

(async () => {
  const rec = await Recorder.launch({ name: 'code', scale: 3 });
  await rec.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await editorWith(rec, D.full());
  await rec.place(760, 610);

  await rec.hold(500);
  const code = await rec.page.getByRole('button', { name: /^Code/ }).boundingBox();
  await rec.move(code.x + code.width / 2, code.y + code.height / 2, { ms: 750 });
  await rec.click({ after: 450 });
  rec.mark('open');

  // Declare the component inside Storage.
  await scrollCodeTo(rec, 'component storage "Storage"', { frac: 0.25 });
  // Catalog DB's closing brace: the line after its desc.
  const brace = await lineEndPoint(rec, 'desc "Postgres. The source of truth for metadata."', 1);
  await rec.move(brace.x, brace.y, { ms: 650 });
  await rec.click({ after: 200 });
  await rec.key('End');
  await rec.key('Enter');
  rec.mark('typeComponent');
  await rec.type('component embeddings "Embeddings" @pinecone', { cps: 19 });
  await rec.hold(500);

  // Connect it, with a typo.
  await scrollCodeTo(rec, 'services.playback -> services.subscriptions', { frac: 0.3 });
  const after = await lineEndPoint(rec, 'services.playback -> services.subscriptions');
  await rec.move(after.x, after.y, { ms: 650 });
  await rec.click({ after: 200 });
  await rec.key('End');
  await rec.key('Enter');
  rec.mark('typeConnection');
  await rec.type('services.recs -> storage.embedings', { cps: 19 });
  rec.mark('typo');
  await rec.hold(1500);
  for (let i = 0; i < 4; i++) {
    await rec.key('Backspace');
    await rec.hold(70);
  }
  await rec.type('dings', { cps: 14 });
  rec.mark('fixed');
  await rec.type(' @reads', { cps: 19 });
  await rec.hold(700);

  // Back to the canvas.
  rec.mark('close');
  await rec.key('Escape', { after: 350 });
  await rec.move(560, 655, { ms: 600 });
  await rec.click({ after: 250 });
  rec.mark('canvas');
  await rec.hold(1600);
  await rec.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
