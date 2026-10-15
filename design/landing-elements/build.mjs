// Builds index.html (the gallery: every element in the current landing style)
// and dist/<slug>.html (one element alone, for previews) from kit/ and
// elements/. Each element is elements/<slug>.html: a <section id="<slug>">
// plus optional <style> (selectors prefixed with #<slug>) and <script>.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const manifest = JSON.parse(read("elements/manifest.json"));
const kitCss = read("kit/kit.css");
const kitJs = [read("kit/catalog.js"), read("kit/icons.js"), read("kit/kit.js")].join("\n");
const shell = read("shell.html");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function split(slug) {
  const p = `elements/${slug}.html`;
  if (!existsSync(join(here, p))) return null;
  let src = read(p);
  const css = [], js = [];
  src = src.replace(/<style>([\s\S]*?)<\/style>/g, (_, c) => (css.push(c), ""));
  src = src.replace(/<script>([\s\S]*?)<\/script>/g, (_, c) => (js.push(`(function(){${c}\n})();`), ""));
  return { html: src.trim(), css: css.join("\n"), js: js.join("\n") };
}

function meta(e, i) {
  const n = String(i + 1).padStart(2, "0");
  const rows = [["Goes in", e.where], ["Reuses", e.reuses], ["Effort", e.effort]].filter(([, v]) => v);
  return `<header class="el-meta joints rule-b px">
  <p class="eyebrow">Element ${n}</p>
  <h2>${esc(e.name)}</h2>
  <p class="body">${esc(e.pitch)}</p>
  <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
</header>`;
}

function page(items, intro) {
  const parts = items.map(({ e, i, s }) => `<article id="el-${e.slug}">${meta(e, i)}\n${s.html}</article>`);
  return shell
    .replace("/*KIT_CSS*/", () => kitCss)
    .replace("/*KIT_JS*/", () => kitJs)
    .replace("/*ELEMENT_CSS*/", () => items.map(({ s }) => s.css).join("\n"))
    .replace("/*ELEMENT_JS*/", () => items.map(({ s }) => s.js).join("\n"))
    .replace("<!--INTRO-->", () => intro)
    .replace("<!--ELEMENTS-->", () => parts.join("\n"));
}

const items = manifest.elements.map((e, i) => ({ e, i, s: split(e.slug) })).filter((x) => x.s);
const intro = `<section class="joints rule-b px" style="padding-top:64px;padding-bottom:56px;text-align:center;display:flex;flex-direction:column;align-items:center">
  <p class="eyebrow">Landing page · element concepts</p>
  <h1 class="headline text-display" style="max-width:16ch;padding-top:16px">${esc(manifest.title)}</h1>
  <p class="lede" style="max-width:56ch;padding-top:20px">${esc(manifest.lede)}</p>
</section>
<nav id="elements" class="toc ruled-grid joints rule-b" aria-label="Elements">${items.map(({ e, i }) => `<a href="#el-${e.slug}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(e.name)}</a>`).join("")}</nav>`;

writeFileSync(join(here, "index.html"), page(items, intro));
mkdirSync(join(here, "dist"), { recursive: true });
const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>`;
for (const it of items) writeFileSync(join(here, "dist", `${it.e.slug}.html`), head + page([it], "") + "</body></html>");
console.log(`built index.html with ${items.length} elements; previews in dist/`);
