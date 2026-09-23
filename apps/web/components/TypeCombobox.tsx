"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, CONNECTION_TYPES, lookupType } from "@archer/catalog";
import type { UserLibrary } from "@/lib/userLibrary";
import { Icon, Input, cx } from "./ui";
import { Glyph } from "./nodes";

type Row =
  | { kind: "untyped" }
  | { kind: "type"; tag: string; name: string; color?: string; glyph?: string }
  | { kind: "create"; query: string };

const NAME_RE = /^[A-Za-z][A-Za-z0-9 ._-]*$/;

const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "");

export function TypeCombobox({
  value,
  onChange,
  library,
  mode = "component",
}: {
  value: string | undefined;
  onChange: (tag: string | undefined) => void;
  library?: UserLibrary;
  mode?: "component" | "connection";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (tag: string, name: string) =>
      q === "" || tag.includes(q) || name.toLowerCase().includes(q);
    const out: Row[] = [];
    if (q === "" || "untyped".includes(q)) out.push({ kind: "untyped" });
    if (mode === "connection") {
      for (const t of CONNECTION_TYPES) if (match(t, t)) out.push({ kind: "type", tag: t, name: t });
    } else {
      for (const t of library?.items ?? [])
        if (match(t.tag, t.name))
          out.push({ kind: "type", tag: t.tag, name: t.name, color: t.color, glyph: t.glyph });
      for (const t of CATALOG)
        if (match(t.tag, t.name))
          out.push({ kind: "type", tag: t.tag, name: t.name, color: t.color, glyph: t.glyph });
      const trimmed = query.trim();
      if (
        out.length === 0 &&
        library &&
        trimmed !== "" &&
        NAME_RE.test(trimmed) &&
        slugOf(trimmed) !== ""
      )
        out.push({ kind: "create", query: trimmed });
    }
    return out;
  }, [query, mode, library]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const createCustom = (name: string) => {
    if (!library) return;
    const tag = `custom.${slugOf(name)}`;
    library.add({ tag, name, color: "#64748b", glyph: "box" });
    onChange(tag);
    close();
  };

  const pick = (row: Row) => {
    if (row.kind === "untyped") {
      onChange(undefined);
      close();
    } else if (row.kind === "type") {
      onChange(row.tag);
      close();
    } else {
      createCustom(row.query);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) pick(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // Current value display.
  const custom = library?.items.find((t) => t.tag === value);
  const entry = value ? lookupType(value) : undefined;
  const label = value === undefined ? undefined : (custom?.name ?? entry?.name ?? value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title={value !== undefined ? `@${value}` : undefined}
        className="flex h-7 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-left text-base transition-colors duration-100 hover:border-line-2 focus-visible:-outline-offset-1"
      >
        {value !== undefined && mode === "component" && (
          <Glyph tag={value} color={custom?.color} glyph={custom?.glyph} size={14} />
        )}
        <span className={cx("min-w-0 flex-1 truncate", value === undefined ? "text-ink-3" : mode === "connection" && "mono text-sm")}>
          {label ?? "untyped"}
        </span>
        <Icon.ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-md">
          <div className="border-b border-line p-1.5">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder={mode === "connection" ? "Filter protocols…" : "Filter types…"}
              className="h-6.5"
            />
          </div>
          <div ref={listRef} className="max-h-[280px] overflow-y-auto p-1">
            {rows.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-ink-3">No matches.</div>
            )}
            {rows.map((row, i) => {
              const isActive = i === active;
              const cls = cx(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors duration-75",
                isActive ? "bg-surface-2 text-ink" : "text-ink hover:bg-surface-2",
              );
              if (row.kind === "untyped")
                return (
                  <button key="untyped" type="button" className={cls} onMouseEnter={() => setActive(i)} onClick={() => pick(row)}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-surface-3">
                      <Glyph size={12} />
                    </span>
                    <span className="text-ink-2">Untyped</span>
                    {value === undefined && <Icon.Check className="ml-auto h-3.5 w-3.5 text-accent" />}
                  </button>
                );
              if (row.kind === "create")
                return (
                  <button key="create" type="button" className={cls} onMouseEnter={() => setActive(i)} onClick={() => pick(row)}>
                    <span className="flex h-5 w-5 items-center justify-center text-accent">
                      <Icon.Sparkle className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {`Create "${row.query}" as a custom type`}
                    </span>
                  </button>
                );
              const selected = row.tag === value;
              return (
                <button key={row.tag} type="button" className={cls} onMouseEnter={() => setActive(i)} onClick={() => pick(row)}>
                  {mode === "component" ? (
                    <>
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                        style={{ backgroundColor: `${row.color ?? "#64748b"}1a` }}
                      >
                        <Glyph glyph={row.glyph} color={row.color} size={12} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      <span className="mono shrink-0 text-xs text-ink-3">@{row.tag}</span>
                    </>
                  ) : (
                    <span className="mono min-w-0 flex-1 truncate">{row.tag}</span>
                  )}
                  {selected && <Icon.Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
