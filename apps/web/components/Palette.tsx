"use client";

import { useMemo, useState } from "react";
import { CATALOG, type CatalogType } from "@archlang/catalog";
import { Glyph } from "./nodes";

export const DND_MIME = "application/archlang-type";

function PaletteItem({
  entry,
  onAdd,
}: {
  entry: CatalogType;
  onAdd: (tag: string) => void;
}) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, entry.tag);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onAdd(entry.tag)}
      title={`@${entry.tag} — drag onto the canvas or click to add`}
      className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 active:cursor-grabbing"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${entry.color}14` }}
      >
        <Glyph tag={entry.tag} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium leading-tight">
          {entry.name}
        </span>
        <span className="mono block truncate text-[10px] leading-tight text-slate-400">
          @{entry.tag}
        </span>
      </span>
    </button>
  );
}

export function Palette({ onAdd }: { onAdd: (tag: string | undefined) => void }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = CATALOG.filter(
      (t) =>
        q === "" ||
        t.tag.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.namespace.includes(q),
    );
    const byNs = new Map<string, CatalogType[]>();
    for (const t of matches) {
      byNs.set(t.namespace, [...(byNs.get(t.namespace) ?? []), t]);
    }
    return [...byNs.entries()];
  }, [query]);

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <button
          onClick={() => onAdd(undefined)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_MIME, "");
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100">
            <Glyph size={17} />
          </span>
          Plain component
        </button>
        {groups.map(([ns, items]) => (
          <div key={ns} className="mt-2">
            <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {ns}
            </div>
            {items.map((t) => (
              <PaletteItem key={t.tag} entry={t} onAdd={onAdd} />
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="px-1 pt-2 text-[12px] text-slate-400">No matches.</p>
        )}
      </div>
    </aside>
  );
}
