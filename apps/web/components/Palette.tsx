"use client";

import { useMemo, useState } from "react";
import { CATALOG, type CatalogType } from "@archlang/catalog";
import type { CustomType, UserLibrary } from "@/lib/userLibrary";
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
        <Glyph glyph={entry.glyph} color={entry.color} size={17} />
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

const GLYPH_CHOICES = [
  "box", "database", "table", "bucket", "lambda", "server", "api", "gateway",
  "queue", "bolt", "shield", "globe", "doc", "card", "cloud", "spark", "cube",
  "user", "phone", "clock", "mail", "chat", "chart", "gear", "search", "flame",
];
const COLOR_CHOICES = [
  "#64748b", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
];

function NewTypeForm({
  onCreate,
  onCancel,
}: {
  onCreate: (t: CustomType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState("box");
  const [color, setColor] = useState(COLOR_CHOICES[6]!);
  const tag = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "");
  return (
    <div className="mt-1 rounded-xl border border-slate-200 p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type name"
        autoFocus
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] outline-none focus:border-slate-400"
      />
      {tag !== "" && (
        <p className="mono px-0.5 pt-1 text-[10px] text-slate-400">@{tag}</p>
      )}
      <div className="flex flex-wrap gap-1 pt-2">
        {GLYPH_CHOICES.map((g) => (
          <button
            key={g}
            onClick={() => setGlyph(g)}
            className={`rounded-md p-1 ${glyph === g ? "bg-slate-200" : "hover:bg-slate-100"}`}
            title={g}
          >
            <Glyph glyph={g} color={color} size={15} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-2">
        {COLOR_CHOICES.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-4.5 w-4.5 rounded-full ${color === c ? "ring-2 ring-slate-500 ring-offset-1" : ""}`}
            style={{ backgroundColor: c, width: 18, height: 18 }}
            title={c}
          />
        ))}
      </div>
      <div className="flex gap-1.5 pt-2.5">
        <button
          disabled={tag === ""}
          onClick={() => onCreate({ tag: `custom.${tag}`, name: name.trim(), color, glyph })}
          style={{ backgroundColor: "var(--accent)" }}
          className="flex-1 rounded-lg py-1.5 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Create
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-2.5 text-[11.5px] text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Palette({
  onAdd,
  library,
}: {
  onAdd: (tag: string | undefined) => void;
  library: UserLibrary;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

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
        <div className="mt-2">
          <div className="flex items-center px-1 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              My components
            </span>
            <button
              onClick={() => setCreating(true)}
              className="ml-auto rounded px-1 text-[13px] leading-none text-slate-400 hover:text-slate-700"
              title="New component type"
            >
              +
            </button>
          </div>
          {creating && (
            <NewTypeForm
              onCreate={(t) => {
                library.add(t);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          )}
          {library.items.length === 0 && !creating && (
            <p className="px-1 text-[11px] text-slate-400">
              Save your own types with +
            </p>
          )}
          {library.items.map((t) => (
            <div key={t.tag} className="group relative">
              <PaletteItem
                entry={{ ...t, namespace: "custom" }}
                onAdd={onAdd}
              />
              <button
                onClick={() => library.remove(t.tag)}
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1 text-[10px] text-slate-400 hover:text-red-600 group-hover:block"
                title="Remove from library"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
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
