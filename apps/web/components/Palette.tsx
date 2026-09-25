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
  ai: "AI & agents",
  network: "Networking",
  compute: "Compute",
  storage: "Storage",
  messaging: "Messaging",
  data: "Data & analytics",
  observability: "Observability",
  security: "Security",
  platform: "Platform",
  topology: "Topology",
  ai_platforms: "AI platforms",
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

/** The vendor-neutral groups — system-design building blocks — in palette order. */
const NEUTRAL_NAMESPACES = [
  "generic",
  "ai",
  "network",
  "compute",
  "storage",
  "messaging",
  "data",
  "observability",
  "security",
  "platform",
  "topology",
];

/**
 * Namespaces in palette order: custom (always), the vendor-neutral groups,
 * then vendors alphabetically.
 */
export const orderedNamespaces = (namespaces: Iterable<string>): string[] => {
  const present = new Set(namespaces);
  const rest = [...present]
    .filter((ns) => ns !== "custom" && !NEUTRAL_NAMESPACES.includes(ns))
    .sort((a, b) => namespaceLabel(a).localeCompare(namespaceLabel(b)));
  return ["custom", ...NEUTRAL_NAMESPACES.filter((ns) => present.has(ns)), ...rest];
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

/** The untyped component. Lives at the top of "My components". */
function PlainItem({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, "");
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onAdd}
      title="An untyped component — drag onto the canvas or click to add"
      className="flex h-7 w-full cursor-grab items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-75 hover:bg-surface-2 active:cursor-grabbing"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-surface-2">
        <Glyph size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink">Plain component</span>
    </button>
  );
}

/** Opens the new-type form. Always last in "My components", so it works without hover. */
function NewTypeItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-ink-3 transition-colors duration-75 hover:bg-surface-2 hover:text-ink-2"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-dashed border-line-2">
        <Icon.Plus className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">New component type</span>
    </button>
  );
}

/**
 * A group's `action` takes the count's place while the row is hovered or has
 * keyboard focus, so every header keeps the same shape and the counts stay
 * in one column.
 */
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
    <div className="group relative h-[26px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-full w-full items-center gap-1 rounded-md px-1 text-left group-hover:bg-surface-2"
      >
        <Icon.ChevronRight
          className={cx(
            "h-3 w-3 shrink-0 text-ink-3 transition-transform duration-100",
            open && "rotate-90",
          )}
        />
        <span className="eyebrow min-w-0 truncate">{label}</span>
        <span
          className={cx(
            "ml-auto pl-2 text-xs text-ink-3",
            !!action &&
              "transition-opacity duration-100 group-hover:opacity-0 group-has-focus-visible:opacity-0",
          )}
        >
          {count}
        </span>
      </button>
      {action && (
        <span className="pointer-events-none absolute inset-y-0 right-px flex items-center opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100 group-has-focus-visible:pointer-events-auto group-has-focus-visible:opacity-100">
          {action}
        </span>
      )}
    </div>
  );
}

const GLYPH_CHOICES = [
  "box", "database", "table", "bucket", "lambda", "server",
  "api", "gateway", "queue", "bolt", "shield", "globe",
  "doc", "card", "cloud", "spark", "cube", "user",
  "phone", "clock", "mail", "chat", "chart", "gear",
  "search", "flame",
  // AI & agents
  "brain", "robot", "plug", "wrench", "puzzle", "memory",
  "prompt", "assistant", "retrieval", "embedding", "vector", "rank",
  "books", "graph", "guardrail", "eval", "pulse", "router",
  "reviewer", "terminal", "cursor", "mic", "speaker", "eye",
  "image", "gpu", "model", "training", "stack", "sparkle",
  "link",
  // System-design building blocks
  "window", "desktop", "chip", "signpost", "earth", "proxy",
  "forward", "gauge", "unplug", "mesh", "lock", "hash",
  "files", "columns", "plot", "folder", "disk", "broadcast",
  "hub", "waves", "bell", "warehouse", "drop", "merge",
  "signal", "scroll", "path", "siren", "bug", "wall",
  "funnel", "key", "vault", "fingerprint", "directory", "handshake",
  "sliders", "flag", "infinity", "flow", "map", "dashed",
  "building", "network", "grid", "circles",
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
    <div className="mt-1 rounded-lg border border-line bg-surface-2 p-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type name"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex min-h-4 items-center gap-2 px-0.5 pt-1 text-xs text-ink-3">
        {tag !== "" && <span className="mono truncate">@custom.{tag}</span>}
      </div>
      {/* Scrolls from halfway down the sixth row, so the form stays short in the
          sidebar and the cut-off row shows there's more. The 1px padding keeps the
          selected glyph's ring inside the scroller. */}
      <div className="-mx-px mt-[5px] max-h-[153px] overflow-y-auto p-px">
        <div className="grid grid-cols-6 gap-1">
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
      </div>
      <div className="flex flex-wrap gap-1.5 pt-2">
        {COLOR_CHOICES.map((c) => (
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
    <aside className="hidden w-[224px] shrink-0 flex-col border-r border-line bg-surface md:flex">
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
        {groups.map(({ ns, items, visible }) => {
          const isCustom = ns === "custom";
          const showPlain = isCustom && plainVisible;
          if (searching && visible.length === 0 && !showPlain && !(isCustom && creating)) return null;
          const open = searching || (openState[ns] ?? false);
          const count = (searching ? visible.length : items.length) + (showPlain ? 1 : 0);
          return (
            <div key={ns} className="mt-1">
              <GroupHeader
                label={namespaceLabel(ns)}
                count={count}
                open={open}
                onToggle={() => toggle(ns)}
                action={
                  isCustom && !creating ? (
                    <IconButton
                      label="New component type"
                      size="sm"
                      onClick={() => {
                        setCreating(true);
                        if (!open) toggle(ns);
                      }}
                      className="hover:bg-surface-3"
                    >
                      <Icon.Plus />
                    </IconButton>
                  ) : undefined
                }
              />
              {open && (
                <div className="pb-1">
                  {showPlain && <PlainItem onAdd={() => onAdd(undefined)} />}
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
                  {isCustom && creating && (
                    <NewTypeForm
                      onCreate={(t) => {
                        library.add(t);
                        setCreating(false);
                      }}
                      onCancel={() => setCreating(false)}
                    />
                  )}
                  {isCustom && !creating && !searching && (
                    <NewTypeItem onClick={() => setCreating(true)} />
                  )}
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
