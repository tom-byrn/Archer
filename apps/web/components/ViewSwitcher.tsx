"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  VIEW_KINDS,
  VIEW_LABELS,
  allViews,
  sequenceMessages,
  type ArchDoc,
  type ViewKind,
  type ViewRef,
} from "@archer/lang";
import { ComponentPicker } from "./ViewInspector";
import { Button, Dialog, Icon, Input, Menu, cx, type MenuItem } from "./ui";

/** What the editor's main area shows: the architecture canvas, or one of the document's views. */
export type EditorView = { kind: "architecture" } | { kind: ViewKind; id: string };

export const VIEW_ICONS: Record<ViewKind, (p: { className?: string }) => ReactNode> = {
  sequence: Icon.Sequence,
  flow: Icon.Flow,
  states: Icon.States,
  entities: Icon.Entities,
};

/** "9 steps", "6 nodes", "4 states", "3 entities". */
export function viewSize(v: ViewRef): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (v.kind === "sequence") return n(sequenceMessages(v.node as ArchDoc["sequences"][number]).length, "step");
  if (v.kind === "flow") return n((v.node as ArchDoc["flows"][number]).nodes.length, "node");
  if (v.kind === "states") return n((v.node as ArchDoc["machines"][number]).states.length, "state");
  return (v.node as ArchDoc["models"][number]).entities.length === 1
    ? "1 entity"
    : `${(v.node as ArchDoc["models"][number]).entities.length} entities`;
}

/**
 * The header's view switcher, after the title: the architecture, then every
 * view of the document grouped by kind, and "New view…". Views are places in
 * the document, like opening a component, not tabs: the switcher lists them
 * all however many there are.
 */
export function ViewSwitcher({
  view,
  doc,
  onChange,
  onNew,
}: {
  view: EditorView;
  doc: ArchDoc;
  onChange: (view: EditorView) => void;
  /** Absent when the document can't change. */
  onNew?: () => void;
}) {
  const views = allViews(doc);
  const current = view.kind === "architecture" ? undefined : views.find((v) => v.node.id === view.id);
  const items: (MenuItem | "separator")[] = [
    {
      label: "Architecture",
      icon: view.kind === "architecture" ? <Icon.Check /> : <Icon.Diagram />,
      onSelect: () => onChange({ kind: "architecture" }),
    },
  ];
  for (const kind of VIEW_KINDS) {
    const list = views.filter((v) => v.kind === kind);
    if (list.length === 0) continue;
    items.push("separator");
    const KindIcon = VIEW_ICONS[kind];
    for (const v of list)
      items.push({
        label: v.node.name ?? v.node.id,
        hint: `${VIEW_LABELS[kind].one.replace(/^./, (c) => c.toUpperCase())} · ${viewSize(v)}`,
        icon: current?.node.id === v.node.id ? <Icon.Check /> : <KindIcon />,
        onSelect: () => onChange({ kind, id: v.node.id }),
      });
  }
  if (onNew) items.push("separator", { label: "New view…", hint: "Sequence, flow, state machine or data model", icon: <Icon.Plus />, onSelect: onNew });
  const CurrentIcon = current ? VIEW_ICONS[current.kind] : Icon.Diagram;
  return (
    <Menu
      align="start"
      width={320}
      header={<span className="text-xs text-ink-3">Views of this document</span>}
      items={items}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Switch view: the architecture, or a sequence, flow, state machine or data model"
          className={cx(
            "flex h-7 min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-surface-2",
            open && "bg-surface-2",
            current ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          <CurrentIcon className={cx("h-3.5 w-3.5 shrink-0", current && "text-accent")} />
          <span className="min-w-0 truncate">{current ? (current.node.name ?? current.node.id) : "Architecture"}</span>
          {!current && views.length > 0 && <span className="rounded-sm bg-surface-3 px-1 text-xs text-ink-2">{views.length}</span>}
          <Icon.ChevronDown className="h-3 w-3 shrink-0 text-ink-3" />
        </button>
      )}
    />
  );
}

const KIND_BLURBS: Record<ViewKind, string> = {
  sequence: "Calls between components, in order, for one scenario. Plays back on the architecture.",
  flow: "The steps and decisions of a process, in one lane per component.",
  states: "The states one component moves through, and the events that move it.",
  entities: "The entities a store holds, their fields, and how they refer to each other.",
};

export interface NewViewRequest {
  kind: ViewKind;
  name: string;
  /** A state machine's or data model's component. */
  subject?: string[];
  /** A sequence: start from the selected components' connections. */
  fromSelection: boolean;
}

/** "New view…": pick a kind, name it, and (for some kinds) what it's about. */
export function NewViewDialog({
  open,
  onClose,
  doc,
  selected,
  initialKind = "sequence",
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  doc: ArchDoc;
  /** Components selected on the canvas: they seed a sequence, or name a model's store. */
  selected: string[][];
  initialKind?: ViewKind;
  onCreate: (req: NewViewRequest) => void;
}) {
  const [kind, setKind] = useState<ViewKind>(initialKind);
  const [name, setName] = useState("");
  const [fromSelection, setFromSelection] = useState(true);
  const [subject, setSubject] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setName("");
    setSubject(selected.length === 1 ? selected[0] : undefined);
  }, [open, initialKind, selected]);
  const seed = kind === "sequence" && selected.length >= 2;
  const submit = () =>
    onCreate({
      kind,
      name: name.trim() === "" ? `New ${VIEW_LABELS[kind].one}` : name.trim(),
      ...(subject && (kind === "states" || kind === "entities") ? { subject } : {}),
      fromSelection: seed && fromSelection,
    });
  return (
    <Dialog open={open} onClose={onClose} title="New view" width={620}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-ink-2">A view draws part of this document another way. It only names components that already exist.</p>
        <div role="radiogroup" aria-label="Kind of view" className="grid grid-cols-2 gap-2">
          {VIEW_KINDS.map((k) => {
            const KindIcon = VIEW_ICONS[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cx(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  kind === k ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <KindIcon className="h-4 w-4 text-accent" />
                  {VIEW_LABELS[k].one.replace(/^./, (c) => c.toUpperCase())}
                  <code className="mono ml-auto text-xs font-normal text-ink-3">{k}</code>
                </span>
                <span className="text-sm text-ink-2">{KIND_BLURBS[k]}</span>
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-2">Name</span>
          <Input autoFocus value={name} placeholder={kind === "sequence" ? "e.g. Check out" : kind === "flow" ? "e.g. Publish a link" : kind === "states" ? "e.g. Order status" : "e.g. Orders schema"} onChange={(e) => setName(e.target.value)} />
        </label>
        {(kind === "states" || kind === "entities") && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-2">{kind === "states" ? "The component whose states these are" : "The store it models"}</span>
            <ComponentPicker doc={doc} label="Component" value={subject} onChange={(p) => setSubject(p ?? undefined)} />
          </label>
        )}
        {seed && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fromSelection} onChange={(e) => setFromSelection(e.target.checked)} className="accent-[var(--accent)]" />
            Start from the connections among the {selected.length} selected components
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Create {VIEW_LABELS[kind].one}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
