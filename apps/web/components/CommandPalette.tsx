"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATALOG } from "@archer/catalog";
import { SHAPE_GROUPS, SHAPE_INFO, type Shape } from "@archer/lang";
import type { UserLibrary } from "@/lib/userLibrary";
import { GlyphSwatch } from "./nodes";
import { ShapeIcon } from "./ShapePicker";
import { Icon, Kbd, cx } from "./ui";
import { PALETTE_SHAPES, namespaceLabel, orderedNamespaces } from "./Palette";

/**
 * What the palette was opened for: `all` (⌘K) runs commands, finds
 * components and adds new ones; `add` (the + button) only adds; `find` (⌘F)
 * only jumps to components already in the document.
 */
export type PaletteMode = "all" | "add" | "find";

/** An editor action offered in the palette. */
export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: ReactNode;
  /** Extra words to match on. */
  keywords?: string;
  run: () => void;
}

/** A component (or plane) already in the document, for find / go to. */
export interface PaletteComponent {
  path: string;
  name: string;
  type?: string;
  color?: string;
  glyph?: string;
  /** It's a plane. */
  plane?: boolean;
}

interface Entry {
  /** `undefined` = plain (untyped) component. */
  tag: string | undefined;
  name: string;
  namespace: string;
  color?: string;
  glyph?: string;
  /** An untyped component drawn as this shape, what the shape is for and its group (also searched). */
  shape?: Shape;
  use?: string;
  group?: string;
  /** Not a component: a plane. */
  plane?: true;
}

/** Shapes to put down, first in the add list (the palette's Shapes group). */
const SHAPE_ENTRIES: Entry[] = PALETTE_SHAPES.map((s) => ({
  tag: undefined,
  name: SHAPE_INFO[s].name,
  namespace: "shapes",
  shape: s,
  use: SHAPE_INFO[s].use,
  group: SHAPE_GROUPS.find((g) => g.id === SHAPE_INFO[s].group)?.name,
}));

type Row =
  | { kind: "command"; key: string; command: PaletteCommand }
  | { kind: "goto"; key: string; component: PaletteComponent }
  | { kind: "add"; key: string; entry: Entry };

const PLAIN: Entry = { tag: undefined, name: "Plain component", namespace: "generic" };
const PLANE: Entry = {
  tag: undefined,
  name: "Plane",
  namespace: "generic",
  plane: true,
  use: "a region to put components on",
};

/** Subsequence fuzzy score: lower is better, -1 = no match. */
const fuzzy = (hay: string, q: string): number => {
  if (q === "") return 0;
  if (hay.startsWith(q)) return 0;
  if (hay.includes(q)) return 1;
  let i = 0;
  let gaps = 0;
  for (const ch of hay) {
    if (ch === q[i]) i++;
    else if (i > 0) gaps++;
    if (i === q.length) return 2 + gaps;
  }
  return -1;
};

/** Best score over several fields; later fields rank a little lower. */
const best = (q: string, ...fields: (string | undefined)[]): number => {
  const scores = fields
    .map((f, i) => (f === undefined ? -1 : fuzzy(f.toLowerCase(), q) + (i > 0 ? 0.5 : 0)))
    .filter((s) => s >= 0);
  return scores.length === 0 ? -1 : Math.min(...scores);
};

const PLACEHOLDER: Record<PaletteMode, string> = {
  all: "Run a command, find a component, or add one…",
  add: "Add a component…",
  find: "Find a component in this document…",
};

export function CommandPalette({
  open,
  mode = "all",
  onClose,
  onAdd,
  onAddPlane,
  library,
  commands = [],
  components = [],
  onGoTo,
}: {
  open: boolean;
  mode?: PaletteMode;
  onClose: () => void;
  onAdd: (tag: string | undefined, shape?: Shape) => void;
  /** Add a plane; without it the palette offers none. */
  onAddPlane?: () => void;
  library: UserLibrary;
  commands?: PaletteCommand[];
  components?: PaletteComponent[];
  onGoTo?: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open, mode]);

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    type Group = { key: string; label: string; rank: number; order: number; rows: Row[] };
    const out: Group[] = [];

    if (mode === "all") {
      const scored = commands
        .map((c, order) => ({ c, s: best(q, c.label, c.keywords), order }))
        .filter(({ s }) => s >= 0);
      if (q !== "") scored.sort((a, b) => a.s - b.s || a.order - b.order);
      if (scored.length > 0)
        out.push({
          key: "commands",
          label: "Commands",
          rank: q === "" ? 0 : scored[0]!.s,
          order: 0,
          rows: scored.map(({ c }) => ({ kind: "command", key: `cmd:${c.id}`, command: c })),
        });
    }

    // Components in the document: always in find mode, once there's a query in all mode.
    if (mode === "find" || (mode === "all" && q !== "")) {
      const scored = components
        .map((c, order) => ({ c, s: best(q, c.name, c.path, c.type), order }))
        .filter(({ s }) => s >= 0);
      if (q !== "") scored.sort((a, b) => a.s - b.s || a.order - b.order);
      if (scored.length > 0)
        out.push({
          key: "goto",
          label: mode === "find" ? "In this document" : "Go to",
          rank: q === "" ? 1 : scored[0]!.s,
          order: 1,
          rows: scored.map(({ c }) => ({ kind: "goto", key: `goto:${c.path}`, component: c })),
        });
    }

    if (mode === "all" || mode === "add") {
      const entries: Entry[] = [
        ...SHAPE_ENTRIES,
        PLAIN,
        ...(onAddPlane ? [PLANE] : []),
        ...library.items.map((t) => ({ ...t, namespace: "custom" })),
        ...CATALOG,
      ];
      const scored = entries
        .map((e, order) => ({ e, s: best(q, e.name, e.tag ?? e.use, e.group), order }))
        .filter(({ s }) => s >= 0);
      if (q !== "") scored.sort((a, b) => a.s - b.s || a.order - b.order);
      const byNs = new Map<string, { e: Entry; s: number }[]>();
      for (const x of scored) byNs.set(x.e.namespace, [...(byNs.get(x.e.namespace) ?? []), x]);
      const nsOrder =
        q === ""
          ? ["shapes", ...orderedNamespaces(byNs.keys()).filter((ns) => ns !== "shapes")]
          : [...byNs.keys()];
      nsOrder.forEach((ns, i) => {
        const items = byNs.get(ns);
        if (!items) return;
        out.push({
          key: `add:${ns}`,
          label: mode === "all" ? `Add · ${namespaceLabel(ns)}` : namespaceLabel(ns),
          rank: q === "" ? 2 : items[0]!.s,
          order: 2 + i,
          rows: items.map(({ e }) => ({
            kind: "add",
            key: e.shape ? `add:shape:${e.shape}` : e.plane ? "add:__plane" : `add:${e.tag ?? "__plain"}`,
            entry: e,
          })),
        });
      });
    }

    // With a query, the best match leads whichever kind it is; ties keep the order above.
    return out.sort((a, b) => a.rank - b.rank || a.order - b.order);
  }, [mode, commands, components, library.items, q, onAddPlane]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === "command") row.command.run();
    else if (row.kind === "goto") onGoTo?.(row.component.path);
    else if (row.entry.plane) onAddPlane?.();
    else onAdd(row.entry.tag, row.entry.shape);
  };

  let index = -1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[rgba(10,10,8,0.45)] p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={mode === "add" ? "Add a component" : mode === "find" ? "Find a component" : "Command palette"}
        className="mx-auto mt-[4vh] flex max-h-[calc(100%-4vh)] w-[624px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-md md:mt-[18vh] md:max-h-[calc(100%-18vh)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon.Search className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER[mode]}
            spellCheck={false}
            className="h-12 w-full bg-transparent text-lg text-ink outline-none placeholder:text-ink-3 focus:shadow-none focus-visible:shadow-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (flat.length === 0 ? 0 : (a + 1) % flat.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (flat.length === 0 ? 0 : (a - 1 + flat.length) % flat.length));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(flat[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>

        <div ref={listRef} className="max-h-[50dvh] overflow-y-auto p-1.5 md:max-h-[492px]" role="listbox">
          {flat.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-ink-3">
              {mode === "find" && components.length === 0 ? "Nothing in this document yet" : "No matches"}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.key} className="pb-1">
              <div className="eyebrow px-2.5 pb-1 pt-1.5">{g.label}</div>
              {g.rows.map((row) => {
                index++;
                const i = index;
                const isActive = i === active;
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(row)}
                    className={cx(
                      "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-75",
                      isActive ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <RowBody row={row} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-3 border-t border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-3 md:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> {mode === "add" ? "add" : mode === "find" ? "go to" : "select"}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

/** A tinted square holding a component glyph. */
const Swatch = ({ color, glyph, tag }: { color?: string; glyph?: string; tag?: string }) => (
  <GlyphSwatch
    tag={tag}
    glyph={glyph}
    color={color}
    box={20}
    size={13}
    background={color ? `${color}24` : undefined}
    className={cx("rounded-sm", !color && "bg-surface-2")}
  />
);

function RowBody({ row }: { row: Row }) {
  if (row.kind === "command") {
    const c = row.command;
    return (
      <>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-2 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {c.icon ?? <Icon.Command />}
        </span>
        <span className="min-w-0 flex-1 truncate text-base text-ink">{c.label}</span>
        {c.hint && <span className="hidden shrink-0 truncate text-xs text-ink-3 md:inline">{c.hint}</span>}
        {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
      </>
    );
  }
  if (row.kind === "goto") {
    const c = row.component;
    return (
      <>
        {c.plane && c.type === undefined ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
            <Icon.Plane className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Swatch color={c.color} glyph={c.glyph} tag={c.type} />
        )}
        <span className="min-w-0 flex-1 truncate text-base text-ink">{c.name}</span>
        <span className="mono shrink-0 truncate text-xs text-ink-3">
          {c.plane ? `plane · ${c.path}` : c.path}
        </span>
      </>
    );
  }
  const e = row.entry;
  if (e.plane)
    return (
      <>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
          <Icon.Plane className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-base text-ink">{e.name}</span>
        <span className="hidden min-w-0 shrink truncate text-xs text-ink-3 md:inline">{e.use}</span>
      </>
    );
  if (e.shape)
    return (
      <>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-2">
          <ShapeIcon shape={e.shape} width={20} />
        </span>
        <span className="min-w-0 flex-1 truncate text-base text-ink">{e.name}</span>
        <span className="hidden min-w-0 shrink truncate text-xs text-ink-3 md:inline">{e.use}</span>
      </>
    );
  return (
    <>
      <Swatch color={e.color} glyph={e.glyph} tag={e.tag} />
      <span className="min-w-0 flex-1 truncate text-base text-ink">{e.name}</span>
      {e.tag && <span className="mono shrink-0 text-xs text-ink-3">@{e.tag}</span>}
    </>
  );
}
