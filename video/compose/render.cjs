// Render the stage (stage.html) frame by frame and encode it.
//
//   node compose/render.cjs                      → out/video-only.mp4 (no audio; make.sh muxes it)
//   node compose/render.cjs --from 26 --to 38    → a section
//   node compose/render.cjs --stills 7.5,20,33   → out/preview/t-<t>.jpg for review
//
// A tiny static server exposes the stage, the recorded shots and the fonts;
// each frame is renderAt(t) in the page, then a CDP screenshot piped to ffmpeg.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FV =
  process.env.FONT_MODULES ||
  [path.join(ROOT, 'node_modules', '@fontsource-variable'), path.join(ROOT, 'node_modules_fonts', '@fontsource-variable')].find((d) => fs.existsSync(d));

function requirePlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

// Any ffmpeg with libx264.
const ffmpegPath = () => process.env.FFMPEG || 'ffmpeg';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function serve() {
  const routes = [
    ['/shots/', path.join(ROOT, 'out', 'shots')],
    ['/fonts/', FV],
    ['/', __dirname],
  ];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const [prefix, dir] = routes.find(([p]) => url.startsWith(p));
    const file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : d;
  };
  return {
    from: Number(get('--from', 0)),
    to: get('--to', null),
    fps: Number(get('--fps', 60)),
    stills: get('--stills', null),
    thumbnail: a.includes('--thumbnail'),
    out: get('--out', path.join(ROOT, 'out', 'video-only.mp4')),
    crf: get('--crf', '16'),
  };
}

(async () => {
  const opt = args();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[stage]', m.text()));
  page.on('pageerror', (e) => console.error('[stage error]', e.message));
  if (opt.thumbnail) {
    await page.goto(`${base}/thumbnail.html`);
    await page.waitForFunction(() => window.thumbReady === true, null, { timeout: 60000 });
    const out = path.join(ROOT, 'out', 'thumbnail.png');
    await page.screenshot({ path: out });
    console.log('thumbnail →', out);
    await browser.close();
    server.close();
    return;
  }
  await page.goto(`${base}/stage.html`);
  await page.waitForFunction(() => window.stageReady === true, null, { timeout: 60000 });
  const duration = await page.evaluate(() => window.DURATION);
  const cdp = await page.context().newCDPSession(page);
  const shoot = async (q = 95) => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: q, optimizeForSpeed: true })).data, 'base64');

  if (opt.stills) {
    const dir = path.join(ROOT, 'out', 'preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of opt.stills.split(',').map(Number)) {
      await page.evaluate((tt) => window.renderAt(tt), t);
      fs.writeFileSync(path.join(dir, `t-${t.toFixed(2)}.jpg`), await shoot(92));
    }
    console.log('stills →', dir);
    await browser.close();
    server.close();
    return;
  }

  const to = opt.to === null ? duration : Math.min(duration, Number(opt.to));
  const first = Math.round(opt.from * opt.fps);
  const last = Math.round(to * opt.fps);
  const ff = spawn(ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt.crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-movflags', '+faststart', opt.out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let f = first; f < last; f++) {
    await page.evaluate((tt) => window.renderAt(tt), f / opt.fps);
    const buf = await shoot();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - first) % 300 === 0) {
      const done = f - first;
      const rate = done / Math.max(1, (Date.now() - started) / 1000);
      process.stdout.write(`frame ${f}/${last} (${rate.toFixed(1)} fps)\n`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const events = await page.evaluate(() => window.stageEvents || []);
  fs.writeFileSync(path.join(ROOT, 'out', 'events.json'), JSON.stringify(events, null, 2));
  console.log(`rendered ${last - first} frames in ${((Date.now() - started) / 1000).toFixed(0)}s → ${opt.out}`);
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
