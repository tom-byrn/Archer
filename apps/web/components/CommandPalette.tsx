"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG } from "@archer/catalog";
import type { UserLibrary } from "@/lib/userLibrary";
import { Glyph } from "./nodes";
import { Icon, Kbd, cx } from "./ui";
import { namespaceLabel, orderedNamespaces } from "./Palette";

interface Entry {
  /** `undefined` = plain (untyped) component. */
  tag: string | undefined;
  name: string;
  namespace: string;
  color?: string;
  glyph?: string;
}

const PLAIN: Entry = { tag: undefined, name: "Plain component", namespace: "generic" };

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
const score = (e: Entry, q: string): number => {
  const byName = fuzzy(e.name.toLowerCase(), q);
  const byTag = e.tag ? fuzzy(e.tag, q) : -1;
  const best = [byName, byTag === -1 ? -1 : byTag + 0.5].filter((s) => s >= 0);
  return best.length === 0 ? -1 : Math.min(...best);
};

export function CommandPalette({
  open,
  onClose,
  onAdd,
  library,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (tag: string | undefined) => void;
  library: UserLibrary;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const entries: Entry[] = [
      PLAIN,
      ...library.items.map((t) => ({ ...t, namespace: "custom" })),
      ...CATALOG,
    ];
    const scored = entries
      .map((e, order) => ({ e, s: score(e, q), order }))
      .filter(({ s }) => s >= 0);
    if (q !== "") scored.sort((a, b) => a.s - b.s || a.order - b.order);
    const byNs = new Map<string, Entry[]>();
    for (const { e } of scored) byNs.set(e.namespace, [...(byNs.get(e.namespace) ?? []), e]);
    const nsOrder = q === "" ? orderedNamespaces(byNs.keys()) : [...byNs.keys()];
    return nsOrder
      .filter((ns) => byNs.has(ns))
      .map((ns) => ({ ns, items: byNs.get(ns)! }));
  }, [library.items, q]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    onAdd(e.tag);
    onClose();
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
        aria-label="Add a component"
        className="mx-auto mt-[4vh] w-[520px] max-w-full overflow-hidden rounded-xl border border-line bg-surface shadow-md md:mt-[18vh]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon.Search className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add a component…"
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

        <div ref={listRef} className="max-h-[50dvh] overflow-y-auto p-1.5 md:max-h-[360px]" role="listbox">
          {flat.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-ink-3">No matches</p>
          )}
          {groups.map(({ ns, items }) => (
            <div key={ns} className="pb-1">
              <div className="eyebrow px-2.5 pb-1 pt-1.5">{namespaceLabel(ns)}</div>
              {items.map((e) => {
                index++;
                const i = index;
                const isActive = i === active;
                return (
                  <button
                    key={e.tag ?? "__plain"}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(e)}
                    className={cx(
                      "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-75",
                      isActive ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm",
                        !e.color && "bg-surface-2",
                      )}
                      style={e.color ? { backgroundColor: `${e.color}24` } : undefined}
                    >
                      <Glyph glyph={e.glyph} color={e.color} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base text-ink">{e.name}</span>
                    {e.tag && (
                      <span className="mono shrink-0 text-xs text-ink-3">@{e.tag}</span>
                    )}
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
            <Kbd>↵</Kbd> add
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
