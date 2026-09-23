// Shared setup for the editor shots.
const D = require('./doc.cjs');

const EDITOR_URL = '/sandbox/music-streaming';

/** Replace the whole editor source (programmatic: no caret move, no selection). */
async function setSource(rec, text) {
  await rec.cm('view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: arg } })', text);
}

async function openCode(rec) {
  if ((await rec.page.locator('.cm-content').count()) === 0) {
    await rec.page.getByRole('button', { name: /^Code/ }).click();
    await rec.page.waitForSelector('.cm-content');
  }
}

async function closeCode(rec) {
  if ((await rec.page.locator('.cm-content').count()) > 0) {
    await rec.page.keyboard.press('Escape');
    await rec.page.waitForSelector('.cm-content', { state: 'detached' });
  }
}

/**
 * Open the editor on `source` with the canvas fitted to it, ready to capture.
 * Nothing here is captured: the clock creeps only as far as the app needs.
 */
async function editorWith(rec, source) {
  await rec.goto(EDITOR_URL, { until: '.react-flow__node' });
  await openCode(rec);
  await setSource(rec, source);
  await closeCode(rec);
  await rec.advance(200);
  await rec.page.locator('.react-flow__controls-fitview').click();
  await rec.advance(400);
}

/** Keep the code modal open but invisible (and click-through). */
async function hideCodeModal(rec) {
  await rec.page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-modal]');
    dlg.parentElement.setAttribute('data-rec-hidden', '');
  });
  await rec.css('[data-rec-hidden]{opacity:0!important;pointer-events:none!important}', 'rec-hide-modal');
}

/** The code edit the "code" shot types, applied in one go (for later shots). */
function withEmbeddings(src) {
  return src
    .replace(
      '    desc "Postgres. The source of truth for metadata."\n  }\n}',
      '    desc "Postgres. The source of truth for metadata."\n  }\n  component embeddings "Embeddings" @pinecone\n}',
    )
    .replace(
      'services.playback -> services.subscriptions @grpc : "entitlements"',
      'services.playback -> services.subscriptions @grpc : "entitlements"\nservices.recs -> storage.embeddings @reads',
    );
}

module.exports = { D, EDITOR_URL, setSource, openCode, closeCode, editorWith, hideCodeModal, withEmbeddings };
