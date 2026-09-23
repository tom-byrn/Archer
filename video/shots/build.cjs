// Shot: the agent writes architecture.arch and the canvas draws it.
//
// The editor's code modal stays open but invisible; each completed
// declaration is written into it (the same path typing takes), so every
// frame is the real canvas rendering the file so far. The layout block is in
// the document from the start (agents never write it; the canvas does), so
// components land where they will stay.
//
// Marks: one "chunk" per declaration with the text the agent typed and the
// frames it typed it over; the compositor replays that text in its code card.
const { Recorder } = require('../lib/recorder.cjs');
const { D, editorWith, openCode, hideCodeModal, setSource } = require('./common.cjs');

const P = D.parts;
const LEAD_MS = 450;
const TAIL_MS = 1400;

// [text the agent types, ms to type it, components so far (for the real doc)]
function plan() {
  const steps = [];
  const comps = [];
  const conns = [];
  const snapshot = () =>
    `${D.HEADER}\n\n${comps.join('\n\n')}${comps.length ? '\n\n' : ''}${conns.join('\n')}${conns.length ? '\n\n' : ''}${D.LAYOUT}\n`;
  const add = (typed, ms, apply) => {
    apply();
    steps.push({ typed, ms, source: snapshot() });
  };
  add(`${D.HEADER}\n\n`, 260, () => {});
  add(`${P.APPS}\n\n`, 420, () => comps.push(P.APPS));
  add(`${P.AUTH}\n\n`, 300, () => comps.push(P.AUTH));
  add(`${P.GATEWAY}\n\n`, 300, () => comps.push(P.GATEWAY));
  add(`${P.CDN}\n\n`, 300, () => comps.push(P.CDN));
  const svc = [D.parts.SERVICES_OPEN, P.PLAYBACK];
  const services = () => [...svc, '}'].join('\n');
  add(`${P.SERVICES_OPEN}\n${P.PLAYBACK}\n`, 1000, () => comps.push(services()));
  for (const child of [P.CATALOG, P.RECS]) {
    add(`${child}\n`, 280, () => {
      svc.push(child);
      comps[comps.length - 1] = services();
    });
  }
  add(`${P.SUBSCRIPTIONS}\n}\n\n`, 330, () => {
    svc.push(P.SUBSCRIPTIONS);
    comps[comps.length - 1] = services();
  });
  for (const [part, ms] of [[P.STORAGE, 300], [P.EVENTS, 260], [P.WAREHOUSE, 190], [P.STRIPE, 190]]) {
    add(`${part}\n\n`, ms, () => comps.push(part));
  }
  for (const line of D.CONNECTION_LINES) add(`${line}\n`, 165, () => conns.push(line));
  return steps;
}

(async () => {
  const rec = await Recorder.launch({ name: 'build', scale: 3 });
  await editorWith(rec, D.full());
  await openCode(rec);
  await hideCodeModal(rec);
  // This shot is shown cropped to the diagram; the zoom controls would sit in its corner.
  await rec.css('.react-flow__controls{display:none!important}', 'rec-no-controls');
  const steps = plan();
  await setSource(rec, `${D.HEADER}\n\n${D.LAYOUT}\n`);
  await rec.advance(300);

  // Frame at which each step's typing ends (its declaration lands on the canvas).
  let t = LEAD_MS;
  const due = steps.map((s) => {
    const start = t;
    t += s.ms;
    return { ...s, startMs: start, endMs: t };
  });
  const total = t + TAIL_MS;
  let next = 0;
  while (rec.v < total) {
    while (next < due.length && due[next].endMs <= rec.v) {
      const s = due[next];
      await setSource(rec, s.source);
      rec.mark('chunk', {
        i: next,
        typed: s.typed,
        startFrame: Math.round((s.startMs * rec.fps) / 1000),
        endFrame: Math.round((s.endMs * rec.fps) / 1000),
      });
      next++;
    }
    await rec.tick();
  }
  await rec.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
