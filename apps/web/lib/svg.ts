/**
 * Pure SVG renderer for an Archer document — no React, no DOM. Powers the
 * public embed endpoint (`/share/<slug>/image.svg`) so a README can show a live
 * architecture diagram. Mirrors the canvas look in `components/nodes.tsx`:
 * the document's top level, planes as regions, and each component as a box
 * (one with components nested in it says how many).
 */

import {
  EMPTY_PLANE_SIZE,
  LEAF_SIZE,
  autoLayout,
  layoutMap,
  parse,
  planeTree,
  shapeOf,
  type ArchDoc,
  type ComponentNode,
  type PlaneNode,
} from "@archer/lang";
import { GLYPHS, GLYPH_VIEWBOX, lookupType, type Logo } from "@archer/catalog";
import { iconMarkup } from "@archer/catalog/icons";
import { LABEL, labelLayout, shapeGeometry, type ShapeGeometry } from "./shapes";
import {
  BOX_COST,
  bendOf,
  chipWidth,
  routeEdge,
  separateBends,
  untangle,
  type Obstacle,
  type RoutedEdge,
} from "./edgeRoute";

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
  /**
   * Product logos to draw catalog types with (`@archer/catalog/logos`); without
   * them every type draws its glyph, as on the landing page.
   */
  logos?: Readonly<Record<string, Logo>>;
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

/**
 * Break `text` into at most `lines` lines of `width` px, at spaces where it
 * can (the canvas's line-clamp); the last line is truncated.
 */
const wrap = (text: string, width: number, pxPerChar: number, lines: number): string[] => {
  const words = text.trim().split(/\s+/);
  const flat = words.join(" ");
  const max = Math.max(1, Math.floor(width / pxPerChar));
  if (flat.length <= max || lines <= 1) return [fit(flat, width, pxPerChar)];
  let head = "";
  for (const word of words) {
    const next = head === "" ? word : `${head} ${word}`;
    if (next.length > max) break;
    head = next;
  }
  if (head === "") head = flat.slice(0, max);
  return [head, ...wrap(flat.slice(head.length), width, pxPerChar, lines - 1)];
};

/** Mix two #rrggbb colors: `t` of `a`, the rest `b` (CSS color-mix in srgb). */
export const mix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * t + ((pb >> shift) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
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

const markupSvg = (body: string, size: number, color: string, x: number, y: number): string =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${GLYPH_VIEWBOX}" style="color:${color}">${body}</svg>`;

const glyphSvg = (key: string, size: number, color: string, x: number, y: number): string =>
  markupSvg(GLYPHS[key] ?? GLYPHS.box!, size, color, x, y);

/** A logo like components/logos.tsx draws it: a mark in its brand color, or artwork as it is. */
const logoSvg = (logo: Logo, size: number, x: number, y: number, dark: boolean): string =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${logo.viewBox}"` +
  (logo.kind === "mono" ? ` style="color:${displayColor(logo.color!, dark)}"` : "") +
  `>${logo.body}</svg>`;

/** A box's icon: the one it picked, else its logo when it has one, else its glyph. */
const iconSvg = (b: Box, size: number, x: number, y: number, dark: boolean): string =>
  b.icon
    ? markupSvg(b.icon, size, b.color, x, y)
    : b.logo
      ? logoSvg(b.logo, size, x, y, dark)
      : glyphSvg(b.glyph, size, b.color, x, y);

/** Whether a component shows an icon (mirrors nodes.tsx): its own, or its type's. */
const hasIcon = (b: Box): boolean => b.icon !== undefined || b.node.type !== undefined;

interface Box {
  path: string;
  node: ComponentNode | PlaneNode;
  x: number;
  y: number;
  w: number;
  h: number;
  plane: boolean;
  /** The planes it sits on, innermost first. */
  on: string[];
  color: string;
  glyph: string;
  logo: Logo | undefined;
  /** Markup of the icon the component picked (`icon <name>`), drawn instead of glyph or logo. */
  icon?: string;
  /** Drawn as a shape (lib/shapes.ts) instead of the card. */
  shape?: ShapeGeometry;
}

/**
 * How many components are nested in one, in its bottom-right corner (mirrors
 * nodes.tsx NestedBadge): a stack glyph and the count.
 */
const nestedBadge = (x: number, y: number, w: number, h: number, count: number, P: Palette): string => {
  const text = String(count);
  const pw = 4 + 11 + 3 + text.length * 6.5 + 5;
  const px = x + w - 5 - pw;
  const py = y + h - 5 - 16;
  return (
    `<rect x="${px}" y="${py}" width="${pw}" height="16" rx="4" fill="${P.surface2}"/>` +
    glyphSvg("stack", 11, P.ink3, px + 4, py + 2.5) +
    `<text x="${px + 18}" y="${py + 11.5}" font-family='${SANS}' font-size="11" fill="${P.ink3}">${text}</text>`
  );
};

/** How far in from each side of a box its edges end: a shape's outline, or the card's border. */
const NO_INSET = { t: 0, r: 0, b: 0, l: 0 };
const insets = (b: Box) => b.shape?.anchors ?? NO_INSET;

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
  const tree = planeTree({ components: doc.components, planes: doc.planes });

  const walk = (on: PlaneNode | undefined, origin: [number, number], chain: string[]) => {
    for (const item of tree.itemsOn(on)) {
      const path = item.id;
      const entry = layout.get(path);
      const at = entry?.at ?? [0, 0];
      const plane = item.kind === "plane";
      const size = entry?.size ?? (plane ? EMPTY_PLANE_SIZE : LEAF_SIZE);
      const abs: [number, number] = [origin[0] + at[0] * CELL, origin[1] + at[1] * CELL];
      const type = item.type ? lookupType(item.type) : undefined;
      const shape = item.kind === "component" ? shapeOf(item) : "box";
      const icon = item.kind === "component" ? iconMarkup(item.icon) : undefined;
      const w = size[0] * CELL;
      const h = size[1] * CELL;
      boxes.push({
        path,
        node: item,
        x: abs[0],
        y: abs[1],
        w,
        h,
        plane,
        on: chain,
        color: displayColor(type?.color ?? P.fallback, dark),
        glyph: type?.glyph ?? "box",
        logo: type?.logo === undefined ? undefined : opts.logos?.[type.logo],
        ...(icon !== undefined ? { icon } : {}),
        ...(shape !== "box" ? { shape: shapeGeometry(shape, w, h) } : {}),
      });
      if (item.kind === "plane") walk(item, abs, [path, ...chain]);
    }
  };
  walk(undefined, [0, 0], []);

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
          iconSvg(b, 16, x + 10, y + 8, dark) +
          `<text x="${x + 32}" y="${y + 20.5}" font-family='${SANS}' font-size="12" font-weight="600" fill="${P.ink}">${esc(fit(name, b.w - 44 - (b.node.type ? b.node.type.length * 6 + 10 : 0), 6.8))}</text>` +
          (b.node.type
            ? `<text x="${x + b.w - 10}" y="${y + 20.5}" text-anchor="end" font-family='${MONO}' font-size="10" fill="${P.ink3}">${esc(b.node.type)}</text>`
            : "") +
          `</g>`,
      );
    } else if (b.shape) {
      out.push(shapeSvg(b, x, y, P, dark));
    } else {
      const nested = b.node.kind === "component" ? b.node.children.length : 0;
      const sub = b.node.type ?? "component";
      const tileX = x + 12;
      const tileY = y + (b.h - 32) / 2;
      const tile = hasIcon(b);
      const textX = tile ? x + 12 + 32 + 10 : x + 12;
      const textW = b.w - (textX - x) - 10;
      const midY = y + b.h / 2;
      out.push(
        `<g>` +
          // A second card behind it, like a stack, when components are nested in it.
          (nested > 0
            ? `<rect x="${x + 3}" y="${y + 3}" width="${b.w}" height="${b.h}" rx="6" fill="${P.surface}" stroke="${P.line2}"/>`
            : "") +
          `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="6" fill="${P.surface}" stroke="${P.line2}"/>` +
          // A vendor's square icon (AWS) takes the tinted tile's place.
          (!tile
            ? ""
            : b.logo?.kind === "tile" && !b.icon
              ? logoSvg(b.logo, 32, tileX, tileY, dark)
              : `<rect x="${tileX}" y="${tileY}" width="32" height="32" rx="6" fill="${alpha(b.color, 0.14)}"/>` +
                iconSvg(b, 18, tileX + 7, tileY + 7, dark)) +
          `<text x="${textX}" y="${midY - 2}" font-family='${SANS}' font-size="13" font-weight="600" fill="${P.ink}">${esc(fit(name, textW, 6.8))}</text>` +
          `<text x="${textX}" y="${midY + 12}" font-family='${MONO}' font-size="10" fill="${P.ink3}">${esc(fit(sub, textW, 6.2))}</text>` +
          (nested > 0 ? nestedBadge(x, y, b.w, b.h, nested, P) : "") +
          `</g>`,
      );
    }
  }

  // Edges, then their label chips over all of them (as on the canvas, where
  // labels sit above every edge), so a later edge never strikes through a chip.
  const edgeOut: string[] = [];
  const chipOut: string[] = [];
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
    const related = new Set([...(byPath.get(source)?.on ?? []), ...(byPath.get(target)?.on ?? [])]);
    for (const b of boxes) {
      if (b.path === source || b.path === target) continue;
      const r = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
      if (!b.plane) {
        list.push({ ...r, cost: BOX_COST });
        continue;
      }
      list.push({ ...r, h: PLANE_TITLE, cost: BOX_COST / 4 });
      if (!related.has(b.path)) list.push({ ...r, cost: BOX_COST / 20 });
    }
    return list;
  };
  // A connection to something nested in a component is drawn to that component.
  const boxFor = (path: readonly string[]) => {
    const b = byPath.get(path[0] ?? "");
    return b && !b.plane ? b : undefined;
  };
  const routed: (RoutedEdge & { c: ArchDoc["connections"][number] })[] = [];
  for (const c of doc.connections) {
    const s = boxFor(c.source);
    const t = boxFor(c.target);
    if (!s || !t || s === t) continue;
    const sr = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    const tr = { x: t.x + dx, y: t.y + dy, w: t.w, h: t.h };
    const route = routeEdge(
      sr,
      tr,
      obstaclesFor(s.path, t.path),
      chipWidth(c.type, c.label, c.payloads.length),
    );
    const headAtTarget = c.arrow !== "--";
    routed.push({ c, source: s.path, target: t.path, s: sr, t: tr, route, headAtTarget });
  }
  // Untangle shared handles, then keep parallel bends from merging.
  untangle(routed, obstaclesFor);
  separateBends(routed.map((e) => bendOf(e.route, e.s, e.t, e.source, e.target)));
  // Edges from one side of a box to several others (a component whose
  // nested parts connect out, say) share a trunk, so a chip on it can't say
  // which branch it labels: those chips go on their own branch first.
  const partners = new Map<string, Set<string>>();
  const meet = (box: string, side: string, other: string) => {
    const k = `${box}:${side}`;
    partners.set(k, (partners.get(k) ?? new Set()).add(other));
  };
  for (const e of routed) {
    meet(e.source, e.route.from, e.target);
    meet(e.target, e.route.to, e.source);
  }
  const fanned = (box: string, side: string) => (partners.get(`${box}:${side}`)?.size ?? 0) > 1;
  for (const { c, source, target, s: sr, t: tr, route } of routed) {
    const fanOut = fanned(source, route.from) && !fanned(target, route.to);
    const fanIn = fanned(target, route.to) && !fanned(source, route.from);
    // Edges end where a shape's outline crosses the middle of the side.
    const si = insets(byPath.get(source)!);
    const ti = insets(byPath.get(target)!);
    let p1: { x: number; y: number };
    let p2: { x: number; y: number };
    let d: string;
    // Candidate positions for the label chip: the bend first, then the
    // near-source and near-target segments (a fan's own branch before its
    // shared trunk). The first one that overlaps no leaf node and no earlier
    // chip wins.
    const candidates: { x: number; y: number }[] = [];
    if (route.corner) {
      const right = route.from === "r";
      const down = route.to === "t";
      p1 = { x: right ? sr.x + sr.w - si.r : sr.x + si.l, y: sr.y + sr.h / 2 };
      p2 = { x: tr.x + tr.w / 2, y: down ? tr.y + ti.t : tr.y + tr.h - ti.b };
      d = `M${p1.x} ${p1.y}H${p2.x}V${p2.y}`;
      const legs = [
        { x: (p1.x + p2.x) / 2, y: p1.y },
        { x: p2.x, y: (p1.y + p2.y) / 2 },
      ];
      candidates.push(...(fanOut ? legs.reverse() : legs));
    } else if (route.horizontal) {
      const right = route.from === "r";
      const sign = right ? 1 : -1;
      p1 = { x: right ? sr.x + sr.w - si.r : sr.x + si.l, y: sr.y + sr.h / 2 };
      p2 = { x: right ? tr.x + ti.l : tr.x + tr.w - ti.r, y: tr.y + tr.h / 2 };
      const mx = route.mid;
      d = `M${p1.x} ${p1.y}H${mx}V${p2.y}H${p2.x}`;
      const bend = { x: mx, y: (p1.y + p2.y) / 2 };
      const near = { x: (p1.x + mx) / 2, y: p1.y };
      const far = { x: (mx + p2.x) / 2, y: p2.y };
      candidates.push(
        ...(fanOut ? [far, bend, near] : fanIn ? [near, bend, far] : [bend, near, far]),
        { x: p1.x + sign * 60, y: p1.y },
      );
    } else {
      const down = route.from === "b";
      p1 = { x: sr.x + sr.w / 2, y: down ? sr.y + sr.h - si.b : sr.y + si.t };
      p2 = { x: tr.x + tr.w / 2, y: down ? tr.y + ti.t : tr.y + tr.h - ti.b };
      const my = route.mid;
      d = `M${p1.x} ${p1.y}V${my}H${p2.x}V${p2.y}`;
      const bend = { x: (p1.x + p2.x) / 2, y: my };
      const near = { x: p1.x, y: (p1.y + my) / 2 };
      const far = { x: p2.x, y: (my + p2.y) / 2 };
      candidates.push(
        ...(fanOut ? [far, bend, near] : fanIn ? [near, bend, far] : [bend, near, far]),
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
      chipOut.push(
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
  }

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
    chipOut.join("") +
    `</svg>`
  );
}

/**
 * A component drawn as its shape (mirrors nodes.tsx ArchShapeNode): the
 * outline, tinted by its type, then the label centered in the shape's
 * middle, with as much of glyph, name and tag as `labelLayout` finds room for.
 */
function shapeSvg(b: Box, x: number, y: number, P: Palette, dark: boolean): string {
  const g = b.shape!;
  const typed = b.node.type !== undefined;
  // Tinted by a type that resolves; an unknown one keeps the plain outline, as on the canvas.
  const tinted = lookupType(b.node.type) !== undefined;
  const stroke = tinted ? mix(b.color, P.line2, 0.45) : P.line2;
  const fill = tinted ? mix(b.color, P.surface, 0.05) : P.surface;
  const inside = b.node.kind === "component" ? b.node.children.length : 0;
  const sub = b.node.type ?? "";
  const c = g.content;
  const layout = labelLayout(c, hasIcon(b), sub !== "");
  const inline = layout.glyph === "inline" ? 14 + 6 : 0;
  const lines = wrap(b.node.name ?? b.node.id, c.w - inline, 6.8, layout.lines);
  const height =
    (layout.glyph === "above" ? LABEL.glyph + LABEL.gap : 0) +
    lines.length * LABEL.nameLine +
    (layout.sub ? LABEL.subGap + LABEL.subLine : 0);
  const mid = x + c.x + c.w / 2;
  let top = y + c.y + (c.h - height) / 2;

  let svg =
    `<g transform="translate(${x} ${y})">` +
    g.parts.map((d) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-linejoin="round"/>`).join("") +
    (g.details ? `<path d="${g.details}" fill="none" stroke="${stroke}"/>` : "") +
    (g.dots ? `<path d="${g.dots}" fill="${stroke}"/>` : "") +
    `</g>`;
  if (layout.glyph === "above") {
    svg += iconSvg(b, LABEL.glyph, mid - LABEL.glyph / 2, top, dark);
    top += LABEL.glyph + LABEL.gap;
  }
  const name = (text: string, tx: number, ty: number, anchor: string) =>
    `<text x="${tx}" y="${ty}"${anchor} font-family='${SANS}' font-size="13" font-weight="600" fill="${P.ink}">${esc(text)}</text>`;
  lines.forEach((line, i) => {
    const lineTop = top + i * LABEL.nameLine;
    if (i === 0 && inline > 0) {
      // Glyph and text centered together, the glyph leading.
      const left = mid - (Math.min(line.length * 6.8, c.w - inline) + inline) / 2;
      svg += iconSvg(b, 14, left, lineTop + 1, dark) + name(line, left + inline, lineTop + 12, "");
    } else svg += name(line, mid, lineTop + 12, ` text-anchor="middle"`);
  });
  top += lines.length * LABEL.nameLine;
  if (layout.sub)
    svg += `<text x="${mid}" y="${top + LABEL.subGap + 10}" text-anchor="middle" font-family='${typed ? MONO : SANS}' font-size="10" fill="${P.ink3}">${esc(fit(sub, c.w, 6.2))}</text>`;
  if (inside > 0) svg += nestedBadge(x, y, b.w, b.h, inside, P);
  return `<g>${svg}</g>`;
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
