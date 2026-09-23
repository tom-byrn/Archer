// Frame-exact recorder for the real Archer app.
//
// A fake page clock (Playwright) drives every JS timer and requestAnimationFrame,
// and every CSS animation/transition is paused and seeked to the same virtual
// time before each screenshot. So a shot renders identically however slow the
// machine is: each captured frame is exactly 1/fps of virtual time after the
// last, with scripted input (mouse paths, typing) applied between frames.
//
// Output per shot: out/shots/<name>/f00000.jpg … plus meta.json with the
// cursor track (position, button, CSS cursor per frame) and named marks, which
// the compositor uses to draw the cursor and sync overlays.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.ARCHER_URL || 'http://localhost:3000';

function requirePlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const { chromium } = requirePlaywright();

// Brand fonts. Google Fonts is unreachable from the recording box, so next/font
// falls back to system fonts; these local copies stand in for them (same
// families the app loads: Inter, Playfair Display, Newsreader) plus Geist Mono
// for the system monospace stack.
const FONT_DIR =
  process.env.FONT_MODULES ||
  [path.join(ROOT, 'node_modules', '@fontsource-variable'), path.join(ROOT, 'node_modules_fonts', '@fontsource-variable')].find((d) => fs.existsSync(d));
const FONT_FILES = {
  'inter.woff2': 'inter/files/inter-latin-wght-normal.woff2',
  'playfair.woff2': 'playfair-display/files/playfair-display-latin-wght-normal.woff2',
  'newsreader.woff2': 'newsreader/files/newsreader-latin-opsz-normal.woff2',
  'geistmono.woff2': 'geist-mono/files/geist-mono-latin-wght-normal.woff2',
};

const REC_CSS = `
@font-face{font-family:"Rec Inter";src:url(/__rec/inter.woff2) format("woff2");font-weight:100 900;font-display:block}
@font-face{font-family:"Rec Playfair";src:url(/__rec/playfair.woff2) format("woff2");font-weight:400 900;font-display:block}
@font-face{font-family:"Rec Newsreader";src:url(/__rec/newsreader.woff2) format("woff2");font-weight:200 800;font-display:block}
@font-face{font-family:"Rec Geist Mono";src:url(/__rec/geistmono.woff2) format("woff2");font-weight:100 900;font-display:block}
*,*::before,*::after{
  --font-inter:"Rec Inter"!important;
  --font-playfair:"Rec Playfair"!important;
  --font-newsreader:"Rec Newsreader"!important;
  --font-mono:"Rec Geist Mono",ui-monospace,monospace!important;
  animation-play-state:paused!important;
}
html{scroll-behavior:auto!important}
nextjs-portal{display:none!important}
`;

// Runs in every document before the app's own scripts.
function pageInit(css) {
  const addStyle = () => {
    if (document.getElementById('rec-css')) return;
    const s = document.createElement('style');
    s.id = 'rec-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  document.addEventListener('DOMContentLoaded', addStyle);

  const seen = new WeakMap();
  const rec = (window.__rec = {
    // Every CSS animation and transition: paused, and positioned at
    // (virtual now − the virtual time it was first seen).
    seek(v) {
      addStyle();
      for (const a of document.getAnimations()) {
        if (!seen.has(a)) {
          seen.set(a, v);
          try { a.pause(); } catch {}
        }
        try { a.currentTime = Math.max(0, v - seen.get(a)); } catch {}
      }
    },
    // The CSS cursor under a point, for drawing the right pointer.
    cursorAt(x, y) {
      let el = document.elementFromPoint(x, y);
      while (el && el.nodeType === 1) {
        const c = getComputedStyle(el).cursor;
        if (c && c !== 'auto') return c;
        const tag = el.tagName;
        if ((tag === 'INPUT' && !/^(button|submit|checkbox|radio)$/i.test(el.type)) || tag === 'TEXTAREA' || el.isContentEditable) return 'text';
        el = el.parentElement;
      }
      return 'default';
    },
    addCss(text, id) {
      let s = id && document.getElementById(id);
      if (!s) {
        s = document.createElement('style');
        if (id) s.id = id;
        document.head.appendChild(s);
      }
      s.textContent = text;
    },
  });

  // Smooth scrolling runs on the compositor's real clock; replace it with a
  // rAF tween so it follows the fake clock like everything else.
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tween = (el, top, left) => {
    const isWin = el === window;
    const sx = isWin ? window.scrollX : el.scrollLeft;
    const sy = isWin ? window.scrollY : el.scrollTop;
    const tx = left ?? sx;
    const ty = top ?? sy;
    const start = performance.now();
    const dur = 420;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const x = sx + (tx - sx) * ease(k);
      const y = sy + (ty - sy) * ease(k);
      if (isWin) origWinScrollTo.call(window, x, y);
      else { el.scrollLeft = x; el.scrollTop = y; }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const origElScrollTo = Element.prototype.scrollTo;
  const origWinScrollTo = window.scrollTo;
  Element.prototype.scrollTo = function (a, b) {
    if (a && typeof a === 'object' && a.behavior === 'smooth') return tween(this, a.top, a.left);
    return origElScrollTo.call(this, a, b);
  };
  window.scrollTo = function (a, b) {
    if (a && typeof a === 'object' && a.behavior === 'smooth') return tween(window, a.top, a.left);
    return origWinScrollTo.call(window, a, b);
  };
  rec.tween = tween;
}

const EASE = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
};

class Recorder {
  static async launch(opts) {
    const r = new Recorder(opts);
    await r._launch();
    return r;
  }

  constructor({ name, fps = 60, width = 1280, height = 720, scale = 2, scheme = 'light', quality = 92, outDir }) {
    Object.assign(this, { name, fps, width, height, scale, scheme, quality });
    this.dir = outDir || path.join(ROOT, 'out', 'shots', name);
    this.frame = 0; // frames captured so far
    this.v = 0; // virtual ms since capture start
    this.mouse = { x: -100, y: -100, down: false, visible: false };
    this.track = [];
    this.marks = [];
    this.capturing = false;
  }

  async _launch() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.browser = await chromium.launch({ args: ['--font-render-hinting=none', '--hide-scrollbars'] });
    this.ctx = await this.browser.newContext({
      viewport: { width: this.width, height: this.height },
      deviceScaleFactor: this.scale,
      colorScheme: this.scheme,
    });
    await this.ctx.route(/clerk\.example\.com|convex\.cloud|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await this.ctx.route('**/__rec/*.woff2', (r) => {
      const file = FONT_FILES[path.basename(new URL(r.request().url()).pathname)];
      return r.fulfill({ path: path.join(FONT_DIR, file), contentType: 'font/woff2' });
    });
    await this.ctx.addInitScript(pageInit, REC_CSS);
    this.page = await this.ctx.newPage();
    this.cdp = await this.ctx.newCDPSession(this.page);
    this.t0 = Date.parse('2026-09-23T09:00:00Z');
    await this.page.clock.install({ time: this.t0 });
    await this.page.clock.pauseAt(this.t0 + 1000);
    this.clockAt = 1000; // virtual ms since install, before capture starts
  }

  /**
   * Navigate, then wait until `until` (a selector, or a function of the page
   * returning truthy) holds. While waiting, virtual time creeps forward in
   * 16ms steps so rAF/timer-driven boot code (React Flow, lazy chunks) can
   * finish; pass `creep: false` for pages whose first frames must stay at t=0.
   */
  async goto(url, { until, creep = true, primeMs = 0, timeout = 120000 } = {}) {
    await this.page.goto(url.startsWith('http') ? url : BASE_URL + url, { waitUntil: 'load', timeout: 240000 });
    await this.page.evaluate(() => document.fonts.ready);
    const check = async () => {
      if (!until) return true;
      if (typeof until === 'string') return (await this.page.locator(until).count()) > 0 && this.page.locator(until).first().isVisible();
      return until(this.page);
    };
    const deadline = Date.now() + timeout;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(`goto ${url}: not ready`);
      if (creep) {
        await this.page.clock.runFor(16);
        await this.flush();
      }
      await this.page.waitForTimeout(25);
    }
    await this.page.evaluate(() => document.fonts.ready);
    await this.page.waitForTimeout(300);
    if (primeMs) await this.advance(primeMs);
  }

  /** Advance virtual time without capturing, letting the page react between steps. */
  async advance(ms) {
    const steps = Math.ceil(ms / 16);
    for (let i = 0; i < steps; i++) {
      await this.page.clock.runFor(16);
      await this.flush();
    }
  }

  async flush() {
    // Two macrotask round-trips: lets React (MessageChannel-scheduled) commit.
    await this.page.evaluate(
      () =>
        new Promise((r) => {
          const c = new MessageChannel();
          let n = 0;
          c.port1.onmessage = () => (++n === 2 ? r() : c.port2.postMessage(0));
          c.port2.postMessage(0);
        }),
    );
  }

  /** Capture one frame, then advance the clock by one frame. */
  async tick() {
    await this.flush();
    await this.page.evaluate((v) => window.__rec.seek(v), this.v);
    const { data } = await this.cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: this.quality,
      optimizeForSpeed: true,
    });
    fs.writeFileSync(path.join(this.dir, `f${String(this.frame).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    const m = this.mouse;
    let style = 'default';
    if (m.visible && m.x >= 0 && m.y >= 0) style = await this.page.evaluate(([x, y]) => window.__rec.cursorAt(x, y), [m.x, m.y]);
    this.track.push([+m.x.toFixed(2), +m.y.toFixed(2), m.down ? 1 : 0, m.visible ? 1 : 0, style]);
    this.frame++;
    const before = Math.round(((this.frame - 1) * 1000) / this.fps);
    const after = Math.round((this.frame * 1000) / this.fps);
    this.v = (this.frame * 1000) / this.fps;
    await this.page.clock.runFor(after - before);
  }

  /** Capture frames for `ms` of virtual time. */
  async hold(ms) {
    const n = Math.round((ms * this.fps) / 1000);
    for (let i = 0; i < n; i++) await this.tick();
  }

  mark(name, data) {
    this.marks.push({ name, frame: this.frame, data });
  }

  /** Put the cursor somewhere without capturing (e.g. before the first frame). */
  async place(x, y, visible = true) {
    this.mouse = { ...this.mouse, x, y, visible };
    await this.page.mouse.move(x, y);
  }

  async hideCursor() {
    this.mouse.visible = false;
  }

  /** Move along an eased path, one frame per step (a slight arc looks hand-made). */
  async move(x, y, { ms = 700, ease = 'inOutCubic', arc = 0.08 } = {}) {
    const n = Math.max(1, Math.round((ms * this.fps) / 1000));
    const { x: x0, y: y0 } = this.mouse;
    const dx = x - x0;
    const dy = y - y0;
    const f = EASE[ease];
    this.mouse.visible = true;
    for (let i = 1; i <= n; i++) {
      const k = f(i / n);
      const bow = Math.sin(Math.PI * k) * arc;
      const px = x0 + dx * k - dy * bow;
      const py = y0 + dy * k + dx * bow;
      this.mouse.x = px;
      this.mouse.y = py;
      await this.page.mouse.move(px, py);
      await this.tick();
    }
  }

  async down() {
    this.mouse.down = true;
    await this.page.mouse.down();
  }

  async up() {
    this.mouse.down = false;
    await this.page.mouse.up();
  }

  async click({ holdMs = 90, after = 0 } = {}) {
    await this.down();
    await this.hold(holdMs);
    await this.up();
    if (after) await this.hold(after);
  }

  async dblclick() {
    await this.page.mouse.dblclick(this.mouse.x, this.mouse.y);
    await this.hold(60);
  }

  async key(combo, { after = 0 } = {}) {
    await this.page.keyboard.press(combo);
    if (after) await this.hold(after);
  }

  /** Type like a person: per-character delays with jitter, pauses after punctuation. */
  async type(text, { cps = 16, jitter = 0.35, seed = 7 } = {}) {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const base = 1000 / cps;
    let carry = 0;
    for (const ch of text) {
      if (ch === '\n') await this.page.keyboard.press('Enter');
      else await this.page.keyboard.type(ch);
      let ms = base * (1 + (rand() * 2 - 1) * jitter);
      if (/[.,:;]/.test(ch)) ms += base * 2;
      if (ch === '\n') ms += base * 3;
      carry += (ms * this.fps) / 1000;
      const frames = Math.floor(carry);
      carry -= frames;
      for (let i = 0; i < frames; i++) await this.tick();
    }
  }

  async css(text, id = 'rec-extra') {
    await this.page.evaluate(([t, i]) => window.__rec.addCss(t, i), [text, id]);
  }

  /** Bounding box (CSS px) of the first element matching `selector`. */
  async box(selector) {
    const b = await this.page.locator(selector).first().boundingBox();
    if (!b) throw new Error(`no box for ${selector}`);
    return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }

  /** Scroll the window to `y` over `ms`, one frame per step. */
  async scroll(y, { ms = 900, ease = 'inOutCubic' } = {}) {
    const y0 = await this.page.evaluate(() => window.scrollY);
    const n = Math.max(1, Math.round((ms * this.fps) / 1000));
    for (let i = 1; i <= n; i++) {
      const k = EASE[ease](i / n);
      await this.page.evaluate((yy) => window.scrollTo(0, yy), y0 + (y - y0) * k);
      await this.tick();
    }
  }

  /** Run a CodeMirror transaction on the (first) open editor. */
  async cm(fn, arg) {
    return this.page.evaluate(
      ([src, a]) => {
        const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
        if (!view) throw new Error('no CodeMirror view');
        // eslint-disable-next-line no-new-func
        return new Function('view', 'arg', src)(view, a);
      },
      [fn, arg],
    );
  }

  async finish(extra = {}) {
    const meta = {
      name: this.name,
      fps: this.fps,
      width: this.width,
      height: this.height,
      scale: this.scale,
      frames: this.frame,
      track: this.track,
      marks: this.marks,
      ...extra,
    };
    fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify(meta));
    await this.browser.close();
    console.log(`[${this.name}] ${this.frame} frames (${(this.frame / this.fps).toFixed(2)}s) → ${this.dir}`);
    return meta;
  }
}

module.exports = { Recorder, EASE, BASE_URL, ROOT };
