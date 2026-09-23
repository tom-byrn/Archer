/* The edit. renderAt(t) puts the stage in its state at t seconds; render.cjs
 * captures it frame by frame. Scenes sit on a 100 BPM grid (bar = 2.4 s) so
 * cuts land on the music's downbeats.
 *
 * Footage comes from out/shots/<name>/ (recorded by shots/*.cjs): frames are
 * the real app at 1280×720 CSS px; meta.json has the cursor track and marks.
 */
(() => {
  const FPS = 60;
  const BAR = 2.4;
  const at = (bar, beat = 0) => (bar - 1) * BAR + beat * 0.6;
  const DURATION = at(43); // 100.8 s: bars 1–42

  /* ------------------------------------------------------------ helpers */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    linear: (t) => t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    in: (t) => t * t * t,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  };
  /** Piecewise keyframes: [[t, {k: v, …}], …] → interpolated object (eased per segment). */
  const keys = (t, frames, ease = E.inOut) => {
    if (t <= frames[0][0]) return { ...frames[0][1] };
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1] = frames[i];
      const [t0, v0] = frames[i - 1];
      if (t <= t1) {
        const k = (frames[i][2] || ease)(prog(t, t0, t1));
        const o = {};
        for (const key of Object.keys(v1)) o[key] = lerp(v0[key] ?? v1[key], v1[key], k);
        return o;
      }
    }
    return { ...frames[frames.length - 1][1] };
  };
  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const css = (e, o) => {
    for (const [k, v] of Object.entries(o)) e.style[k] = v;
  };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pad = (n) => String(n).padStart(5, '0');
  const stage = document.getElementById('stage');
  const events = (window.stageEvents = []);

  /* ------------------------------------------------ syntax highlighting */
  // The landing SourcePane's tokenizer (components/landing/SourcePane.tsx).
  const TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*")|(@[\w.-]+)|(->|<->|--)|\b(arch|component|layout|desc|src|at|size|display)\b|\b(v\d[\d.]*)\b|(-?\b\d+\b)|(```)/g;
  const CLS = ['tok-comment', 'tok-string', 'tok-type', 'tok-arrow', 'tok-kw', 'tok-version', 'tok-num', 'tok-fence'];
  const highlight = (line) => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
      const i = m.index;
      if (i > last) out += esc(line.slice(last, i));
      const g = m.slice(1).findIndex((x) => x !== undefined);
      out += `<span class="${CLS[g]}">${esc(m[0])}</span>`;
      last = i + m[0].length;
    }
    return out + esc(line.slice(last));
  };

  /* --------------------------------------------------------- footage */
  const metas = {};
  async function loadMetas(names) {
    await Promise.all(names.map(async (n) => (metas[n] = await (await fetch(`/shots/${n}/meta.json`)).json())));
  }

  const ARROW = `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2.2 L3 20.6 L7.9 16.1 L11.1 23.4 L14.2 22 L11.1 14.9 L17.8 14.9 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const HAND = `<svg width="26" height="26" viewBox="0 0 26 26" style="left:-8px;top:-2px"><path d="M9.2 12.3 V4.3 a1.75 1.75 0 0 1 3.5 0 V11 a1.7 1.7 0 0 1 3.4 0 v1 a1.7 1.7 0 0 1 3.4 0 v1.2 a1.6 1.6 0 0 1 3.2 0 v5.3 c0 3.4 -2.4 6 -6 6 h-2.6 c-2.2 0 -3.6 -0.9 -4.8 -2.6 l-3.9 -5.6 a1.8 1.8 0 0 1 2.7 -2.3 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const IBEAM = `<svg width="26" height="26" viewBox="0 0 26 26" style="left:-6px;top:-11px"><path d="M8 3 h2.5 c1.1 0 1.8 .6 2.5 1.3 c.7 -.7 1.4 -1.3 2.5 -1.3 H18 M13 4.3 V21.7 M8 23 h2.5 c1.1 0 1.8 -.6 2.5 -1.3 c.7 .7 1.4 1.3 2.5 1.3 H18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M8 3 h2.5 c1.1 0 1.8 .6 2.5 1.3 c.7 -.7 1.4 -1.3 2.5 -1.3 H18 M13 4.3 V21.7 M8 23 h2.5 c1.1 0 1.8 -.6 2.5 -1.3 c.7 .7 1.4 1.3 2.5 1.3 H18" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  /**
   * A viewport onto one shot. `rect` is where it sits on the stage (px);
   * the camera looks at app point (cx, cy) with `zoom` relative to fitting
   * the whole 1280×720 app in the rect.
   */
  class Shot {
    constructor(parent, name, { windowed = false, crop = null, bg = null } = {}) {
      this.name = name;
      this.crop = crop;
      this.root = el('div', `shot${windowed ? ' windowed' : ''}`, parent);
      this.cam = el('div', 'cam', this.root);
      this.img = el('img', 'frame', this.cam);
      this.ripple = el('div', 'ripple', this.cam);
      this.cursor = el('div', 'cursor', this.cam, ARROW);
      this.cursorKind = 'arrow';
      this.frame = -1;
      if (bg) this.root.style.background = bg;
      if (crop) this.img.style.clipPath = `inset(${crop.y}px ${1280 - crop.x - crop.w}px ${720 - crop.y - crop.h}px ${crop.x}px)`;
    }

    get meta() {
      return metas[this.name];
    }

    place(rect) {
      css(this.root, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      this.rect = rect;
    }

    /** Camera: look at (cx, cy) app px at `zoom` (1 = whole app fits the rect). */
    look({ cx = 640, cy = 360, zoom = 1 }, { free = false } = {}) {
      const { w, h } = this.rect;
      const fit = Math.min(w / 1280, h / 720);
      const s = fit * zoom;
      // Keep the camera inside the app frame (or the crop).
      const b = this.crop || { x: 0, y: 0, w: 1280, h: 720 };
      const hw = w / (2 * s);
      const hh = h / (2 * s);
      const x = free ? cx : hw * 2 >= b.w ? b.x + b.w / 2 : clamp(cx, b.x + hw, b.x + b.w - hw);
      const y = free ? cy : hh * 2 >= b.h ? b.y + b.h / 2 : clamp(cy, b.y + hh, b.y + b.h - hh);
      this.scale = s;
      this.cam.style.transform = `translate(${w / 2 - x * s}px, ${h / 2 - y * s}px) scale(${s})`;
      this.cursor.style.transform = `scale(${1 / Math.pow(s, 0.55)})`;
    }

    /** Show source frame `f`; resolves once the image is decoded. */
    async show(f, t, { cursor = true } = {}) {
      const m = this.meta;
      f = clamp(Math.round(f), 0, m.frames - 1);
      if (f !== this.frame) {
        this.frame = f;
        this.img.src = `/shots/${this.name}/f${pad(f)}.jpg`;
        await this.img.decode().catch(() => {});
      }
      const [x, y, down, visible, style] = m.track[f];
      this.cursor.style.display = visible && cursor ? 'block' : 'none';
      this.cursor.style.left = `${x}px`;
      this.cursor.style.top = `${y}px`;
      const kind = style === 'pointer' ? 'hand' : style === 'text' ? 'ibeam' : 'arrow';
      if (kind !== this.cursorKind) {
        this.cursor.innerHTML = kind === 'hand' ? HAND : kind === 'ibeam' ? IBEAM : ARROW;
        this.cursorKind = kind;
      }
      // Click ripple: find the last press at or before f (double-clicks are marks).
      let press = -1;
      for (let i = f; i >= Math.max(0, f - 30); i--) {
        if ((m.track[i][2] && (i === 0 || !m.track[i - 1][2])) || m.marks.some((mk) => mk.name === 'dblclick' && mk.frame === i)) {
          press = i;
          break;
        }
      }
      if (press >= 0 && visible && cursor) {
        const k = (f - press) / 22;
        const [px, py] = m.track[press];
        css(this.ripple, { left: `${px}px`, top: `${py}px`, opacity: String(0.9 * (1 - k)), transform: `scale(${0.35 + 0.9 * E.out(k)})` });
        if (f === press && t !== undefined && !events.some((e) => e.shot === this.name && e.frame === press)) events.push({ type: 'click', t, shot: this.name, frame: press });
      } else this.ripple.style.opacity = '0';
    }

    mark(name, n = 0) {
      return this.meta.marks.filter((m) => m.name === name)[n].frame;
    }
  }

  /* -------------------------------------------------------- typography */
  /** Words that rise in one after another (the landing's load sequence), and leave together. */
  class Words {
    constructor(parent, html, cls, style = {}) {
      this.root = el('div', cls, parent);
      css(this.root, style);
      // Keep <em> runs intact: split on spaces outside tags.
      const parts = html.match(/<br>|<em>.*?<\/em>|[^\s<]+/g);
      this.words = [];
      parts.forEach((p, i) => {
        if (p === '<br>') {
          el('br', '', this.root);
          return;
        }
        this.words.push(el('span', 'w', this.root, p + (i < parts.length - 1 && parts[i + 1] !== '<br>' ? ' ' : '')));
      });
    }

    render(t, tin, tout, { stagger = 0.075, dur = 0.7, rise = 26, outDur = 0.4 } = {}) {
      const visible = t >= tin - 0.01 && t <= tout + outDur;
      this.root.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      const out = E.inOut(prog(t, tout, tout + outDur));
      this.words.forEach((w, i) => {
        const k = E.out(prog(t, tin + i * stagger, tin + i * stagger + dur));
        w.style.opacity = String(k * (1 - out));
        w.style.transform = `translateY(${(1 - k) * rise - out * 14}px)`;
        w.style.filter = k < 1 ? `blur(${(1 - k) * 5}px)` : 'none';
      });
    }
  }

  /** A lower-third caption over footage, with its paper scrim. */
  class Captions {
    constructor(parent, items) {
      this.scrims = { bottom: el('div', 'scrim', parent), top: el('div', 'scrim top', parent) };
      this.items = items.map(([tin, tout, html, pos = 'bottom']) => {
        const w = new Words(parent, html, `caption ${pos}`);
        return { tin, tout, pos, w };
      });
    }

    render(t) {
      const any = { bottom: 0, top: 0, right: 0 };
      for (const it of this.items) {
        it.w.render(t, it.tin, it.tout, { stagger: 0.06, dur: 0.55, rise: it.pos === 'top' ? -18 : 18, outDur: 0.3 });
        if (it.pos === 'right') continue;
        any[it.pos] = Math.max(any[it.pos], prog(t, it.tin - 0.3, it.tin) * (1 - prog(t, it.tout + 0.1, it.tout + 0.5)));
      }
      for (const k of ['bottom', 'top']) this.scrims[k].style.opacity = String(E.inOut(any[k]));
    }
  }

  /* ------------------------------------------------------------ scenes */
  const scenes = [];
  const scene = (name, t0, t1, build) => {
    const root = el('div', `layer scene-${name}`, stage);
    const s = { name, t0, t1, root, pre: 0.6, post: 0.6 };
    Object.assign(s, build(root, s));
    scenes.push(s);
    return s;
  };

  // Paper behind everything.
  const paper = el('div', 'layer paper', stage);

  /* 1 · Hook ------------------------------------------------------------ */
  scene('hook', 0, at(4), (root) => {
    const l1 = new Words(root, 'Your agents write the code.', 'statement', { top: '470px', fontSize: '108px' });
    const l2 = new Words(root, 'But can they see the <em>architecture?</em>', 'statement', { top: '470px', fontSize: '108px' });
    return {
      async render(t) {
        l1.render(t, 0.35, 3.0);
        l2.render(t, 3.5, 6.75, { outDur: 0.35 });
        paper.style.setProperty('--dots-scale', String(1 + 0.03 * prog(t, 0, 7.2)));
      },
    };
  });

  /* 2 · Hero: the landing page itself is the title ---------------------- */
  scene('hero', at(4), at(8), (root, s) => {
    const shot = new Shot(root, 'hero');
    shot.place({ x: 0, y: 0, w: 1920, h: 1080 });
    const cap = new Captions(root, [[at(6, 1), at(8) - 0.45, 'Hand your agent <em>one prompt.</em>']]);
    const H1 = { cx: 373, cy: 261 };
    const PROMPT = { cx: 955, cy: 368 };
    return {
      async render(t) {
        const lt = t - s.t0;
        await shot.show(lt * FPS, t);
        shot.look(
          keys(lt, [
            [0, { ...H1, zoom: 1.34 }],
            [1.6, { ...H1, zoom: 1.3 }],
            [3.1, { cx: 640, cy: 360, zoom: 1.0 }],
            [4.6, { cx: 640, cy: 360, zoom: 1.0 }],
            [6.9, { ...PROMPT, zoom: 1.42 }],
            [9.6, { ...PROMPT, zoom: 1.5 }],
          ]),
        );
        cap.render(t);
        root.style.opacity = String(1 - E.inOut(prog(t, s.t1 - 0.35, s.t1)));
      },
    };
  });

  /* 3 · The agent writes it; the canvas draws it ------------------------ */
  scene('agent', at(8), at(12), (root, s) => {
    const m = () => metas.build;
    const chunks = () => m().marks.filter((x) => x.name === 'chunk').map((x) => x.data);
    // Intro card: the agent starts the file.
    const card = el('div', 'card', root);
    const bar = el('div', 'bar', card, `<span class="dots"><i></i><i></i><i></i></span><span class="title">architecture.arch</span><span class="chip"><b></b>written by your agent</span>`);
    const body = el('div', 'code', card);
    css(body, { padding: '22px 30px', fontSize: '23px', lineHeight: '36px', height: 'calc(100% - 52px)', overflow: 'hidden', position: 'relative' });
    const inner = el('div', '', body);
    css(inner, { position: 'absolute', left: '30px', right: '30px' });
    const title = new Words(root, 'Your agent writes the architecture…', 'statement', { top: '92px', fontSize: '76px' });
    // Canvas: the build shot, clipped to the canvas area.
    const shot = new Shot(root, 'build', { windowed: true, crop: { x: 224, y: 40, w: 1056, h: 680 }, bg: 'var(--ground)' });
    const cap = new Captions(root, [[at(9, 1), at(12) - 0.5, '…and Archer <em>draws it.</em>']]);
    const INTRO = 2.6; // seconds of intro before the canvas takes over
    const T_SWAP = s.t0 + INTRO;

    /** Text the agent has typed by build-shot frame f (fractional). */
    const typedAt = (f) => {
      let text = '';
      for (const c of chunks()) {
        if (f >= c.endFrame) text += c.typed;
        else if (f > c.startFrame) {
          text += c.typed.slice(0, Math.floor(c.typed.length * ((f - c.startFrame) / (c.endFrame - c.startFrame))));
          break;
        } else break;
      }
      return text;
    };
    const renderCode = (text, maxLines, withCaret) => {
      const lines = text.split('\n');
      const shown = lines.slice(-maxLines);
      inner.innerHTML = shown.map((l, i) => `<span class="ln">${highlight(l) || ' '}${withCaret && i === shown.length - 1 ? '<span class="caret"></span>' : ''}</span>`).join('');
    };

    return {
      async render(t) {
        const lt = t - s.t0;
        const cs = chunks();
        const swapFrame = cs[1].endFrame; // Listener Apps lands: the canvas takes over here
        // Intro: type chunks 0–1 slowly over INTRO seconds; then follow the shot.
        let f;
        if (t < T_SWAP) {
          const k = prog(lt, 0.5, INTRO - 0.15);
          f = lerp(cs[0].startFrame, swapFrame, k);
        } else f = swapFrame + (t - T_SWAP) * FPS;
        const swap = E.inOut(prog(t, T_SWAP - 0.25, T_SWAP + 0.55));
        // Card: centered and big → small ticker bottom-right.
        const big = { x: 360, y: 250, w: 1200, h: 610 };
        const small = { x: 1290, y: 806, w: 590, h: 232 };
        const r = { x: lerp(big.x, small.x, swap), y: lerp(big.y, small.y, swap), w: lerp(big.w, small.w, swap), h: lerp(big.h, small.h, swap) };
        css(card, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, opacity: String(prog(lt, 0.1, 0.5) * (1 - prog(t, s.t1 - 0.9, s.t1 - 0.4))), zIndex: '10' });
        body.style.fontSize = `${lerp(24, 15, swap)}px`;
        body.style.lineHeight = `${lerp(38, 23, swap)}px`;
        const lines = Math.round(lerp(13, 7, swap));
        renderCode(typedAt(f), lines, Math.floor(t * 2.2) % 2 === 0 || f < cs[cs.length - 1].endFrame);
        inner.style.top = `${lerp(22, 14, swap)}px`;
        title.render(t, s.t0 + 0.15, T_SWAP - 0.45, { outDur: 0.3 });
        // Canvas window grows in behind the card.
        const win = { x: 160, y: 40, w: 1600, h: 1000 };
        const k = E.out(prog(t, T_SWAP - 0.3, T_SWAP + 0.6));
        shot.place({ x: win.x, y: lerp(win.y + 140, win.y, k), w: win.w, h: win.h });
        shot.root.style.opacity = String(k);
        shot.root.style.display = k > 0 ? 'block' : 'none';
        if (k > 0) {
          await shot.show(f, t);
          // Frame the diagram (app px 272–1232 × 115–645), then drift in.
          shot.look(keys(t - T_SWAP, [[0, { cx: 752, cy: 391, zoom: 1.216 }], [7.0, { cx: 752, cy: 391, zoom: 1.255 }]], E.inOutSine));
        }
        cap.render(t);
        root.style.opacity = String(1 - E.inOut(prog(t, s.t1 - 0.3, s.t1)));
      },
    };
  });

  /* 4 · Edit the code --------------------------------------------------- */
  scene('code', at(12), at(17), (root, s) => {
    const shot = new Shot(root, 'code');
    shot.place({ x: 0, y: 0, w: 1920, h: 1080 });
    // [timeline start (s from scene start), source frame range]
    const cuts = () => {
      const m = metas.code;
      const mk = (n) => m.marks.find((x) => x.name === n).frame;
      return [
        { from: 0, to: 110 },
        { from: mk('typeComponent') - 14, to: mk('typeComponent') + 168 },
        { from: mk('typeConnection') - 12, to: mk('close') },
        { from: mk('canvas') + 2, to: m.frames - 1 },
      ];
    };
    let plan = null;
    const build = () => {
      let t = 0;
      plan = cuts().map((c) => {
        const d = (c.to - c.from) / FPS;
        const p = { ...c, start: t, end: t + d };
        t += d;
        return p;
      });
    };
    let cap = null;
    const captions = () => {
      const m = metas.code;
      const mk = (n) => m.marks.find((x) => x.name === n).frame;
      const typo = s.t0 + plan[2].start + (mk('typo') - plan[2].from) / FPS;
      const fixed = s.t0 + plan[2].start + (mk('fixed') - plan[2].from) / FPS;
      return new Captions(root, [
        [s.t0 + 0.2, s.t0 + plan[1].start - 0.35, 'Every diagram is <em>code.</em>'],
        [s.t0 + plan[1].start + 0.2, s.t0 + plan[2].start - 0.3, 'Add a component in code…'],
        [typo + 0.15, fixed + 0.1, 'Typos are errors,<br><em>never phantom boxes.</em>', 'right'],
        [s.t0 + plan[3].start + 0.1, s.t1 - 0.3, '…and the canvas <em>follows.</em>'],
      ]);
    };
    return {
      async render(t) {
        if (!plan) build();
        if (!cap) cap = captions();
        const lt = t - s.t0;
        let i = plan.findIndex((p) => lt < p.end);
        if (i === -1) i = plan.length - 1;
        const seg = plan[i];
        const f = seg.from + (lt - seg.start) * FPS;
        await shot.show(Math.min(f, seg.to), t);
        const cur = metas.code.track[Math.round(Math.min(f, seg.to))];
        // Camera per segment.
        let cam;
        const sl = lt - seg.start;
        if (i === 0) cam = keys(sl, [[0, { cx: 640, cy: 360, zoom: 1.0 }], [1.85, { cx: 600, cy: 340, zoom: 1.07 }]], E.inOutSine);
        else if (i === 1) cam = keys(sl, [[0, { cx: 540, cy: 318, zoom: 1.46 }], [3.0, { cx: 548, cy: 318, zoom: 1.54 }]], E.inOutSine);
        else if (i === 2) {
          const mk = (n) => metas.code.marks.find((x) => x.name === n).frame;
          const typo = (mk('typo') - seg.from) / FPS;
          const fixed = (mk('fixed') - seg.from) / FPS;
          cam = keys(sl, [
            [0, { cx: 540, cy: 318, zoom: 1.54 }],
            [typo + 0.05, { cx: 540, cy: 318, zoom: 1.54 }],
            [typo + 0.75, { cx: 530, cy: 459, zoom: 1.5 }],
            [fixed + 0.1, { cx: 530, cy: 459, zoom: 1.5 }],
            [fixed + 0.8, { cx: 540, cy: 340, zoom: 1.46 }],
          ]);
        } else cam = keys(sl, [[0, { cx: 930, cy: 260, zoom: 1.28 }], [1.6, { cx: 950, cy: 250, zoom: 1.4 }]], E.inOutSine);
        shot.look(cam);
        // Soft dip at each cut.
        const edge = Math.min(lt - seg.start, seg.end - lt);
        shot.root.style.opacity = String(i > 0 && lt - seg.start < 0.12 ? 0.6 + 0.4 * (lt - seg.start) / 0.12 : 1);
        void edge;
        cap.render(t);
        root.style.opacity = String(E.out(prog(t, s.t0, s.t0 + 0.25)) * (1 - E.inOut(prog(t, s.t1 - 0.3, s.t1))));
      },
    };
  });

  /* 5 · Canvas → code (the landing sandbox) ----------------------------- */
  scene('drag', at(17), at(21), (root, s) => {
    const shot = new Shot(root, 'sandbox');
    shot.place({ x: 0, y: 0, w: 1920, h: 1080 });
    const cap = new Captions(root, [
      [s.t0 + 0.3, s.t0 + 4.3, 'Move it on the canvas…'],
      [s.t0 + 4.7, s.t1 - 0.35, '…retype it, and the <em>code follows.</em>'],
    ]);
    return {
      async render(t) {
        const lt = t - s.t0;
        await shot.show(lt * FPS, t);
        // The sandbox (app px 106–1175 × 74–647), a little above centre to clear the caption.
        const re = shot.mark('retype') / FPS;
        shot.look(
          keys(lt, [
            [0, { cx: 640, cy: 394, zoom: 1.0 }],
            [re, { cx: 644, cy: 393, zoom: 1.03 }],
            [re + 1.9, { cx: 800, cy: 300, zoom: 1.34 }],
            [9.6, { cx: 812, cy: 296, zoom: 1.4 }],
          ]),
          { free: true },
        );
        cap.render(t);
        root.style.opacity = String(E.out(prog(t, s.t0, s.t0 + 0.25)) * (1 - E.inOut(prog(t, s.t1 - 0.3, s.t1))));
      },
    };
  });

  /* 6 · Depth: ⌘K, nesting, data inside components ---------------------- */
  scene('depth', at(21), at(26), (root, s) => {
    const cmdk = new Shot(root, 'cmdk');
    const drill = new Shot(root, 'drill');
    cmdk.place({ x: 0, y: 0, w: 1920, h: 1080 });
    drill.place({ x: 0, y: 0, w: 1920, h: 1080 });
    const key = el('div', 'keycap', root, '<span>⌘</span><span>K</span>');
    const SPLIT = s.t0 + 3.6;
    const cap = new Captions(root, [
      [s.t0 + 0.25, SPLIT - 0.35, '80+ component types, <em>or your own.</em>'],
      [SPLIT + 0.2, SPLIT + 3.5, 'Nest systems, then <em>drill in.</em>'],
      [SPLIT + 3.9, s.t1 - 0.35, 'Schemas and contracts <em>live inside.</em>'],
    ]);
    return {
      async render(t) {
        const lt = t - s.t0;
        const inCmdk = t < SPLIT;
        cmdk.root.style.display = inCmdk ? 'block' : 'none';
        drill.root.style.display = inCmdk ? 'none' : 'block';
        if (inCmdk) {
          const f = 18 + lt * FPS;
          await cmdk.show(f, t);
          const enter = cmdk.mark('enter');
          const after = (f - enter) / FPS;
          cmdk.look(after < 0.2 ? { cx: 640, cy: 330, zoom: 1.12 } : keys(after, [[0.2, { cx: 640, cy: 330, zoom: 1.12 }], [1.4, { cx: 665, cy: 250, zoom: 1.45 }]]));
          const kin = (18 + lt * FPS - cmdk.mark('open')) / FPS;
          const kk = E.outBack(prog(kin, -0.05, 0.3)) * (1 - E.inOut(prog(kin, 1.0, 1.35)));
          css(key, { top: `${lerp(760, 700, clamp(kk))}px`, opacity: String(clamp(kk * 1.4)), display: kk > 0.01 ? 'flex' : 'none' });
        } else {
          key.style.display = 'none';
          const f = (t - SPLIT) * FPS;
          await drill.show(f, t);
          const dbl = drill.mark('dblclick');
          const det = drill.mark('details');
          const sec = f / FPS;
          drill.look(
            keys(sec, [
              [0, { cx: 665, cy: 250, zoom: 1.45 }],
              [1.0, { cx: 700, cy: 260, zoom: 1.3 }],
              [dbl / FPS - 0.1, { cx: 780, cy: 200, zoom: 1.45 }],
              [dbl / FPS + 0.35, { cx: 640, cy: 330, zoom: 1.0 }],
              [det / FPS - 0.9, { cx: 640, cy: 330, zoom: 1.0 }],
              [det / FPS + 0.4, { cx: 747, cy: 407, zoom: 1.2 }],
              [det / FPS + 3.5, { cx: 752, cy: 407, zoom: 1.22 }],
            ]),
          );
        }
        cap.render(t);
        root.style.opacity = String(E.out(prog(t, s.t0, s.t0 + 0.25)) * (1 - E.inOut(prog(t, s.t1 - 0.3, s.t1))));
      },
    };
  });

  /* 7 · For teams (the signed-in features, from the landing's tiles) ---- */
  scene('team', at(26), at(30), (root, s) => {
    const title = new Words(root, 'Built for teams, <em>and their agents.</em>', 'statement', { top: '84px', fontSize: '72px' });
    const tiles = [
      'tile-history-with-real-diffs',
      'tile-share-a-live-link',
      'tile-linked-to-your-repo',
      'tile-teams-and-roles',
    ].map((n) => {
      const c = el('div', 'tile-card', root);
      el('img', '', c).src = `/shots/stills/${n}.png`;
      return c;
    });
    // CSS px of each tile still (DPR 3 screenshots).
    const sizes = [[383, 276], [383, 276], [383, 276], [383, 338]];
    const STEP = 2.4;
    return {
      async render(t) {
        const lt = t - s.t0;
        title.render(t, s.t0 + 0.1, s.t1 - 0.5, { outDur: 0.35 });
        // Carousel: the focused tile at 2.1×, neighbours smaller and dimmer.
        const pos = clamp((lt - 0.4) / STEP, 0, 3); // fractional index in focus
        const eased = Math.floor(pos) + E.inOut(clamp((pos - Math.floor(pos) - 0.62) / 0.38));
        tiles.forEach((c, i) => {
          const d = i - eased;
          const [w, h] = sizes[i];
          const sc = lerp(2.45, 1.35, clamp(Math.abs(d)));
          const x = 960 + d * 1180 - (w * sc) / 2;
          const y = 610 - (h * sc) / 2;
          const enter = E.out(prog(lt, 0.05 + i * 0.08, 0.75 + i * 0.08));
          css(c, {
            left: `${x}px`, top: `${y + (1 - enter) * 60}px`, width: `${w * sc}px`, height: `${h * sc}px`,
            opacity: String(enter * lerp(1, 0.45, clamp(Math.abs(d))) * (1 - prog(t, s.t1 - 0.45, s.t1 - 0.05))),
          });
        });
      },
    };
  });

  /* 8 · MCP ------------------------------------------------------------ */
  scene('mcp', at(30), at(32), (root, s) => {
    const title = new Words(root, 'Connect <em>any MCP client.</em>', 'statement', { top: '250px', fontSize: '96px' });
    // Just the logos from the landing's "Works with any MCP client" row (CSS px 250–750 of 1150).
    const clientsBox = el('div', '', root);
    css(clientsBox, { position: 'absolute', overflow: 'hidden', width: '1400px', height: `${(69 / 500) * 1400}px` });
    const clients = el('img', '', clientsBox);
    clients.src = '/shots/stills/clients.png';
    css(clients, { position: 'absolute', height: '100%', left: `${(-250 / 500) * 1400}px` });
    const TOOLS = ['get_guide', 'validate_source', 'list_projects', 'get_project', 'create_project', 'update_project', 'diff_project', 'get_history', 'report_drift', 'link_repository', 'list_types', 'auto_layout_project'];
    const tools = el('div', 'tools', root);
    const chips = TOOLS.map((n) => el('span', '', tools, n));
    css(tools, { top: '700px' });
    return {
      async render(t) {
        const lt = t - s.t0;
        title.render(t, s.t0 + 0.2, s.t1 - 0.45, { outDur: 0.35 });
        const k = E.out(prog(lt, 0.7, 1.4));
        css(clientsBox, { left: `${960 - 1400 / 2}px`, top: `${440 + (1 - k) * 30}px`, opacity: String(k * (1 - prog(t, s.t1 - 0.45, s.t1 - 0.1))) });
        chips.forEach((c, i) => {
          const kk = E.out(prog(lt, 1.5 + i * 0.07, 2.0 + i * 0.07));
          css(c, { opacity: String(kk * (1 - prog(t, s.t1 - 0.45, s.t1 - 0.1))), transform: `translateY(${(1 - kk) * 18}px)` });
        });
      },
    };
  });

  /* 9 · CLI ------------------------------------------------------------- */
  scene('cli', at(32), at(35), (root, s) => {
    const title = new Words(root, 'And a CLI for your <em>repo and CI.</em>', 'statement', { top: '96px', fontSize: '80px' });
    const card = el('div', 'card', root);
    css(card, { left: '190px', top: '270px', width: '1540px', height: '560px' });
    el('div', 'bar', card, '<span class="dots"><i></i><i></i><i></i></span><span class="title">~/music-streaming</span>');
    const body = el('div', 'term', card);
    css(body, { padding: '30px 38px', fontSize: '27px', lineHeight: '44px', background: 'var(--code-bg)', height: 'calc(100% - 52px)' });
    // Real output from packages/cli (archer check); push is shown signed in.
    const SCRIPT = [
      { at: 0.5, cmd: 'archer check' },
      { at: 1.5, out: '<span class="dim">architecture.arch:79:1:</span> <span class="err">error E101:</span> Connection target \'storage.embedings\' does not resolve to a declared component.' },
      { at: 1.6, out: '<span class="err">FAILED</span> — 1 file, 1 error, 0 warnings' },
      { at: 2.7, cmd: 'archer check' },
      { at: 3.6, out: '<span class="ok">ok</span> — 1 file, 0 errors, 0 warnings' },
      { at: 4.3, cmd: 'archer push architecture.arch -m "Add embeddings for recs"' },
      { at: 6.75, out: 'Updated "Music Streaming" — <span class="ok">https://archer.tombyrne.dev/documents/k57a2c9r4x</span>' },
    ];
    const CPS = 26;
    return {
      async render(t) {
        const lt = t - s.t0;
        title.render(t, s.t0 + 0.1, s.t1 - 0.45, { outDur: 0.35 });
        const k = E.out(prog(lt, 0.0, 0.6));
        css(card, { opacity: String(k * (1 - prog(t, s.t1 - 0.45, s.t1 - 0.1))), transform: `translateY(${(1 - k) * 40}px)` });
        let html = '';
        for (const line of SCRIPT) {
          if (lt < line.at) break;
          if (line.cmd !== undefined) {
            const n = Math.floor((lt - line.at) * CPS);
            const typed = line.cmd.slice(0, n);
            const done = n >= line.cmd.length;
            html += `<span class="prompt">$</span> ${esc(typed)}${!done || Math.floor(lt * 2.2) % 2 === 0 ? '<span class="caret"></span>' : ''}\n`;
          } else html += `${line.out}\n`;
        }
        // Only the latest prompt keeps a caret.
        const parts = html.split('<span class="caret"></span>');
        if (parts.length > 2) html = parts.slice(0, -1).join('') + '<span class="caret"></span>' + parts[parts.length - 1];
        body.innerHTML = html;
      },
    };
  });

  /* 10 · Recap: both ways in, side by side ----------------------------- */
  scene('recap', at(35), at(39), (root, s) => {
    const left = new Shot(root, 'sandbox', { windowed: true });
    const right = new Shot(root, 'build', { windowed: true, crop: { x: 224, y: 40, w: 1056, h: 680 }, bg: 'var(--ground)' });
    const W = 860;
    const H = 480;
    const hl = new Words(root, 'Draw it yourself.', 'statement', { top: '290px', fontSize: '60px', left: '70px', right: 'auto', width: `${W}px` });
    const hr = new Words(root, 'Or let your <em>agent</em> write it.', 'statement', { top: '290px', fontSize: '60px', left: `${1920 - 70 - W}px`, right: 'auto', width: `${W}px` });
    return {
      async render(t) {
        const lt = t - s.t0;
        const out = E.inOut(prog(t, s.t1 - 0.6, s.t1 - 0.05));
        const k = E.out(prog(lt, 0.0, 0.7));
        const y = 414 + (1 - k) * 60;
        left.place({ x: 70, y, w: W, h: H });
        right.place({ x: 1920 - 70 - W, y, w: W, h: H });
        for (const sh of [left, right]) sh.root.style.opacity = String(k * (1 - out));
        // Human: the landing sandbox, drag then retype (frames 60→end).
        await left.show(60 + Math.max(0, lt - 0.4) * FPS, t);
        left.look({ cx: 640.5, cy: 360.5, zoom: (W / 1069) / Math.min(W / 1280, H / 720) });
        // Agent: the build, from an empty canvas.
        await right.show(20 + Math.max(0, lt - 0.4) * FPS, t);
        right.look({ cx: 752, cy: 380, zoom: (W / 1004) / Math.min(W / 1280, H / 720) });
        hl.render(t, s.t0 + 0.25, s.t1 - 0.6, { outDur: 0.5 });
        hr.render(t, s.t0 + 0.85, s.t1 - 0.6, { outDur: 0.5 });
      },
    };
  });

  /* 11 · End card -------------------------------------------------------- */
  scene('end', at(39), DURATION, (root, s) => {
    const mark = el('div', 'wordmark', root, 'Archer');
    css(mark, { top: '270px', fontSize: '300px' });
    const tag = new Words(root, 'Software architecture for your agents.', 'statement', { top: '560px', fontSize: '60px', color: 'var(--ink-2)' });
    const url = el('div', 'endline', root, 'archer.tombyrne.dev');
    css(url, { top: '700px', fontFamily: 'var(--mono)', fontSize: '38px', color: 'var(--accent)' });
    const sub = el('div', 'endline', root, 'Try the sandbox — no sign-in needed.');
    css(sub, { top: '770px', fontFamily: 'var(--sans)', fontSize: '26px', color: 'var(--ink-3)' });
    return {
      async render(t) {
        const lt = t - s.t0;
        const out = E.inOut(prog(t, DURATION - 1.5, DURATION - 0.15));
        const k = E.outQuart(prog(lt, 0.0, 1.4));
        root.style.transform = `scale(${lerp(1.0, 1.025, E.inOutSine(prog(lt, 0, DURATION - s.t0)))})`;
        css(mark, { opacity: String(k * (1 - out)), transform: `translateY(${(1 - k) * 40}px) scale(${lerp(1.04, 1, k)})`, letterSpacing: `${lerp(-0.02, -0.04, k)}em` });
        tag.render(t, s.t0 + 0.9, DURATION - 1.5, { outDur: 1.3 });
        const k2 = E.out(prog(lt, 1.9, 2.6));
        css(url, { opacity: String(k2 * (1 - out)), transform: `translateY(${(1 - k2) * 16}px)` });
        const k3 = E.out(prog(lt, 2.5, 3.2));
        css(sub, { opacity: String(k3 * (1 - out)), transform: `translateY(${(1 - k3) * 16}px)` });
      },
    };
  });

  /* ------------------------------------------------------------- driver */
  window.DURATION = DURATION;
  window.renderAt = async (t) => {
    for (const s of scenes) {
      const on = t >= s.t0 - 1e-6 && t < s.t1;
      s.root.style.display = on ? 'block' : 'none';
      if (on) await s.render(t);
    }
  };
  (async () => {
    await loadMetas(['hero', 'build', 'code', 'sandbox', 'cmdk', 'drill']);
    await document.fonts.load('500 60px Newsreader');
    await document.fonts.load('900 60px "Playfair Display"');
    await document.fonts.load('400 20px Inter');
    await document.fonts.load('400 20px "Geist Mono"');
    await document.fonts.ready;
    window.stageReady = true;
  })();
})();
