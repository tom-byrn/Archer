"use client";

import { useState } from "react";
import { sequenceMessages, type SequenceNode } from "@archer/lang";
import { Button, Dialog, Icon, Input, Menu, cx } from "./ui";

/** What the editor's main area shows: the architecture canvas, or one sequence. */
export type EditorView = { kind: "architecture" } | { kind: "sequence"; id: string };

/**
 * The header's view switcher, after the title: the architecture and every
 * sequence of the document, and "New sequence…". Sequences are places in the
 * document, like opening a component, not tabs: the switcher lists them all
 * however many there are.
 */
export function ViewSwitcher({
  view,
  sequences,
  onChange,
  onNew,
}: {
  view: EditorView;
  sequences: readonly SequenceNode[];
  onChange: (view: EditorView) => void;
  /** Absent when the document can't change. */
  onNew?: () => void;
}) {
  const current = view.kind === "sequence" ? sequences.find((s) => s.id === view.id) : undefined;
  return (
    <Menu
      align="start"
      width={300}
      header={<span className="text-xs text-ink-3">Views of this document</span>}
      items={[
        {
          label: "Architecture",
          icon: view.kind === "architecture" ? <Icon.Check /> : <Icon.Diagram />,
          onSelect: () => onChange({ kind: "architecture" }),
        },
        ...(sequences.length > 0 ? (["separator"] as const) : []),
        ...sequences.map((s) => ({
          label: s.name ?? s.id,
          hint: `${sequenceMessages(s).length} steps`,
          icon: current?.id === s.id ? <Icon.Check /> : <Icon.Sequence />,
          onSelect: () => onChange({ kind: "sequence", id: s.id }),
        })),
        ...(onNew ? (["separator", { label: "New sequence…", icon: <Icon.Plus />, onSelect: onNew }] as const) : []),
      ]}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Switch view: the architecture or a sequence"
          className={cx(
            "flex h-7 min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-surface-2",
            open && "bg-surface-2",
            current ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {current ? (
            <Icon.Sequence className="h-3.5 w-3.5 shrink-0 text-accent" />
          ) : (
            <Icon.Diagram className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{current ? (current.name ?? current.id) : "Architecture"}</span>
          {!current && sequences.length > 0 && (
            <span className="rounded-sm bg-surface-3 px-1 text-xs text-ink-2">{sequences.length}</span>
          )}
          <Icon.ChevronDown className="h-3 w-3 shrink-0 text-ink-3" />
        </button>
      )}
    />
  );
}

/** "New sequence…": a name, and optionally the selected components' connections as its first steps. */
export function NewSequenceDialog({
  open,
  onClose,
  selectedCount,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  /** Components selected on the canvas; two or more can seed the steps. */
  selectedCount: number;
  onCreate: (name: string, fromSelection: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [fromSelection, setFromSelection] = useState(true);
  const seed = selectedCount >= 2;
  const submit = () => {
    onCreate(name.trim() === "" ? "New sequence" : name.trim(), seed && fromSelection);
    setName("");
  };
  return (
    <Dialog open={open} onClose={onClose} title="New sequence" width={460}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-ink-2">
          One scenario, step by step: who calls whom, in what order. Its steps name this document&apos;s components, so
          it stays in step with the architecture.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-2">Name</span>
          <Input autoFocus value={name} placeholder="e.g. Check out" onChange={(e) => setName(e.target.value)} />
        </label>
        {seed && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fromSelection}
              onChange={(e) => setFromSelection(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Start from the connections among the {selectedCount} selected components
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Create sequence
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
