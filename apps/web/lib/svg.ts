/**
 * Pure SVG renderer for an Archer document — no React, no DOM. Powers the
 * public embed endpoint (`/share/<slug>/image.svg`) so a README can show a live
 * architecture diagram. Mirrors the canvas look in `components/nodes.tsx`.
 */

import {
  autoLayout,
  effectiveDisplay,
  layoutMap,
  parse,
  pathToString,
  type ArchDoc,
  type ComponentNode,
} from "@archer/lang";
import { GLYPHS, lookupType } from "@archer/catalog";
import { BOX_COST, chipWidth, routeEdge, type Obstacle } from "./edgeRoute";

/** One grid cell in pixels (mirrors lib/toFlow.ts, which is client-only). */
const CELL = 40;
const PAD = 40;
const TITLE_H = 36;
/** Height of a plane's title bar (the rule under the name). */
const PLANE_TITLE = 32;

export interface RenderOptions {
  theme?: "light" | "dark";
  showTitle?: boolean;
  /** Paint the ground behind the diagram (default true). Off for in-app thumbnails. */
  background?: boolean;
}

interface Palette {
  ground: string;
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  edge: string;
  fallback: string;
}

/* Copied from app/globals.css tokens. */
const LIGHT: Palette = {
  ground: "#f7f5f1",
  surface: "#ffffff",
  surface2: "#f4f2ee",
  ink: "#1a1916",
  ink2: "#5f5a52",
  ink3: "#9b958b",
  line: "#e7e3dc",
  line2: "#d2ccc3",
  edge: "#8a8479",
  fallback: "#64748b",
};
const DARK: Palette = {
  ground: "#121315",
  surface: "#161719",
  surface2: "#1c1e21",
  ink: "#ecebe7",
  ink2: "#a5a19a",
  ink3: "#6d6963",
  line: "#26292d",
  line2: "#383c42",
  edge: "#7c8088",
  fallback: "#94a3b8",
};

const SANS = `-apple-system, "Inter", "Segoe UI", Roboto, sans-serif`;
const MONO = `ui-monospace, "SF Mono", Menlo, monospace`;

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const alpha = (hex: string, a: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Truncate to fit `width` px at `pxPerChar`, adding an ellipsis. */
const fit = (text: string, width: number, pxPerChar: number): string => {
  const max = Math.max(1, Math.floor(width / pxPerChar));
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + "…";
};

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const towardWhite = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};
/** Near-black brand colors vanish on a dark ground — lift them (mirrors useIsDark). */
export const displayColor = (hex: string, dark: boolean): string => {
  if (!dark || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const lum = luminance(hex);
  return lum >= 0.22 ? hex : towardWhite(hex, 0.55 - lum);
};

const glyphSvg = (key: string, size: number, color: string, x: number, y: number): string =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color}">${GLYPHS[key] ?? GLYPHS.box!}</svg>`;

interface Box {
  path: string;
  node: ComponentNode;
  x: number;
  y: number;
  w: number;
  h: number;
  plane: boolean;
  color: string;
  glyph: string;
}

export function renderArchSvg(source: string, opts: RenderOptions = {}): string {
  const dark = opts.theme === "dark";
  const P = dark ? DARK : LIGHT;
  const showTitle = opts.showTitle ?? true;
  const background = opts.background ?? true;

  let doc: ArchDoc;
  try {
    const parsed = parse(source);
    if (parsed.diagnostics.some((d) => d.severity === "error" && d.code === "E001"))
      throw new Error("parse error");
    doc = autoLayout(parsed.doc);
  } catch {
    return invalidSvg(P, background);
  }

  const layout = layoutMap(doc);
  const boxes: Box[] = [];
  const visibleAncestor = new Map<string, string>();

  const walk = (
    items: ComponentNode[],
    prefix: string,
    visible: boolean,
    collapsed: string | null,
    origin: [number, number],
  ) => {
    for (const c of items) {
      const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
      const entry = layout.get(path);
      const display = effectiveDisplay(c, entry);
      const isVisible = visible && collapsed === null;
      visibleAncestor.set(path, collapsed ?? path);
      const at = entry?.at ?? [0, 0];
      const size = entry?.size ?? [4, 3];
      const abs: [number, number] = [origin[0] + at[0] * CELL, origin[1] + at[1] * CELL];
      if (isVisible) {
        const type = c.type ? lookupType(c.type) : undefined;
        boxes.push({
          path,
          node: c,
          x: abs[0],
          y: abs[1],
          w: size[0] * CELL,
          h: size[1] * CELL,
          plane: display === "plane" && c.children.length > 0,
          color: displayColor(type?.color ?? P.fallback, dark),
          glyph: type?.glyph ?? "box",
        });
      }
      const childCollapsed = collapsed ?? (display === "icon" && c.children.length > 0 ? path : null);
      walk(c.children, path, isVisible, childCollapsed, abs);
    }
  };
  walk(doc.components, "", true, null, [0, 0]);

  if (boxes.length === 0) return emptySvg(P, doc.title, showTitle, background);

  // Bounds → translate so the diagram starts at (PAD, PAD + title).
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const top = PAD + (showTitle ? TITLE_H : 0);
  const dx = PAD - minX;
  const dy = top - minY;
  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD + top);

  const byPath = new Map(boxes.map((b) => [b.path, b]));
  const out: string[] = [];

  // Planes first (behind), then leaves, so nested leaves paint over their parent.
  const ordered = [...boxes].sort((a, b) => Number(b.plane) - Number(a.plane));
  for (const b of ordered) {
    const x = b.x + dx;
    const y = b.y + dy;
    const name = b.node.name ?? b.node.id;
    if (b.plane) {
      const stroke = alpha(b.color, 0.35);
      const fill = b.node.type ? alpha(b.color, 0.05) : alpha(P.surface2, 0.5);
      out.push(
        `<g>` +
          `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="8" fill="${fill}" stroke="${stroke}"/>` +
          `<path d="M${x + 0.5} ${y + 32}h${b.w - 1}" stroke="${alpha(b.color, 0.2)}"/>` +
          glyphSvg(b.glyph, 16, b.color, x + 10, y + 8) +
          `<text x="${x + 32}" y="${y + 20.5}" font-family='${SANS}' font-size="12" font-weight="600" fill="${P.ink}">${esc(fit(name, b.w - 44 - (b.node.type ? b.node.type.length * 6 + 10 : 0), 6.8))}</text>` +
          (b.node.type
            ? `<text x="${x + b.w - 10}" y="${y + 20.5}" text-anchor="end" font-family='${MONO}' font-size="10" fill="${P.ink3}">${esc(b.node.type)}</text>`
            : "") +
          `</g>`,
      );
    } else {
      const collapsedCount = b.node.children.length;
      const sub = (b.node.type ?? "component") + (collapsedCount > 0 ? ` · ${collapsedCount} inside` : "");
      const tileX = x + 12;
      const tileY = y + (b.h - 32) / 2;
      const textX = x + 12 + 32 + 10;
      const textW = b.w - (textX - x) - 10;
      const midY = y + b.h / 2;
      out.push(
        `<g>` +
          `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="6" fill="${P.surface}" stroke="${P.line2}"/>` +
          `<rect x="${tileX}" y="${tileY}" width="32" height="32" rx="6" fill="${alpha(b.color, 0.14)}"/>` +
          glyphSvg(b.glyph, 18, b.color, tileX + 7, tileY + 7) +
          `<text x="${textX}" y="${midY - 2}" font-family='${SANS}' font-size="13" font-weight="600" fill="${P.ink}">${esc(fit(name, textW, 6.8))}</text>` +
          `<text x="${textX}" y="${midY + 12}" font-family='${MONO}' font-size="10" fill="${P.ink3}">${esc(fit(sub, textW, 6.2))}</text>` +
          `</g>`,
      );
    }
  }

  // Edges.
  const edgeOut: string[] = [];
  const leafRects = boxes
    .filter((b) => !b.plane)
    .map((b) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
  const chipRects: { x: number; y: number; w: number; h: number }[] = [];
  let needEnd = false;
  let needStart = false;
  // Routed like the canvas (lib/edgeRoute.ts): bends go where the path clears
  // boxes and plane title bars, and around unrelated planes when possible.
  const obstaclesFor = (source: string, target: string): Obstacle[] => {
    const list: Obstacle[] = [];
    for (const b of boxes) {
      if (b.path === source || b.path === target) continue;
      const r = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
      if (!b.plane) {
        list.push({ ...r, cost: BOX_COST });
        continue;
      }
      list.push({ ...r, h: PLANE_TITLE, cost: BOX_COST / 4 });
      if (!source.startsWith(b.path + ".") && !target.startsWith(b.path + "."))
        list.push({ ...r, cost: BOX_COST / 20 });
    }
    return list;
  };
  doc.connections.forEach((c) => {
    const s = byPath.get(visibleAncestor.get(pathToString(c.source)) ?? "");
    const t = byPath.get(visibleAncestor.get(pathToString(c.target)) ?? "");
    if (!s || !t || s === t) return;
    const sr = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    const tr = { x: t.x + dx, y: t.y + dy, w: t.w, h: t.h };
    const route = routeEdge(
      sr,
      tr,
      obstaclesFor(s.path, t.path),
      chipWidth(c.type, c.label, c.payloads.length),
    );
    let p1: { x: number; y: number };
    let p2: { x: number; y: number };
    let d: string;
    // Candidate positions for the label chip: the bend first, then the
    // near-source and near-target segments. The first one that overlaps no
    // leaf node and no earlier chip wins.
    const candidates: { x: number; y: number }[] = [];
    if (route.horizontal) {
      const right = route.from === "r";
      const sign = right ? 1 : -1;
      p1 = { x: right ? sr.x + sr.w : sr.x, y: sr.y + sr.h / 2 };
      p2 = { x: right ? tr.x : tr.x + tr.w, y: tr.y + tr.h / 2 };
      const mx = route.mid;
      d = `M${p1.x} ${p1.y}H${mx}V${p2.y}H${p2.x}`;
      candidates.push(
        { x: mx, y: (p1.y + p2.y) / 2 },
        { x: (p1.x + mx) / 2, y: p1.y },
        { x: (mx + p2.x) / 2, y: p2.y },
        { x: p1.x + sign * 60, y: p1.y },
      );
    } else {
      const down = route.from === "b";
      p1 = { x: sr.x + sr.w / 2, y: down ? sr.y + sr.h : sr.y };
      p2 = { x: tr.x + tr.w / 2, y: down ? tr.y : tr.y + tr.h };
      const my = route.mid;
      d = `M${p1.x} ${p1.y}V${my}H${p2.x}V${p2.y}`;
      candidates.push(
        { x: (p1.x + p2.x) / 2, y: my },
        { x: p1.x, y: (p1.y + my) / 2 },
        { x: p2.x, y: (my + p2.y) / 2 },
      );
    }
    const markerEnd = c.arrow !== "--" ? ` marker-end="url(#arrow-end)"` : "";
    const markerStart = c.arrow === "<->" ? ` marker-start="url(#arrow-start)"` : "";
    if (c.arrow !== "--") needEnd = true;
    if (c.arrow === "<->") needStart = true;
    edgeOut.push(
      `<path d="${d}" fill="none" stroke="${P.edge}" stroke-width="1.5"${markerEnd}${markerStart}/>`,
    );
    const parts: string[] = [];
    if (c.type) parts.push(c.type);
    if (c.label) parts.push(c.label);
    if (parts.length > 0) {
      const label = parts.join(" · ");
      const lw = Math.round(label.length * 6 + 12);
      const clear = (cx: number, cy: number): boolean => {
        const r = { x: cx - lw / 2, y: cy - 9, w: lw, h: 18 };
        const hits = (b: { x: number; y: number; w: number; h: number }) =>
          r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h;
        return !leafRects.some(hits) && !chipRects.some(hits);
      };
      let spot = candidates.find((c) => clear(c.x, c.y));
      if (!spot) {
        // Nothing on the path is free: drop the chip just below whatever it
        // overlaps (a node it passes behind, or an earlier chip).
        spot = { ...candidates[0]! };
        for (let i = 0; i < 4 && !clear(spot.x, spot.y); i++) {
          const r = { x: spot.x - lw / 2, y: spot.y - 9, w: lw, h: 18 };
          const blockers = [...leafRects, ...chipRects].filter(
            (b) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h,
          );
          if (blockers.length === 0) break;
          spot.y = Math.max(...blockers.map((b) => b.y + b.h)) + 9 + 6;
        }
      }
      const lx = spot.x;
      const ly = spot.y;
      chipRects.push({ x: lx - lw / 2, y: ly - 9, w: lw, h: 18 });
      edgeOut.push(
        `<g>` +
          `<rect x="${lx - lw / 2}" y="${ly - 9}" width="${lw}" height="18" rx="4" fill="${P.surface}" stroke="${P.line}"/>` +
          (c.type
            ? `<text x="${lx - lw / 2 + 6}" y="${ly + 3.5}" font-family='${MONO}' font-size="10" fill="${P.ink2}">${esc(c.type)}</text>` +
              (c.label
                ? `<text x="${lx - lw / 2 + 6 + c.type.length * 6 + 4}" y="${ly + 3.5}" font-family='${SANS}' font-size="10" fill="${P.ink}">· ${esc(c.label)}</text>`
                : "")
            : `<text x="${lx - lw / 2 + 6}" y="${ly + 3.5}" font-family='${SANS}' font-size="10" fill="${P.ink}">${esc(c.label ?? "")}</text>`) +
          `</g>`,
      );
    }
  });

  const defs =
    `<defs>` +
    (needEnd
      ? `<marker id="arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="${P.edge}"/></marker>`
      : "") +
    (needStart
      ? `<marker id="arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M9 1L1 5L9 9z" fill="${P.edge}"/></marker>`
      : "") +
    `</defs>`;

  const title = showTitle
    ? `<text x="${PAD}" y="${PAD + 12}" font-family='${SANS}' font-size="16" font-weight="700" fill="${P.ink}">${esc(doc.title)}</text>` +
      `<text x="${width - PAD}" y="${PAD + 12}" text-anchor="end" font-family='${SANS}' font-size="11" font-weight="600" letter-spacing="0.04em" fill="${P.ink3}">ARCHER</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(doc.title)}">` +
    `<title>${esc(doc.title)}</title>` +
    defs +
    (background ? `<rect width="${width}" height="${height}" fill="${P.ground}"/>` : "") +
    title +
    out.join("") +
    edgeOut.join("") +
    `</svg>`
  );
}

const invalidSvg = (P: Palette, background: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">${background ? `<rect width="320" height="80" rx="8" fill="${P.ground}" stroke="${P.line}"/>` : ""}<text x="160" y="45" text-anchor="middle" font-family='${SANS}' font-size="13" fill="${P.ink2}">Invalid document</text></svg>`;

const emptySvg = (P: Palette, title: string, showTitle: boolean, background: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120"><title>${esc(title)}</title>` +
  (background ? `<rect width="320" height="120" rx="8" fill="${P.ground}" stroke="${P.line}"/>` : "") +
  (showTitle
    ? `<text x="20" y="34" font-family='${SANS}' font-size="16" font-weight="700" fill="${P.ink}">${esc(title)}</text>`
    : "") +
  `<text x="20" y="72" font-family='${SANS}' font-size="12" fill="${P.ink3}">No components yet</text></svg>`;
