"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG, type CatalogType } from "@archer/catalog";
import type { CustomType, UserLibrary } from "@/lib/userLibrary";
import { Glyph } from "./nodes";
import { Button, IconButton, Icon, Input, Kbd, cx } from "./ui";

export const DND_MIME = "application/archer-type";

/** Friendly group names for catalog namespaces. */
export const NAMESPACE_LABELS: Record<string, string> = {
  custom: "My components",
  generic: "Generic",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  databases: "Databases",
  infra: "Infrastructure",
  saas: "SaaS",
  vercel: "Vercel",
};
export const namespaceLabel = (ns: string): string =>
  NAMESPACE_LABELS[ns] ?? ns.charAt(0).toUpperCase() + ns.slice(1);

/** Namespaces in palette order: custom, generic, then the rest alphabetically. */
export const orderedNamespaces = (namespaces: Iterable<string>): string[] => {
  const rest = [...new Set(namespaces)]
    .filter((ns) => ns !== "custom" && ns !== "generic")
    .sort((a, b) => namespaceLabel(a).localeCompare(namespaceLabel(b)));
  return ["custom", "generic", ...rest];
};

/** Search rank: 0 = name prefix, 1 = name/tag/namespace substring, -1 = no match. */
export const matchRank = (t: { name: string; tag: string; namespace: string }, q: string): number => {
  if (q === "") return 1;
  const name = t.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(q) || t.tag.includes(q) || t.namespace.includes(q)) return 1;
  return -1;
};

const OPEN_KEY = "archer.palette.open";
const DEFAULT_OPEN: Record<string, boolean> = { custom: true, generic: true };

function PaletteItem({
  entry,
  onAdd,
  trailing,
}: {
  entry: CatalogType;
  onAdd: (tag: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_MIME, entry.tag);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onAdd(entry.tag)}
        title={`@${entry.tag} — drag onto the canvas or click to add`}
        className="flex h-7 w-full cursor-grab items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-75 hover:bg-surface-2 active:cursor-grabbing"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
          style={{ backgroundColor: `${entry.color}24` }}
        >
          <Glyph glyph={entry.glyph} color={entry.color} size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.name}</span>
      </button>
      {trailing && (
        <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 group-hover:block">
          {trailing}
        </span>
      )}
    </div>
  );
}

function GroupHeader({
  label,
  count,
  open,
  onToggle,
  action,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-[26px] items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left hover:bg-surface-2"
      >
        <Icon.ChevronRight
          className={cx(
            "h-3 w-3 shrink-0 text-ink-3 transition-transform duration-100",
            open && "rotate-90",
          )}
        />
        <span className="eyebrow min-w-0 truncate">{label}</span>
        <span className="ml-auto pl-2 text-xs text-ink-3">{count}</span>
      </button>
      {action && <span className="ml-0.5 shrink-0">{action}</span>}
    </div>
  );
}

const GLYPH_CHOICES = [
  "box", "database", "table", "bucket", "lambda", "server",
  "api", "gateway", "queue", "bolt", "shield", "globe",
  "doc", "card", "cloud", "spark", "cube", "user",
  "phone", "clock", "mail", "chat", "chart", "gear",
  "search", "flame",
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
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [brandNote, setBrandNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const fetchBrand = async () => {
    if (name.trim() === "" || fetching) return;
    setFetching(true);
    setBrandNote(null);
    try {
      const res = await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: name.trim() }),
      });
      const data = (await res.json()) as {
        suggestion?: { title: string; domain?: string; colors: { hex: string }[] } | null;
        error?: string;
      };
      if (!res.ok) {
        setBrandNote(data.error ?? "Lookup failed.");
      } else if (!data.suggestion) {
        setBrandNote("No brand match found.");
      } else {
        const hexes = data.suggestion.colors.map((c) => c.hex).slice(0, 6);
        setBrandColors(hexes);
        if (hexes[0]) setColor(hexes[0]);
        setBrandNote(
          `Matched ${data.suggestion.title}${data.suggestion.domain ? ` · ${data.suggestion.domain}` : ""}`,
        );
      }
    } catch {
      setBrandNote("Lookup failed.");
    } finally {
      setFetching(false);
    }
  };
  const tag = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "");
  const swatches = [...brandColors.filter((c) => !COLOR_CHOICES.includes(c)), ...COLOR_CHOICES];

  return (
    <div className="mb-1 rounded-lg border border-line bg-surface-2 p-2">
      <div className="flex gap-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <Button
          size="sm"
          className="h-7 shrink-0"
          onClick={() => void fetchBrand()}
          disabled={name.trim() === "" || fetching}
          title="Fetch this technology's real brand colors from the web"
        >
          {fetching ? "…" : "Brand"}
        </Button>
      </div>
      <div className="flex min-h-4 items-center gap-2 px-0.5 pt-1 text-xs text-ink-3">
        {tag !== "" && <span className="mono truncate">@custom.{tag}</span>}
        {brandNote && <span className="truncate">{brandNote}</span>}
      </div>
      <div className="grid grid-cols-6 gap-1 pt-1.5">
        {GLYPH_CHOICES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGlyph(g)}
            title={g}
            className={cx(
              "flex h-6 items-center justify-center rounded-sm transition-colors duration-75",
              glyph === g ? "bg-surface-3 ring-1 ring-line-2" : "hover:bg-surface-3",
            )}
          >
            <Glyph glyph={g} color={color} size={14} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-2">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            title={c}
            className={cx(
              "h-4 w-4 rounded-full transition-shadow duration-75",
              color === c && "ring-2 ring-ink ring-offset-1 ring-offset-surface-2",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-1.5 pt-2.5">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={tag === ""}
          onClick={() => onCreate({ tag: `custom.${tag}`, name: name.trim(), color, glyph })}
        >
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
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
  const [openState, setOpenState] = useState<Record<string, boolean>>(DEFAULT_OPEN);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) setOpenState({ ...DEFAULT_OPEN, ...(JSON.parse(raw) as Record<string, boolean>) });
    } catch {}
  }, []);
  const toggle = (ns: string) =>
    setOpenState((s) => {
      const next = { ...s, [ns]: !(s[ns] ?? false) };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const groups = useMemo(() => {
    const custom: CatalogType[] = library.items.map((t) => ({ ...t, namespace: "custom" }));
    const all = [...custom, ...CATALOG];
    const byNs = new Map<string, CatalogType[]>();
    for (const t of all) byNs.set(t.namespace, [...(byNs.get(t.namespace) ?? []), t]);
    return orderedNamespaces(byNs.keys()).map((ns) => {
      const items = byNs.get(ns) ?? [];
      const visible = searching
        ? items
            .map((t) => ({ t, r: matchRank(t, q) }))
            .filter(({ r }) => r >= 0)
            .sort((a, b) => a.r - b.r)
            .map(({ t }) => t)
        : items;
      return { ns, items, visible };
    });
  }, [library.items, q, searching]);

  const anyVisible = groups.some((g) => g.visible.length > 0);
  const plainVisible = !searching || matchRank({ name: "Plain component", tag: "", namespace: "generic" }, q) >= 0;

  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="p-2">
        <div className="relative">
          <Icon.Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a component"
            className="pl-7 pr-11"
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
            <Kbd>⌘K</Kbd>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {plainVisible && (
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_MIME, "");
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(undefined)}
            title="An untyped component — drag onto the canvas or click to add"
            className="mb-1 flex h-7 w-full cursor-grab items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-75 hover:bg-surface-2 active:cursor-grabbing"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-surface-2">
              <Glyph size={13} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">Plain component</span>
          </button>
        )}

        {groups.map(({ ns, items, visible }) => {
          const isCustom = ns === "custom";
          if (searching && visible.length === 0 && !(isCustom && creating)) return null;
          const open = searching || (openState[ns] ?? false);
          return (
            <div key={ns} className="mt-1">
              <GroupHeader
                label={namespaceLabel(ns)}
                count={searching ? visible.length : items.length}
                open={open}
                onToggle={() => toggle(ns)}
                action={
                  isCustom ? (
                    <IconButton
                      label="New component type"
                      size="sm"
                      onClick={() => {
                        setCreating(true);
                        if (!open) toggle(ns);
                      }}
                    >
                      <Icon.Plus />
                    </IconButton>
                  ) : undefined
                }
              />
              {open && (
                <div className="pb-1">
                  {isCustom && creating && (
                    <NewTypeForm
                      onCreate={(t) => {
                        library.add(t);
                        setCreating(false);
                      }}
                      onCancel={() => setCreating(false)}
                    />
                  )}
                  {isCustom && items.length === 0 && !creating && !searching && (
                    <p className="px-1.5 py-1 text-xs text-ink-3">
                      Save your own types with +
                    </p>
                  )}
                  {visible.map((t) => (
                    <PaletteItem
                      key={t.tag}
                      entry={t}
                      onAdd={onAdd}
                      trailing={
                        isCustom ? (
                          <IconButton
                            label="Remove from library"
                            size="sm"
                            onClick={() => library.remove(t.tag)}
                            className="bg-surface-2"
                          >
                            <Icon.Close />
                          </IconButton>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {searching && !anyVisible && !plainVisible && (
          <p className="px-1.5 pt-3 text-sm text-ink-3">No matches</p>
        )}
      </div>
    </aside>
  );
}
