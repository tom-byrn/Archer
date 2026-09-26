/**
 * Stations 1–3 of the feature montage: the catalog, nesting, and payloads
 * inside a component.
 */
import { CATALOG } from "@archer/catalog";
import { cue } from "../cues";
import { glyph, hideAll, layoutDiagram, renderDiagram } from "../diagram";
import { h } from "../dom";
import { gsap, master } from "../engine";
import { icon } from "../icons";
import { NEST_LAYOUT, NEST_SOURCE } from "../sources";
import { BEAT } from "../time";
import { pill, typeColor, typeTile } from "../ui";
import type { Station } from "./features";

/** The landing page's claim, rounded down so it stays true as the catalog grows. */
export const TYPE_COUNT = Math.floor(CATALOG.length / 10) * 10;

/* ------------------------------------------------------------ 1. Catalog */

const ROWS = 6;
const COLS = 15;
const TILE = 92;
const GAP = 22;

/** A varied pick of real catalog types: one per glyph and color, vendors and building blocks mixed. */
function pickTypes(n: number): string[] {
  const seen = new Set<string>();
  const unique = CATALOG.filter((t) => {
    const key = `${t.glyph}|${t.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((t) => t.tag);
  // Deterministic shuffle (Math.random is seeded).
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j]!, unique[i]!];
  }
  return unique.slice(0, n);
}

export const catalogStation: Station = {
  kicker: "Catalog",
  title: `${TYPE_COUNT}+ components.`,
  cam: { x: 0, y: 0, z: 1 },
  build({ view, t0, t1 }) {
    const tags = pickTypes(ROWS * COLS);
    const width = COLS * TILE + (COLS - 1) * GAP;
    const top = -180;
    const rows: HTMLDivElement[] = [];
    const tiles: HTMLDivElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = h("div", {
        class: "abs",
        style: { left: -width / 2, top: top + r * (TILE + GAP), display: "flex", gap: `${GAP}px` },
      });
      for (let c = 0; c < COLS; c++) {
        const tile = typeTile(tags[r * COLS + c] ?? "box", TILE);
        row.append(tile);
        tiles.push(tile);
      }
      rows.push(row);
      view.world.append(row);
    }
    gsap.set(tiles, { scale: 0, opacity: 0 });
    master.fromTo(
      tiles,
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: "back.out(2.4)",
        stagger: { grid: [ROWS, COLS], from: "center", amount: 0.6 },
        immediateRender: false,
      },
      t0 - 0.26,
    );
    // An arpeggio of pops as the wall ripples out.
    [0, 2, 4, 7, 9, 12].forEach((pitch, i) => cue(t0 - 0.2 + i * 0.1, "pop", { pitch, gain: 0.55 }));
    // Rows drift in opposite directions, like the landing page's carousel.
    rows.forEach((row, r) => {
      master.fromTo(row, { x: r % 2 ? -40 : 40 }, { x: r % 2 ? 40 : -40, duration: t1 - t0 + 0.6, ease: "none", immediateRender: false }, t0 - 0.3);
    });
    master.fromTo(view.cam, { z: 1 }, { z: 1.06, duration: t1 - t0, ease: "none", immediateRender: false }, t0);
  },
};

/* ---------------------------------------------- 2 & 3. Nesting, payloads */

const NEST_ORIGIN = { x: 6400, y: -120 };

let nest: ReturnType<typeof renderDiagram> | null = null;
function nestDiagram() {
  nest ??= renderDiagram(layoutDiagram(NEST_SOURCE + NEST_LAYOUT));
  return nest;
}

/** World centre of the plane, and of Orders DB, with the diagram placed at NEST_ORIGIN. */
const PLANE_CENTER = { x: NEST_ORIGIN.x + (12 + 19 / 2) * 40, y: NEST_ORIGIN.y + 3.5 * 40 };
const ORDERS_CENTER = { x: NEST_ORIGIN.x + (12 + 13 + 2) * 40, y: NEST_ORIGIN.y + 4 * 40 };

export const nestingStation: Station = {
  kicker: "Nesting",
  title: "Zoom into anything.",
  cam: { x: NEST_ORIGIN.x + 620, y: NEST_ORIGIN.y + 60, z: 1.2 },
  build({ view, overlay, t0, t1 }) {
    const dg = nestDiagram();
    dg.root.style.left = `${NEST_ORIGIN.x}px`;
    dg.root.style.top = `${NEST_ORIGIN.y}px`;
    view.world.append(dg.root);
    // Already drawn when the camera arrives: this beat is about going inside.
    hideAll(dg);
    const all = [...dg.nodes.values(), ...dg.planes.values()];
    gsap.set(all, { opacity: 1, scale: 1 });
    for (const e of dg.edges.values()) {
      gsap.set(e.path, { drawSVG: "0% 100%" });
      gsap.set([e.head, e.chip].filter(Boolean), { opacity: 1, scale: 1 });
    }

    // Drill in: the plane fills the frame.
    master.to(view.cam, { x: PLANE_CENTER.x, y: PLANE_CENTER.y - 45, z: 1.95, duration: 1.1, ease: "power3.inOut" }, t0 + 0.28);
    cue(t0 + 0.3, "whoosh", { dur: 0.9, gain: 0.5 });
    const plane = dg.planes.get("vpc")!;
    master.to(plane, { boxShadow: "0 0 0 2px #121315, 0 0 0 4px #23c088", duration: 0.2 }, t0 + 0.1);
    master.to(plane, { boxShadow: "0 0 0 0px #121315, 0 0 0 0px #23c088", duration: 0.3 }, t0 + 0.9);

    // The canvas' breadcrumb trail (Features.tsx "Nesting").
    const crumb = h(
      "div",
      { class: "abs mono", style: { left: 126, top: 986, fontSize: 26, color: "var(--ink-3)", display: "flex", gap: "16px", alignItems: "center" } },
      "Acme",
      h("span", {}, "/"),
      h("span", { style: { color: "var(--ink)" } }, "Private network"),
    );
    overlay.append(crumb);
    gsap.set(crumb, { opacity: 0 });
    master.fromTo(crumb, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out", immediateRender: false }, t0 + 0.9);
    master.to(crumb, { opacity: 0, duration: 0.2 }, t1 + 0.3);
    cue(t0 + 0.9, "tick");
  },
};

export const payloadStation: Station = {
  kicker: "Payloads",
  title: "Real schemas, inside.",
  glide: true,
  cam: { x: ORDERS_CENTER.x + 170, y: ORDERS_CENTER.y - 60, z: 2.9 },
  build({ view, overlay, t0, t1 }) {
    const dg = nestDiagram();
    const orders = dg.nodes.get("vpc.orders")!;
    master.to(view.cam, { ...payloadStation.cam, duration: 0.7, ease: "power3.inOut" }, t0 - 0.12);
    master.to(orders, { boxShadow: "0 0 0 2px #121315, 0 0 0 4px #23c088", duration: 0.15 }, t0 + 0.05);
    cue(t0 + 0.05, "click");

    // The detail panel (components/DetailPanel.tsx), sliding in from the right.
    const panel = h("div", {
      class: "abs",
      style: {
        left: 1110,
        top: 300,
        width: 700,
        height: 700,
        boxSizing: "border-box",
        padding: "34px 38px",
        borderRadius: 16,
        border: "1px solid var(--line-2)",
        background: "var(--surface)",
        boxShadow: "0 40px 100px rgba(0,0,0,.6)",
      },
    });
    const tile = h(
      "div",
      { style: { width: 52, height: 52, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${typeColor("aws.rds")}24` } },
      sized(glyph("database", typeColor("aws.rds")), 30),
    );
    const header = h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "18px" } },
      tile,
      h(
        "div",
        {},
        h("div", { style: { fontSize: 32, fontWeight: 650, color: "var(--ink)", lineHeight: 1.2 } }, "Orders DB"),
        h("div", { class: "mono", style: { fontSize: 20, color: "var(--ink-3)" } }, "aws.rds"),
      ),
    );
    const label = (text: string) =>
      h("div", { class: "kicker", style: { fontSize: 17, color: "var(--ink-3)", margin: "30px 0 12px" } }, text);
    const desc = h("div", { style: { fontSize: 23, lineHeight: 1.45, color: "var(--ink-2)" } }, "Every order, with its line items and refunds.");
    const tabs = h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "10px" } },
      pill("schema", { mono: true, size: 19, color: "var(--ink)", bg: "var(--surface-3)" }),
      h("span", { style: { flex: "1" } }),
      ...["json", "yaml", "table", "markdown"].map((f) =>
        pill(f, { mono: true, size: 17, color: f === "table" ? "var(--accent-ink)" : "var(--ink-3)", bg: f === "table" ? "var(--accent)" : "transparent" }),
      ),
    );
    const rows = [
      ["id", "uuid"],
      ["customer_id", "uuid"],
      ["total_cents", "int"],
      ["status", "text"],
      ["created_at", "timestamptz"],
    ];
    const cell = (text: string, head = false) =>
      h("div", { class: "mono", style: { padding: "0 18px", height: 46, display: "flex", alignItems: "center", fontSize: 21, color: head ? "var(--ink-3)" : "var(--ink)", borderTop: head ? "none" : "1px solid var(--line)" } }, text);
    const table = h("div", {
      style: { display: "grid", gridTemplateColumns: "1.3fr 1fr", marginTop: "14px", border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", background: "var(--code-bg)" },
    });
    table.append(cell("column", true), cell("type", true));
    const bodyCells = rows.flatMap(([c, t]) => [cell(c!), cell(t!)]);
    table.append(...bodyCells);
    const valid = h(
      "div",
      { class: "mono", style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "18px", fontSize: 20, color: "var(--accent)" } },
      icon("checkCircle", 22),
      "valid table",
    );
    panel.append(header, label("Description"), desc, label("Payloads"), tabs, table, valid);
    overlay.append(panel);

    gsap.set(panel, { x: 820 });
    master.to(panel, { x: 0, duration: 0.5, ease: "expo.out" }, t0 + 0.08);
    cue(t0 + 0.08, "whoosh", { dur: 0.35, gain: 0.5 });
    gsap.set([...bodyCells, valid], { opacity: 0 });
    rows.forEach((_, i) => {
      const t = t0 + 0.42 + i * (BEAT / 4);
      master.to(bodyCells.slice(i * 2, i * 2 + 2), { opacity: 1, duration: 0.12 }, t);
      cue(t, "tick", { gain: 0.6, pitch: i * 2 });
    });
    master.to(valid, { opacity: 1, duration: 0.2 }, t0 + 0.42 + rows.length * (BEAT / 4) + 0.05);
    cue(t0 + 0.42 + rows.length * (BEAT / 4) + 0.05, "success", { gain: 0.7 });
    master.to(panel, { x: 900, duration: 0.3, ease: "power3.in" }, t1 - 0.3);
  },
};

function sized<T extends SVGElement>(el: T, size: number): T {
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  return el;
}

