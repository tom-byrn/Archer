// Builds design/landing-concepts/blueprint.html from template.html by
// generating the Acme drawings (hero + spec sheet) and the revision cloud.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../../blueprint.html");

const GLYPH = {
  globe: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 3c-3.6 3 -3.6 15 0 18 M12 3c3.6 3 3.6 15 0 18 M3.5 9h17 M3.5 15h17",
  key: "M3 15a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M10.6 11.9 L20 2.5 M17 5.5l2.6 2.6 M14.5 8l2 2",
  bolt: "M13.5 2 L5 13.5 h6 l-1.5 8.5 l9 -12 h-6.2 z",
  card: "M2.5 5.5h19v13h-19z M2.5 9.5h19 M5.5 15h5",
  cyl: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3z M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3",
  browser: "M2.5 4.5h19v15h-19z M2.5 8.5h19 M5 6.5h.5 M7.5 6.5h.5",
  cache: "M4 4h16v16h-16z M13 6.5 L8.5 12.5 h4 l-1 5 l4.5 -6 h-4z",
};

const C = [
  { id: "web", name: "Web app", type: "@vercel.nextjs", x: 0, y: 120, shape: "browser", glyph: "globe", kn: 1 },
  { id: "auth", name: "Auth", type: "@clerk", x: 0, y: 360, glyph: "key", kn: 2 },
  { id: "api", name: "API", type: "@vercel.functions", x: 280, y: 120, glyph: "bolt", kn: 4 },
  { id: "db", name: "Postgres", type: "@supabase.postgres", x: 520, y: 120, shape: "cylinder", glyph: "cyl", kn: 5 },
  { id: "billing", name: "Billing", type: "@stripe", x: 520, y: 360, glyph: "card", kn: 6 },
].map((c) => ({ ...c, w: 160, h: 120 }));
const PLANE = { id: "backend", name: "Backend", x: 240, y: 40, w: 480, h: 240, kn: 3 };
const E = [
  { id: "e1", d: "M160 180 H279", arrow: [279, 180, "r"], label: "@http", lx: 220, ly: 171, kx: 220, ky: 195, kn: 7 },
  { id: "e2", d: "M80 240 V359", arrow: [80, 359, "d"], label: "sign in", proto: "@http", lx: 92, ly: 297, kx: 80, ky: 334, kn: 8, anchor: "start" },
  { id: "e3", d: "M440 180 H519", arrow: [519, 180, "r"], label: "@sql", lx: 480, ly: 171, kx: 480, ky: 195, kn: 9 },
  { id: "e4", d: "M360 240 V420 H519", arrow: [519, 420, "r"], label: "checkout", proto: "@http", lx: 440, ly: 411, kx: 392, ky: 420, kn: 10 },
];

const P = (d, cls, extra = "") => `<path class="${cls}" d="${d}" pathLength="1"${extra}/>`;
const rectD = (x, y, w, h) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
const arrowD = ([x, y, dir]) =>
  dir === "r" ? `M${x - 9} ${y - 3.6} L${x + 1} ${y} L${x - 9} ${y + 3.6} Z`
  : dir === "d" ? `M${x - 3.6} ${y - 9} L${x} ${y + 1} L${x + 3.6} ${y - 9} Z`
  : `M${x - 3.6} ${y + 9} L${x} ${y - 1} L${x + 3.6} ${y + 9} Z`;
const d = (ms) => ` style="--d:${ms}ms"`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function outline(c) {
  const { x, y, w, h } = c;
  if (c.shape === "cylinder") {
    const ry = 12;
    return `M${x} ${y + ry} A${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z M${x} ${y + ry} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`;
  }
  return rectD(x, y, w, h);
}
function shapeExtra(c) {
  const { x, y, w } = c;
  if (c.shape === "browser") {
    return `M${x} ${y + 22} H${x + w} M${x + 10} ${y + 11} h.6 M${x + 17} ${y + 11} h.6 M${x + 24} ${y + 11} h.6`;
  }
  return "";
}
const labelDy = (c) => (c.shape === "browser" ? 10 : c.shape === "cylinder" ? 8 : 2);
const glyphAt = (c) => (c.shape === "browser" ? [c.x + 12, c.y + 32] : c.shape === "cylinder" ? [c.x + 14, c.y + 30] : [c.x + 12, c.y + 12]);

/* ---------- line drawing (pencil or ink layer) ---------- */
function lineDrawing({ hero, ink, maskId }) {
  const o = [];
  if (hero) {
    // construction lines
    const con = [];
    [40, 120, 240, 280, 360, 480].forEach((y) => con.push(`M-60 ${y} H800`));
    [0, 160, 240, 280, 440, 520, 680, 720].forEach((x) => con.push(`M${x} -36 V556`));
    o.push(`<g class="con">${con.map((p, i) => P(p, "s s05 sf", d(i * 45))).join("")}</g>`);
  }
  // plane (dashed boundary, revealed by a mask in the ink layer)
  const pl = PLANE;
  const plMask = ink ? ` mask="url(#${maskId})"` : "";
  o.push(`<g class="plane" data-ref="backend">
    <path class="s10 dash" d="${rectD(pl.x, pl.y, pl.w, pl.h)}"${plMask}/>
    <text class="t-plane" x="${pl.x + 14}" y="${pl.y + 22}">BACKEND</text>
    <text class="t-sub" x="${pl.x + 14}" y="${pl.y + 36}">plane · 12 × 6</text>
  </g>`);
  // components
  C.forEach((c, i) => {
    const [gx, gy] = glyphAt(c);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2 + labelDy(c);
    o.push(`<g class="comp" data-ref="${c.id}"${hero ? "" : ` tabindex="0" role="button" aria-label="${c.name}, ${c.type}"`}>
      <rect class="hit" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>
      ${P(outline(c), "s s15 out", d(700 + i * 180))}
      ${shapeExtra(c) ? P(shapeExtra(c), "s s05 out", d(900 + i * 180)) : ""}
      ${c.shape === "cylinder" ? "" : `<g transform="translate(${gx} ${gy}) scale(.85)">${P(GLYPH[c.glyph], "s s12 gl", d(1500 + i * 120))}</g>`}
      <text class="t-lbl txt mid" x="${cx}" y="${cy}"${d(2500 + i * 90)}>${c.name.toUpperCase()}</text>
      <text class="t-sub txt mid" x="${cx}" y="${cy + 17}"${d(2600 + i * 90)}>${c.id} · 4 × 3</text>
    </g>`);
  });
  // edges
  E.forEach((e, i) => {
    o.push(`<g class="edge" data-ref="${e.id}"${hero ? "" : ` tabindex="0" role="button" aria-label="connection ${e.id}"`}>
      <path class="hit" d="${e.d}"/>
      ${P(e.d, "s s10 ln", d(2000 + i * 160))}
      ${P(arrowD(e.arrow), "s s05 arw", d(2700 + i * 120))}
      <text class="t-edge txt halo${e.anchor ? "" : " mid"}" x="${e.lx}" y="${e.ly}"${d(2900 + i * 80)}>${esc(e.label)}</text>
      ${e.proto ? `<text class="t-sub txt halo${e.anchor ? "" : " mid"}" x="${e.lx}" y="${e.ly + (e.anchor ? 14 : 26)}"${d(2950 + i * 80)}>${e.proto}</text>` : ""}
    </g>`);
  });
  if (hero) {
    // dimensions
    const tick = (x, y) => `M${x - 4} ${y + 4} L${x + 4} ${y - 4}`;
    const dims = [
      // web width
      `M0 114 V88 M160 114 V88 M-6 96 H166 ${tick(0, 96)} ${tick(160, 96)}`,
      // web height
      `M-6 120 H-34 M-6 240 H-34 M-26 114 V246 ${tick(-26, 120)} ${tick(-26, 240)}`,
      // plane width
      `M240 34 V6 M720 34 V6 M234 14 H726 ${tick(240, 14)} ${tick(720, 14)}`,
      // plane height
      `M726 40 H760 M726 280 H760 M752 34 V286 ${tick(752, 40)} ${tick(752, 280)}`,
      // overall
      `M0 490 V540 M720 290 V540 M-6 530 H726 ${tick(0, 530)} ${tick(720, 530)}`,
    ];
    o.push(`<g class="dims">${dims.map((p, i) => P(p, "s s05 dim", d(2300 + i * 140))).join("")}
      <text class="t-dim txt halo mid" x="80" y="92"${d(2700)}>4</text>
      <text class="t-dim txt halo mid" x="-26" y="184"${d(2750)} transform="rotate(-90 -26 180)">3</text>
      <text class="t-dim txt halo mid" x="480" y="10"${d(2850)}>12</text>
      <text class="t-dim txt halo mid" x="752" y="164"${d(2900)} transform="rotate(-90 752 160)">6</text>
      <text class="t-dim txt halo mid" x="360" y="526"${d(3000)}>18 GRID</text>
    </g>`);
    // callouts (leaders naming types)
    const call = [
      [[126, 134], [180, -24], [200, -24], "@vercel.nextjs"],
      [[410, 134], [440, -24], [460, -24], "@vercel.functions"],
      [[662, 150], [690, -24], [710, -24], "@supabase.postgres"],
      [[668, 448], [730, 404], [750, 404], "@stripe"],
      [[150, 462], [210, 504], [230, 504], "@clerk"],
    ];
    o.push(`<g class="callouts">${call
      .map(([a, b, s, t], i) => `<g>
        <path class="dot" d="M${a[0]} ${a[1]}m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0"/>
        ${P(`M${a[0]} ${a[1]} L${b[0]} ${b[1]} H${s[0]}`, "s s05 lead", d(3100 + i * 120))}
        <text class="t-call txt" x="${s[0] + 5}" y="${s[1] + 4}"${d(3300 + i * 120)}>${t}</text>
      </g>`)
      .join("")}</g>`);
    // scale bar
    o.push(`<g class="scalebar">
      <path class="fill-ink" d="M0 566 h40 v6 h-40z M80 566 h80 v6 h-80z"/>
      <path class="s05 nofill" d="M0 566 h160 v6 h-160z"/>
      <text class="t-dim mid" x="0" y="586">0</text><text class="t-dim mid" x="40" y="586">1</text>
      <text class="t-dim mid" x="80" y="586">2</text><text class="t-dim mid" x="160" y="586">4</text>
      <text class="t-call" x="182" y="573">SCALE  1 GRID = 40 PX</text>
    </g>`);
  }
  return o.join("\n");
}

/* ---------- render layer (clean canvas style) ---------- */
function renderLayer() {
  const o = [];
  const pl = PLANE;
  o.push(`<g class="plane" data-ref="backend">
    <rect class="r-plane" x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" rx="16"/>
    <text class="r-plane-t" x="${pl.x + 16}" y="${pl.y + 24}">Backend</text></g>`);
  E.forEach((e) => {
    const w = e.label.length * 6.4 + 16;
    const lx = e.anchor ? e.lx - 4 : e.lx - w / 2;
    o.push(`<g class="edge" data-ref="${e.id}">
      <path class="r-edge" d="${e.d}"/><path class="r-arrow" d="${arrowD(e.arrow)}"/>
      <rect class="r-pill" x="${lx}" y="${e.ly - 13}" width="${w}" height="18" rx="9"/>
      <text class="r-pill-t${e.anchor ? "" : " mid"}" x="${e.anchor ? e.lx + 4 : e.lx}" y="${e.ly}">${esc(e.label)}</text></g>`);
  });
  C.forEach((c) => {
    const { x, y, w, h } = c;
    let body;
    if (c.shape === "cylinder") {
      body = `<path class="r-card" d="${outline(c)}"/>`;
    } else if (c.shape === "browser") {
      body = `<rect class="r-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>
        <path class="r-sep" d="M${x} ${y + 22} H${x + w}"/>
        <path class="r-dots" d="M${x + 12} ${y + 11} h.5 M${x + 20} ${y + 11} h.5 M${x + 28} ${y + 11} h.5"/>`;
    } else {
      body = `<rect class="r-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`;
    }
    const top = c.shape === "browser" ? y + 32 : c.shape === "cylinder" ? y + 32 : y + 14;
    o.push(`<g class="comp" data-ref="${c.id}">${body}
      <rect class="r-chip" x="${x + 14}" y="${top}" width="30" height="30" rx="8"/>
      <g transform="translate(${x + 18} ${top + 4}) scale(.92)"><path class="r-glyph" d="${GLYPH[c.glyph]}"/></g>
      <text class="r-name" x="${x + 14}" y="${y + h - 30}">${c.name}</text>
      <text class="r-type" x="${x + 14}" y="${y + h - 14}">${c.type}</text></g>`);
  });
  return o.join("\n");
}

/* ---------- keynote bubbles for the spec sheet ---------- */
function keynotes() {
  const o = [];
  const bubble = (x, y, n, ref) =>
    `<g class="kn" data-ref="${ref}"><circle cx="${x}" cy="${y}" r="11"/><text class="t-kn mid" x="${x}" y="${y + 3.6}">${n}</text></g>`;
  const hex = (x, y, n, ref) => {
    const r = 11, pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`); }
    return `<g class="kn" data-ref="${ref}"><polygon points="${pts.join(" ")}"/><text class="t-kn mid" x="${x}" y="${y + 3.6}">${n}</text></g>`;
  };
  C.forEach((c) => o.push(bubble(c.x + c.w, c.y, c.kn, c.id)));
  o.push(bubble(PLANE.x + PLANE.w, PLANE.y, PLANE.kn, "backend"));
  E.forEach((e) => o.push(hex(e.kx, e.ky, e.kn, e.id)));
  return o.join("\n");
}

const gridPattern = (id) => `<defs>
  <pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" class="gridline"/></pattern>
</defs>`;

const heroSvg = `<svg class="drawing hero-drawing drafting" id="hero-drawing" viewBox="-70 -50 930 650" data-vb-wide="-70 -50 930 650" data-vb-narrow="-14 26 748 470" role="img" aria-labelledby="hero-drawing-t">
<title id="hero-drawing-t">Drawing A-101: the Acme architecture. Web app connects to Auth and to the API on the Backend plane; the API connects to Postgres and to Billing.</title>
${gridPattern("g101")}
<defs><mask id="m101" maskUnits="userSpaceOnUse" x="-100" y="-100" width="1100" height="800"><path class="s mask-path" d="${rectD(PLANE.x, PLANE.y, PLANE.w, PLANE.h)}" pathLength="1" style="--d:1100ms"/></mask></defs>
<rect class="grid-bg" x="-60" y="-36" width="860" height="592" fill="url(#g101)"/>
<g class="pencil" aria-hidden="true">${lineDrawing({ hero: true, ink: false })}</g>
<g class="ink" aria-hidden="true">${lineDrawing({ hero: true, ink: true, maskId: "m101" })}</g>
</svg>`;

const specSvg = `<svg class="drawing spec-drawing" viewBox="-26 8 778 496" role="group" aria-label="The Acme drawing. Hover or focus a component to find its line in the source.">
${gridPattern("g102")}
<rect class="grid-bg" x="-26" y="8" width="778" height="496" fill="url(#g102)"/>
<g class="layer layer-lines">${lineDrawing({ hero: false, ink: false })}${keynotes()}</g>
<g class="layer layer-render" aria-hidden="true">${renderLayer()}</g>
</svg>`;

/* ---------- revision cloud ---------- */
function cloud(x, y, w, h, r) {
  const pts = [];
  const seg = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / (r * 1.7)));
    for (let i = 1; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  };
  seg(x, y, x + w, y); seg(x + w, y, x + w, y + h); seg(x + w, y + h, x, y + h); seg(x, y + h, x, y);
  let dd = `M${x} ${y}`;
  pts.forEach(([px, py], i) => {
    const prev = i === 0 ? [x, y] : pts[i - 1];
    const rr = (Math.hypot(px - prev[0], py - prev[1]) / 2) * 1.08;
    dd += ` A${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`;
  });
  return dd;
}
const delta = (x, y, n) => `<g class="delta"><path d="M${x} ${y - 12} L${x + 12} ${y + 9} L${x - 12} ${y + 9} Z"/><text class="t-kn mid" x="${x}" y="${y + 6}">${n}</text></g>`;

const histSvg = `<svg class="drawing hist-drawing" viewBox="0 20 560 210" role="img" aria-label="Revision 3 clouded: a Cache component added between the API and Postgres. Revision 2 clouded: the api to db connection labelled writes.">
${gridPattern("g103")}
<rect class="grid-bg" x="0" y="20" width="560" height="210" fill="url(#g103)"/>
<g class="still">
  <path class="s15" d="${rectD(24, 64, 120, 84)}"/>
  <g transform="translate(34 74) scale(.75)"><path class="s12" d="${GLYPH.bolt}"/></g>
  <text class="t-lbl mid" x="84" y="114">API</text>
  <path class="s15" d="${rectD(214, 64, 120, 84)}"/>
  <g transform="translate(224 74) scale(.75)"><path class="s12" d="${GLYPH.cache}"/></g>
  <text class="t-lbl mid" x="274" y="110">CACHE</text><text class="t-sub mid" x="274" y="126">@cache</text>
  <path class="s15" d="M404 76 A66 12 0 0 1 536 76 V136 A66 12 0 0 1 404 136 Z M404 76 A66 12 0 0 0 536 76"/>
  <text class="t-lbl mid" x="470" y="118">POSTGRES</text>
  <path class="s10" d="M144 106 H213"/><path class="s05 fill-ink" d="${arrowD([213, 106, "r"])}"/>
  <text class="t-edge halo mid" x="179" y="98">@reads</text>
  <path class="s10" d="M84 148 V196 H470 V149"/><path class="s05 fill-ink" d="${arrowD([470, 149, "u"])}"/>
  <text class="t-edge halo mid" x="277" y="200">writes</text>
</g>
<path class="cloud" d="${cloud(156, 48, 192, 116, 9)}"/>
${delta(352, 44, 3)}
<path class="cloud" d="${cloud(244, 184, 66, 24, 6)}"/>
${delta(318, 180, 2)}
</svg>`;

let html = readFileSync(join(here, "template.html"), "utf8");
html = html.replace("<!--@HERO-->", heroSvg).replace("<!--@SPEC-->", specSvg).replace("<!--@HIST-->", histSvg);
writeFileSync(OUT, html);
console.log("wrote", OUT, html.length, "bytes");
