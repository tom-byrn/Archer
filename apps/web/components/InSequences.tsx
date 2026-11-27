"use client";

import { createContext, useContext } from "react";
import { VIEW_LABELS, sequenceUses, viewsWith, type ArchDoc, type ConnectionNode } from "@archer/lang";
import { VIEW_ICONS, viewSize } from "./ViewSwitcher";
import { Chip, Icon, IconButton, Section } from "./ui";

/** How the inspector reaches the document's sequences; absent outside the editor. */
export interface SequenceNav {
  /** Open a view; for a sequence, on a step (its message number) when given. */
  open: (id: string, step?: number) => void;
  /** Play a sequence on the architecture, from a step when given. */
  play: (id: string, step?: number) => void;
}

export const SequenceNavContext = createContext<SequenceNav | null>(null);

/**
 * "In sequences" for a selected connection: every sequence whose steps
 * travel on it, with those steps as chips that open the sequence there.
 */
export function ConnectionSequences({ doc, conn }: { doc: ArchDoc; conn: ConnectionNode }) {
  const nav = useContext(SequenceNavContext);
  const index = doc.connections.indexOf(conn);
  if (!nav || index < 0) return null;
  const uses = sequenceUses(doc, index);
  if (uses.length === 0) return null;
  return (
    <Section title="In sequences" action={<Chip>{uses.length}</Chip>}>
      <ul className="flex flex-col gap-2 pb-1">
        {uses.map(({ sequence, messages }) => (
          <li key={sequence.id} className="rounded-lg border border-line px-2.5 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => nav.open(sequence.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium hover:text-accent"
              >
                <Icon.Sequence className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate">{sequence.name ?? sequence.id}</span>
              </button>
              <IconButton label={`Play ${sequence.name ?? sequence.id} on the architecture`} onClick={() => nav.play(sequence.id, messages[0]!.number)}>
                <Icon.Play className="text-accent" />
              </IconButton>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {messages.map((m) => (
                <button
                  key={m.number}
                  type="button"
                  onClick={() => nav.open(sequence.id, m.number)}
                  title="Open the sequence on this step"
                  className="flex h-6 max-w-full items-center gap-1 rounded-full bg-accent-soft px-2 text-sm text-ink hover:bg-surface-3"
                >
                  <span className="mono text-xs tabular-nums text-ink-3">{m.number}</span>
                  <span className="truncate">{m.step.label ?? (m.step.arrow === "-->" ? "reply" : "call")}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">Click a step to open its sequence there.</p>
    </Section>
  );
}

/** "In views" for a selected component: the sequences, flows, state machines and data models that name it (or anything in it). */
export function ComponentSequences({ doc, path }: { doc: ArchDoc; path: string }) {
  const nav = useContext(SequenceNavContext);
  if (!nav) return null;
  const views = viewsWith(doc, path.split("."));
  if (views.length === 0) return null;
  return (
    <Section title="In views" action={<Chip>{views.length}</Chip>}>
      <ul className="flex flex-col">
        {views.map((v) => {
          const KindIcon = VIEW_ICONS[v.kind];
          return (
            <li key={v.node.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => nav.open(v.node.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-surface-2"
              >
                <KindIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate">{v.node.name ?? v.node.id}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">
                  {VIEW_LABELS[v.kind].one} · {viewSize(v)}
                </span>
              </button>
              {v.kind === "sequence" && (
                <IconButton label={`Play ${v.node.name ?? v.node.id} on the architecture`} onClick={() => nav.play(v.node.id)}>
                  <Icon.Play className="text-accent" />
                </IconButton>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
