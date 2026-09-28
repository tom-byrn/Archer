"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GLYPH_VIEWBOX } from "@archer/catalog";
import { ICON_GROUPS, iconMarkup, isIcon } from "@archer/catalog/icons";
import { ALL_ICONS, iconLabel, iconRank } from "@/lib/icons";
import { Glyph } from "./nodes";
import { Icon, Input, cx } from "./ui";

/** A picker icon at `size` px, in currentColor. */
export function IconArt({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const body = iconMarkup(name);
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={GLYPH_VIEWBOX}
      className={cx("shrink-0", className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** The list's first cell: no icon of its own (the type's, or none). */
const DEFAULT = "";

/**
 * The inspector's icon control: the component's icon, opening onto every
 * icon by group, with a filter that searches their names and tags. The
 * first choice clears `icon`: a typed component then shows its type's icon,
 * an untyped one none. A name Archer doesn't know selects nothing and says
 * it isn't drawn.
 */
export function IconPicker({
  value,
  type,
  onChange,
  autoOpen = false,
  onAutoOpened,
}: {
  /** The component's `icon` as written (undefined: none). */
  value: string | undefined;
  /** Its type, to show the icon it falls back to (undefined: untyped). */
  type?: { tag: string; color?: string; glyph?: string };
  onChange: (icon: string | null) => void;
  /** Open the list as soon as it's shown ("Change icon…" on the canvas). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const current: string | null = value === undefined ? DEFAULT : isIcon(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q === ""
        ? [DEFAULT, ...ALL_ICONS]
        : ALL_ICONS.map((name) => ({ name, r: iconRank(name, q) }))
            .filter(({ r }) => r >= 0)
            .sort((a, b) => a.r - b.r)
            .map(({ name }) => name),
    [q],
  );

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  // Opening starts on the current icon; filtering, on the best match.
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
    if (active !== null) cell(active)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const cell = (name: string) =>
    listRef.current?.querySelector<HTMLElement>(`[data-icon="${name}"]`) ?? null;

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (name: string) => {
    if (name !== current) onChange(name === DEFAULT ? null : name);
    close(true);
  };

  /** In the grid, the icon in the row above or below `from`, nearest it across. */
  const vertical = (from: string, dir: 1 | -1): string | null => {
    const at = cell(from)?.getBoundingClientRect();
    if (!at) return null;
    const rows = matches
      .map((name) => ({ name, r: cell(name)?.getBoundingClientRect() }))
      .filter(
        (c): c is { name: string; r: DOMRect } =>
          !!c.r && (dir === 1 ? c.r.top > at.top + 2 : c.r.top < at.top - 2),
      );
    if (rows.length === 0) return null;
    const rowTop = dir === 1 ? Math.min(...rows.map((c) => c.r.top)) : Math.max(...rows.map((c) => c.r.top));
    const across = (r: DOMRect) => Math.abs(r.left + r.width / 2 - (at.left + at.width / 2));
    return rows
      .filter((c) => Math.abs(c.r.top - rowTop) < 2)
      .reduce((a, b) => (across(b.r) < across(a.r) ? b : a)).name;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = active !== null ? matches.indexOf(active) : -1;
    const go = (name: string | null | undefined) => {
      e.preventDefault();
      if (name !== null && name !== undefined) setActive(name);
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active !== null) choose(active);
    } else if (e.key === "ArrowDown") go(i < 0 ? matches[0] : vertical(active!, 1));
    else if (e.key === "ArrowUp") go(i < 0 ? matches[0] : vertical(active!, -1));
    else if (e.key === "ArrowRight") go(matches[Math.min(matches.length - 1, i + 1)]);
    else if (e.key === "ArrowLeft") go(matches[Math.max(0, i - 1)]);
  };

  const fallbackLabel = type ? "Type's icon" : "None";
  const art = (name: string, size: number, className?: string) =>
    name !== DEFAULT ? (
      <IconArt name={name} size={size} className={className} />
    ) : type ? (
      <Glyph tag={type.tag} color={type.color} glyph={type.glyph} size={size} className="shrink-0" />
    ) : (
      <span style={{ width: size, height: size }} className={cx("flex shrink-0", className)}>
        <Icon.NoIcon className="h-full w-full" />
      </span>
    );
  const cellButton = (name: string) => (
    <button
      key={name || "default"}
      type="button"
      data-icon={name}
      title={name === DEFAULT ? fallbackLabel : iconLabel(name)}
      aria-label={name === DEFAULT ? fallbackLabel : iconLabel(name)}
      aria-pressed={name === current}
      onMouseEnter={() => setActive(name)}
      onFocus={() => setActive(name)}
      onClick={() => choose(name)}
      className={cx(
        "flex h-8 items-center justify-center rounded-sm transition-colors duration-75",
        name === current
          ? "bg-surface-3 text-ink ring-1 ring-line-2"
          : name === active
            ? "bg-surface-2 text-ink"
            : "text-ink-3 hover:text-ink-2",
      )}
    >
      {art(name, 18)}
    </button>
  );
  const grid = "grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-0.5";

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
          className="flex h-7 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-left text-base transition-colors duration-100 hover:border-line-2 focus:border-ink-3 focus:outline-none"
        >
          {current !== null && art(current, 16, "text-ink-2")}
          <span className="min-w-0 flex-1 truncate">
            {current === null ? (
              <span className="text-ink-3">
                Unknown icon <span className="mono">{value}</span>
              </span>
            ) : current === DEFAULT ? (
              <span className={type ? undefined : "text-ink-3"}>{fallbackLabel}</span>
            ) : (
              iconLabel(current)
            )}
          </span>
          <Icon.ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Icons"
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-[max(100%,300px)] overflow-hidden rounded-lg border border-line bg-surface shadow-md"
          >
            <div className="border-b border-line p-1.5">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search icons…"
                aria-label="Search icons"
                className="h-6.5"
              />
            </div>
            <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1">
              {q === "" ? (
                <>
                  <div className={grid}>{cellButton(DEFAULT)}</div>
                  {ICON_GROUPS.map((group) => (
                    <div key={group.id} role="group" aria-label={group.name}>
                      <div className="px-1 pb-0.5 pt-1.5 text-xs text-ink-3">{group.name}</div>
                      <div className={grid}>{group.icons.map(cellButton)}</div>
                    </div>
                  ))}
                </>
              ) : matches.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-ink-3">No icons match.</div>
              ) : (
                <div className={grid}>{matches.map(cellButton)}</div>
              )}
            </div>
            {hint !== null && (
              <div className="truncate border-t border-line px-2 py-1 text-xs text-ink-3">
                {hint === DEFAULT ? (
                  <span className="text-ink-2">{fallbackLabel}</span>
                ) : (
                  <>
                    <span className="text-ink-2">{iconLabel(hint)}</span> ·{" "}
                    <span className="mono">icon {hint}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="truncate pt-1 text-xs text-ink-3">
        {current === null
          ? "Not an icon Archer knows · none drawn"
          : current === DEFAULT
            ? type
              ? "Drawn from its type"
              : "No icon"
            : type
              ? "Replaces its type's icon"
              : "Drawn in the component"}
      </p>
    </div>
  );
}
