/* Landing elements kit helpers. Loaded after catalog.js and icons.js.
   Everything returns HTML strings styled by kit.css. */
(function () {
  var C = window.ARCHER_CATALOG, I = window.ARCHER_ICONS;
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /** A Phosphor bold UI icon, as the app's <Icon.X /> draws it. */
  function icon(name, cls) {
    return '<svg class="icon' + (cls ? " " + cls : "") + '" viewBox="0 0 256 256" aria-hidden="true">' + (I[name] || "") + "</svg>";
  }
  /** A catalog glyph (Phosphor path string) in currentColor. */
  function glyph(name, size) {
    var g = C.glyphs[name] || C.glyphs.box;
    return '<svg width="' + size + '" height="' + size + '" viewBox="' + C.viewBox + '" aria-hidden="true">' + g + "</svg>";
  }
  function type(tag) { return C.types[tag]; }
  /** The catalog type's glyph on its tinted tile (landing TypeTile): md 30px, sm 26px, xs 20px. */
  function typeTile(tag, size) {
    var t = C.types[tag] || { color: "#64748b", dark: "#64748b", glyph: "box" };
    var px = size === "xs" ? 20 : size === "sm" ? 26 : size === "lg" ? 40 : 30;
    var g = size === "xs" ? 12 : size === "sm" ? 15 : size === "lg" ? 22 : 17;
    return '<span class="type-tile" style="--type-light:' + t.color + ";--type-dark:" + t.dark + ";width:" + px + "px;height:" + px + 'px">' + glyph(t.glyph, g) + "</span>";
  }
  /** A component card as the canvas draws it. opts: {tag, label, nested, selected, style, cls} */
  function node(o) {
    var t = C.types[o.tag];
    var sub = o.sub != null ? o.sub : o.tag;
    return '<div class="node' + (o.nested ? " node-nested" : "") + (o.selected ? " selected" : "") + (o.cls ? " " + o.cls : "") + '"' +
      (o.id ? ' data-id="' + esc(o.id) + '"' : "") + (o.style ? ' style="' + o.style + '"' : "") + ">" +
      typeTile(o.tag, "sm") +
      '<div style="min-width:0;flex:1"><div class="node-label">' + esc(o.label || (t && t.name) || o.tag) + '</div><div class="node-type">' + esc(sub) + "</div></div>" +
      (o.nested ? '<span class="chip mono" style="position:absolute;right:5px;bottom:5px;height:16px;padding:0 4px">' + icon("stack") + o.nested + "</span>" : "") +
      "</div>";
  }
  /** Syntax-highlight one line of .arch with the app's code tokens. */
  function highlight(line) {
    var re = /("[^"]*")|(@[\w.]+)|(->)|\b(arch|component|plane|shape|desc|src|icon|color|layout|at|size)\b|(\bv\d+\.\d+\b)|(\b\d+\b)|(#.*$)/g, out = "", last = 0, m;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index));
      var c = m[1] ? "tok-str" : m[2] ? "tok-type" : m[3] ? "tok-arrow" : m[4] ? "tok-kw" : m[5] ? "tok-version" : m[6] ? "tok-num" : "tok-comment";
      out += '<span class="' + c + '">' + esc(m[0]) + "</span>";
      last = re.lastIndex;
    }
    return out + esc(line.slice(last));
  }
  /** Copy text from a click handler; swaps the button's copy icon for a check for 1.6s. */
  function copy(btn, text) {
    var done = function () { btn.classList.add("is-copied"); setTimeout(function () { btn.classList.remove("is-copied"); }, 1600); };
    try { navigator.clipboard.writeText(text).then(done, function () {}); } catch (e) {}
  }
  /** The swap icon (copy -> check) used by copy buttons. Pair with copy(). */
  function swapIcon() {
    return '<span class="swap-icon">' + icon("copy", "si-a") + icon("check", "si-b") + "</span>";
  }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.Archer = { esc: esc, icon: icon, glyph: glyph, type: type, typeTile: typeTile, node: node, highlight: highlight, copy: copy, swapIcon: swapIcon, reduced: reduced, catalog: C };
})();
