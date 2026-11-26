/**
 * Pure SVG renderer for a document's views (spec §6): sequences, flows,
 * state machines and data models. Draws the same geometry as the editor
 * (lib/sequenceLayout.ts, lib/graphLayout.ts) in the share image's style
 * (lib/svg.ts), for `/share/<slug>/image.svg?view=<id>`, the MCP tool
 * `render_project` and the editor's "Download SVG".
 */

import {
  findComponent,
  findView,
  parse,
  pathToString,
  viewPositions,
  type ArchDoc,
  type FlowNode,
  type MachineNode,
  type ModelNode,
  type SequenceNode,
} from "@archer/lang";
import type { Logo } from "@archer/catalog";
import { HEAD_H, HEAD_W, layoutSequence } from "./sequenceLayout";
import {
  ENTITY_HEAD,
  FIELD_ROW,
  LANE_HEAD,
  layoutFlow,
  layoutMachine,
  layoutModel,
  routeEdges,
  type RoutedEdge,
} from "./graphLayout";
import { MONO_FONT, PALETTES, SANS_FONT, componentIconSvg, escapeXml as esc, fitText as fit, type Palette } from "./svg";

export interface ViewRenderOptions {
  theme?: "light" | "dark";
  /** Draw the view's name above it (default true). */
  showTitle?: boolean;
  background?: boolean;
  logos?: Readonly<Record<string, Logo>>;
}

const ACCENT = { light: "#0c8c5e", dark: "#23c088" } as const;
const ACCENT_INK = { light: "#ffffff", dark: "#08110d" } as const;
const NOTE = { light: "#fbf3ea", dark: "#2a2219" } as const;
const TITLE_H = 44;
const PAD = 16;

interface Ctx {
  P: Palette;
  dark: boolean;
  accent: string;
  accentInk: string;
  doc: ArchDoc;
  logos?: Readonly<Record<string, Logo>>;
}

const text = (x: number, y: number, s: string, size: number, fill: string, extra = ""): string =>
  `<text x="${x}" y="${y}" font-family='${SANS_FONT}' font-size="${size}" fill="${fill}"${extra}>${esc(s)}</text>`;

const markers = (c: Ctx): string =>
  `<defs>` +
  `<marker id="vs-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${c.P.ink2}"/></marker>` +
  `<marker id="vs-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="${c.P.ink2}" stroke-width="1.6"/></marker>` +
  `</defs>`;

/** A component's card: its icon and name (the lifeline heads, the lanes). */
const componentLabel = (c: Ctx, path: string[], x: number, y: number, width: number, size = 13): string => {
  const node = findComponent(c.doc, path);
  const icon = node ? componentIconSvg(node, 18, x, y - 13, c.dark, c.logos) : "";
  const tx = icon ? x + 24 : x;
  return icon + text(tx, y, fit(node?.name ?? pathToString(path), width - (tx - x), 7.2), size, node ? c.P.ink : "#b42318", ` font-weight="600"`);
};

/* ------------------------------------------------------------- Sequence */

function sequenceSvg(c: Ctx, seq: SequenceNode): { body: string; w: number; h: number } {
  const L = layoutSequence(seq);
  const { P } = c;
  let s = "";
  for (const l of L.lifelines)
    s += `<line x1="${l.x}" x2="${l.x}" y1="${HEAD_H}" y2="${L.height - 16}" stroke="${P.line2}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  for (const f of L.frames) {
    s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="4" fill="${P.surface2}" fill-opacity="0.45" stroke="${P.edge}"/>`;
    f.branches.forEach((b, i) => {
      if (i > 0) s += `<line x1="${f.x}" x2="${f.x + f.w}" y1="${b.y + 4}" y2="${b.y + 4}" stroke="${P.edge}" stroke-dasharray="5 4"/>`;
      const label = `${i === 0 ? f.fragment : "else"}${b.guard !== undefined ? ` [${b.guard}]` : ""}`;
      const ty = i === 0 ? b.y + 15 : b.y + 21;
      if (i === 0) s += `<path d="M${f.x} ${f.y} H${f.x + label.length * 6.6 + 18} V${f.y + 14} L${f.x + label.length * 6.6 + 10} ${f.y + 22} H${f.x} Z" fill="${P.surface2}" stroke="${P.edge}"/>`;
      s += text(f.x + 8, ty, label, 11, P.ink2);
    });
  }
  for (const m of L.messages) {
    const reply = m.arrow === "-->";
    const marker = m.arrow === "->" ? "vs-solid" : "vs-open";
    const dash = reply ? ` stroke-dasharray="5 4"` : "";
    const d = m.self
      ? `M${m.x1} ${m.y} H${m.x1 + 36} V${m.y2} H${m.x1 + 2}`
      : `M${m.x1} ${m.y} H${m.x2 - (m.x2 >= m.x1 ? 2 : -2)}`;
    s += `<path d="${d}" fill="none" stroke="${P.ink2}" stroke-width="1.5"${dash} marker-end="url(#${marker})"/>`;
    const bx = m.labelX + 9;
    const by = m.labelY - 4;
    s += `<circle cx="${bx}" cy="${by}" r="9" fill="${c.accent}"/>` + text(bx, by + 3.5, String(m.number), 10, c.accentInk, ` text-anchor="middle" font-weight="700"`);
    const label = m.label ?? (reply ? "reply" : "call");
    s += text(m.labelX + 24, m.labelY, label, 12, m.label ? P.ink : P.ink3);
    if (m.type) s += `<text x="${m.labelX + 30 + label.length * 6.6}" y="${m.labelY}" font-family='${MONO_FONT}' font-size="11" fill="${P.ink3}">@${esc(m.type)}</text>`;
  }
  for (const n of L.notes) {
    s += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="3" fill="${NOTE[c.dark ? "dark" : "light"]}" stroke="${P.line2}"/>`;
    s += text(n.x + 10, n.y + 17, fit(n.text, n.w - 20, 6.6), 11, P.ink);
  }
  for (const l of L.lifelines) {
    s += `<rect x="${l.x - HEAD_W / 2}" y="0" width="${HEAD_W}" height="${HEAD_H}" rx="8" fill="${P.surface}" stroke="${P.line2}"/>`;
    s += componentLabel(c, l.path, l.x - HEAD_W / 2 + 12, HEAD_H / 2 + 5, HEAD_W - 24);
  }
  return { body: s, w: L.width, h: L.height };
}

/* ----------------------------------------------------------- Graph bits */

const edgesSvg = (c: Ctx, routes: RoutedEdge[]): string =>
  routes
    .map(
      (r) =>
        `<path d="${r.d}" fill="none" stroke="${c.P.ink2}" stroke-width="1.5" stroke-linejoin="round" marker-end="url(#vs-solid)"/>` +
        (r.label
          ? `<rect x="${r.label.x - 3}" y="${r.label.y - 9}" width="${r.label.text.length * 6.6 + 6}" height="16" fill="${c.P.ground}"/>` +
            text(r.label.x, r.label.y + 3.5, r.label.text, 11, c.P.ink2)
          : ""),
    )
    .join("");

/* ----------------------------------------------------------------- Flow */

function flowSvg(c: Ctx, flow: FlowNode): { body: string; w: number; h: number } {
  const L = layoutFlow(flow, viewPositions(c.doc, flow.id));
  const { P } = c;
  let s = "";
  L.lanes.forEach((l, i) => {
    s += `<rect x="32" y="${l.y}" width="${L.width - 64}" height="${l.h}" fill="${i % 2 ? "none" : P.surface2}" fill-opacity="0.55" stroke="${P.line}"/>`;
    s += `<line x1="${32 + LANE_HEAD}" x2="${32 + LANE_HEAD}" y1="${l.y}" y2="${l.y + l.h}" stroke="${P.line}"/>`;
    const key = L.laneKeys[i];
    s += key == null ? text(44, l.y + l.h / 2 + 4, "No lane", 12, P.ink3) : componentLabel(c, key.split("."), 44, l.y + l.h / 2 + 5, LANE_HEAD - 24, 12);
  });
  s += edgesSvg(c, routeEdges(flow.edges, L.boxes));
  for (const n of flow.nodes) {
    const b = L.boxes.get(n.id)!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (n.node === "start") s += `<circle cx="${cx}" cy="${cy}" r="${b.w / 2}" fill="${P.ink}"/>`;
    else if (n.node === "end")
      s += `<circle cx="${cx}" cy="${cy}" r="${b.w / 2 - 1}" fill="none" stroke="${P.ink}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${b.w / 2 - 6}" fill="${P.ink}"/>`;
    else if (n.node === "decision")
      s += `<path d="M${cx} ${b.y} L${b.x + b.w} ${cy} L${cx} ${b.y + b.h} L${b.x} ${cy} Z" fill="${P.surface}" stroke="${P.line2}" stroke-width="1.25"/>`;
    else s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${P.surface}" stroke="${P.line2}"/>`;
    const label = n.name ?? (n.node === "step" || n.node === "decision" ? n.id : undefined);
    if (!label) continue;
    if (n.node === "start" || n.node === "end") s += text(cx, b.y + b.h + 14, label, 11, P.ink2, ` text-anchor="middle"`);
    else s += text(cx, cy + 4, fit(label, b.w * (n.node === "decision" ? 0.7 : 1) - 16, 6.8), 12, P.ink, ` text-anchor="middle"`);
  }
  return { body: s, w: L.width, h: L.height };
}

/* -------------------------------------------------------- State machine */

function statesSvg(c: Ctx, m: MachineNode): { body: string; w: number; h: number } {
  const L = layoutMachine(m, viewPositions(c.doc, m.id));
  const { P } = c;
  let s = "";
  for (const st of m.states.filter((x) => x.initial)) {
    const b = L.boxes.get(st.id)!;
    const y = b.y + b.h / 2;
    s += `<circle cx="${b.x - 34}" cy="${y}" r="7" fill="${P.ink}"/><path d="M${b.x - 27} ${y} H${b.x - 2}" stroke="${P.ink2}" stroke-width="1.5" marker-end="url(#vs-solid)"/>`;
  }
  s += edgesSvg(c, routeEdges(m.transitions, L.boxes));
  for (const st of m.states) {
    const b = L.boxes.get(st.id)!;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${P.surface}" stroke="${P.line2}"/>`;
    if (st.final) s += `<rect x="${b.x + 3}" y="${b.y + 3}" width="${b.w - 6}" height="${b.h - 6}" rx="${(b.h - 6) / 2}" fill="none" stroke="${P.line2}"/>`;
    s += text(b.x + b.w / 2, b.y + b.h / 2 + 4, fit(st.name ?? st.id, b.w - 24, 7), 12, P.ink, ` text-anchor="middle" font-weight="500"`);
  }
  if (m.of) s += text(32, 18, `States of ${findComponent(c.doc, m.of)?.name ?? pathToString(m.of)}`, 11, P.ink3);
  return { body: s, w: L.width, h: L.height };
}

/* ----------------------------------------------------------- Data model */

function modelSvg(c: Ctx, m: ModelNode): { body: string; w: number; h: number } {
  const L = layoutModel(m, viewPositions(c.doc, m.id));
  const { P } = c;
  let s = "";
  for (const r of L.refs) {
    const crow = (p: { x: number; y: number; dir: 1 | -1 }) =>
      `M${p.x} ${p.y - 6} L${p.x + p.dir * 10} ${p.y} L${p.x} ${p.y + 6} M${p.x + p.dir * 12} ${p.y - 6} V${p.y + 6}`;
    const bar = (p: { x: number; y: number; dir: 1 | -1 }) => `M${p.x + p.dir * 6} ${p.y - 6} V${p.y + 6} M${p.x + p.dir * 10} ${p.y - 6} V${p.y + 6}`;
    s += `<path d="${r.d} ${crow(r.many)} ${bar(r.one)}" fill="none" stroke="${P.ink2}" stroke-width="1.4"/>`;
  }
  for (const e of m.entities) {
    const b = L.boxes.get(e.id)!;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${P.surface}" stroke="${P.line2}"/>`;
    s += `<path d="M${b.x} ${b.y + ENTITY_HEAD} V${b.y + 8} Q${b.x} ${b.y} ${b.x + 8} ${b.y} H${b.x + b.w - 8} Q${b.x + b.w} ${b.y} ${b.x + b.w} ${b.y + 8} V${b.y + ENTITY_HEAD} Z" fill="${P.surface2}"/>`;
    s += `<line x1="${b.x}" x2="${b.x + b.w}" y1="${b.y + ENTITY_HEAD}" y2="${b.y + ENTITY_HEAD}" stroke="${P.line}"/>`;
    s += text(b.x + 12, b.y + 21, fit(e.name ?? e.id, b.w - 24, 7.4), 13, P.ink, ` font-weight="600"`);
    e.fields.forEach((f, i) => {
      const y = b.y + ENTITY_HEAD + i * FIELD_ROW + FIELD_ROW / 2 + 4;
      let tag = f.pk ? "PK" : f.ref ? "FK" : f.unique ? "UQ" : "";
      if (f.pk && f.ref) tag = "PK FK";
      s += `<text x="${b.x + 12}" y="${y}" font-family='${MONO_FONT}' font-size="11" fill="${P.ink}"${f.pk ? ` font-weight="700"` : ""}>${esc(f.name)}${f.optional ? `<tspan fill="${P.ink3}">?</tspan>` : ""}</text>`;
      if (tag) s += text(b.x + 18 + (f.name.length + (f.optional ? 1 : 0)) * 6.8, y, tag, 9, f.pk ? c.accent : P.ink2, ` font-weight="700"`);
      s += `<text x="${b.x + b.w - 12}" y="${y}" text-anchor="end" font-family='${MONO_FONT}' font-size="11" fill="${P.ink3}">${esc(f.type)}</text>`;
    });
  }
  if (m.on) s += text(32, 18, `Model of ${findComponent(c.doc, m.on)?.name ?? pathToString(m.on)}`, 11, P.ink3);
  return { body: s, w: L.width, h: L.height };
}

/* ---------------------------------------------------------------- Entry */

const KIND_TITLES = { sequence: "Sequence", flow: "Flow", states: "State machine", entities: "Data model" } as const;

/**
 * One view of a document as a standalone SVG. An unknown view id, or a
 * document that doesn't parse, draws a small notice instead.
 */
export function renderViewSvg(source: string, viewId: string, opts: ViewRenderOptions = {}): string {
  const theme = opts.theme === "dark" ? "dark" : "light";
  const P = PALETTES[theme];
  const background = opts.background ?? true;
  const showTitle = opts.showTitle ?? true;
  const notice = (msg: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">${background ? `<rect width="360" height="80" rx="8" fill="${P.ground}" stroke="${P.line}"/>` : ""}${text(180, 45, msg, 13, P.ink2, ` text-anchor="middle"`)}</svg>`;
  let doc: ArchDoc;
  try {
    const parsed = parse(source);
    if (parsed.diagnostics.some((d) => d.code === "E001")) return notice("Invalid document");
    doc = parsed.doc;
  } catch {
    return notice("Invalid document");
  }
  const ref = findView(doc, viewId);
  if (!ref) return notice(`No view '${viewId}' in this document`);
  const c: Ctx = { P, dark: theme === "dark", accent: ACCENT[theme], accentInk: ACCENT_INK[theme], doc, ...(opts.logos ? { logos: opts.logos } : {}) };
  const drawn =
    ref.kind === "sequence"
      ? sequenceSvg(c, ref.node as SequenceNode)
      : ref.kind === "flow"
        ? flowSvg(c, ref.node as FlowNode)
        : ref.kind === "states"
          ? statesSvg(c, ref.node as MachineNode)
          : modelSvg(c, ref.node as ModelNode);
  const top = showTitle ? TITLE_H : PAD;
  const w = Math.ceil(drawn.w + PAD * 2);
  const h = Math.ceil(drawn.h + top + PAD);
  const name = ref.node.name ?? ref.node.id;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<title>${esc(`${name} · ${doc.title}`)}</title>` +
    markers(c) +
    (background ? `<rect width="${w}" height="${h}" rx="8" fill="${P.ground}"/>` : "") +
    (showTitle
      ? text(PAD + 8, 28, name, 16, P.ink, ` font-weight="700"`) +
        text(PAD + 16 + name.length * 9.2, 28, `${KIND_TITLES[ref.kind]} · ${doc.title}`, 12, P.ink3)
      : "") +
    `<g transform="translate(${PAD} ${top})">${drawn.body}</g>` +
    `</svg>`
  );
}
