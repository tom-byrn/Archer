"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SHAPES, SHAPE_GROUPS, SHAPE_INFO, isShape, type Shape } from "@archer/lang";
import { shapeGeometry } from "@/lib/shapes";
import { Icon, Input, cx } from "./ui";

/**
 * Thumbnails are drawn at a default component's proportions (4 × 3 cells),
 * small enough that the shapes' minimum detail sizes keep them legible, and scaled.
 */
const THUMB_W = 40;
const THUMB_H = 30;

/** "Cylinder — databases and other stores": a shape's tooltip. */
export const shapeTitle = (shape: Shape): string =>
  `${SHAPE_INFO[shape].name} — ${SHAPE_INFO[shape].use}`;

/** The shapes group by group, in picker order. */
export const SHAPE_SECTIONS = SHAPE_GROUPS.map((group) => ({
  ...group,
  shapes: SHAPES.filter((s) => SHAPE_INFO[s].group === group.id),
}));

const GROUP_NAMES: Record<string, string> = Object.fromEntries(SHAPE_GROUPS.map((g) => [g.id, g.name]));

/**
 * Search rank of a shape (`q` lowercased): 0 = its name starts with `q`,
 * 1 = its name, what it's for or its group mentions `q`, -1 = no match.
 */
export const shapeRank = (shape: Shape, q: string): number => {
  if (q === "") return 1;
  const { name, use, group } = SHAPE_INFO[shape];
  if (name.toLowerCase().startsWith(q)) return 0;
  return [name, use, GROUP_NAMES[group]!].some((s) => s.toLowerCase().includes(q)) ? 1 : -1;
};

/**
 * A shape's outline as a small icon, in currentColor, from the geometry the
 * canvas draws (lib/shapes.ts). Strokes keep their width at any size.
 */
export function ShapeIcon({ shape, width = 20, className }: { shape: Shape; width?: number; className?: string }) {
  const g = useMemo(() => shapeGeometry(shape, THUMB_W, THUMB_H), [shape]);
  const stroke = { stroke: "currentColor", strokeWidth: 1.25, vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      width={width}
      height={(width * THUMB_H) / THUMB_W}
      className={cx("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      {g.parts.map((d, i) => (
        <path key={i} d={d} fill="var(--surface)" strokeLinejoin="round" {...stroke} />
      ))}
      {g.details && <path d={g.details} fill="none" {...stroke} />}
      {g.dots && <path d={g.dots} fill="currentColor" />}
    </svg>
  );
}

/**
 * The inspector's shape control: the current shape, opening onto every
 * shape by group, with a filter that also searches what each is for.
 * Choosing the box clears `shape` (it's the default). A name the language
 * doesn't know selects nothing and says it's drawn as a box.
 */
export function ShapePicker({
  value,
  onChange,
  autoOpen = false,
  onAutoOpened,
}: {
  /** The component's `shape` as written (undefined: none). */
  value: string | undefined;
  onChange: (shape: Shape | null) => void;
  /** Open the list as soon as it's shown ("Change shape…" on the canvas). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const current: Shape | null = value === undefined ? "box" : isShape(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Shape | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q === ""
        ? [...SHAPES]
        : SHAPES.map((s) => ({ s, r: shapeRank(s, q) }))
            .filter(({ r }) => r >= 0)
            .sort((a, b) => a.r - b.r)
            .map(({ s }) => s),
    [q],
  );

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  // Opening starts on the current shape; filtering, on the best match.
  useEffect(() => {
    if (open) setActive(q === "" ? current : (matches[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (active) cell(active)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const cell = (s: Shape) => listRef.current?.querySelector<HTMLElement>(`[data-shape="${s}"]`) ?? null;

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (s: Shape) => {
    if (s !== current) onChange(s === "box" ? null : s);
    close(true);
  };

  /** In the grid, the shape in the row above or below `from`, nearest it across. */
  const vertical = (from: Shape, dir: 1 | -1): Shape | null => {
    const at = cell(from)?.getBoundingClientRect();
    if (!at) return null;
    const rows = matches
      .map((s) => ({ s, r: cell(s)?.getBoundingClientRect() }))
      .filter((c): c is { s: Shape; r: DOMRect } => !!c.r && (dir === 1 ? c.r.top > at.top + 2 : c.r.top < at.top - 2));
    if (rows.length === 0) return null;
    const rowTop = dir === 1 ? Math.min(...rows.map((c) => c.r.top)) : Math.max(...rows.map((c) => c.r.top));
    const across = (r: DOMRect) => Math.abs(r.left + r.width / 2 - (at.left + at.width / 2));
    return rows
      .filter((c) => Math.abs(c.r.top - rowTop) < 2)
      .reduce((a, b) => (across(b.r) < across(a.r) ? b : a)).s;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const grid = q === "";
    const i = active ? matches.indexOf(active) : -1;
    const go = (s: Shape | null | undefined) => {
      e.preventDefault();
      if (s) setActive(s);
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active) choose(active);
    } else if (e.key === "ArrowDown") go(i < 0 ? matches[0] : grid ? vertical(active!, 1) : matches[i + 1]);
    else if (e.key === "ArrowUp") go(i < 0 ? matches[0] : grid ? vertical(active!, -1) : matches[i - 1]);
    else if (grid && e.key === "ArrowRight") go(matches[Math.min(matches.length - 1, i + 1)]);
    else if (grid && e.key === "ArrowLeft") go(matches[Math.max(0, i - 1)]);
  };

  const hint = active ?? current;
  return (
    <div>
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close(false) : setOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={current ? shapeTitle(current) : undefined}
          className="flex h-7 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-left text-base transition-colors duration-100 hover:border-line-2 focus:border-ink-3 focus:outline-none"
        >
          <ShapeIcon shape={current ?? "box"} width={20} className="text-ink-2" />
          <span className="min-w-0 flex-1 truncate">
            {current ? (
              SHAPE_INFO[current].name
            ) : (
              <span className="text-ink-3">
                Unknown shape <span className="mono">{value}</span>
              </span>
            )}
          </span>
          <Icon.ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Shapes"
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-[max(100%,272px)] overflow-hidden rounded-lg border border-line bg-surface shadow-md"
          >
            <div className="border-b border-line p-1.5">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Filter shapes…"
                aria-label="Filter shapes"
                className="h-6.5"
              />
            </div>
            <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1">
              {q === "" ? (
                SHAPE_SECTIONS.map((group) => (
                  <div key={group.id} role="group" aria-label={group.name}>
                    <div className="px-1 pb-0.5 pt-1.5 text-xs text-ink-3">{group.name}</div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-0.5">
                      {group.shapes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          data-shape={s}
                          title={shapeTitle(s)}
                          aria-label={SHAPE_INFO[s].name}
                          aria-pressed={s === current}
                          onMouseEnter={() => setActive(s)}
                          onFocus={() => setActive(s)}
                          onClick={() => choose(s)}
                          className={cx(
                            "flex h-8 items-center justify-center rounded-sm transition-colors duration-75",
                            s === current
                              ? "bg-surface-3 text-ink ring-1 ring-line-2"
                              : s === active
                                ? "bg-surface-2 text-ink"
                                : "text-ink-3 hover:text-ink-2",
                          )}
                        >
                          <ShapeIcon shape={s} width={24} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : matches.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-ink-3">No shapes match.</div>
              ) : (
                matches.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-shape={s}
                    onMouseEnter={() => setActive(s)}
                    onClick={() => choose(s)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors duration-75",
                      s === active ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <ShapeIcon shape={s} width={20} className="text-ink-2" />
                    <span className="shrink-0 text-ink">{SHAPE_INFO[s].name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{SHAPE_INFO[s].use}</span>
                    {s === current && <Icon.Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                ))
              )}
            </div>
            {q === "" && hint && (
              <div className="truncate border-t border-line px-2 py-1 text-xs text-ink-3">
                <span className="text-ink-2">{SHAPE_INFO[hint].name}</span> · {SHAPE_INFO[hint].use}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="truncate pt-1 text-xs text-ink-3">
        {current ? SHAPE_INFO[current].use : "Not a shape Archer knows · drawn as a box"}
      </p>
    </div>
  );
}
