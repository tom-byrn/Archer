"use client";

import { useMemo } from "react";
import {
  FRAGMENT_KINDS,
  addBranch,
  addConnection,
  componentPaths,
  findComponent,
  messageConnection,
  moveStep,
  parseAddressKey,
  pathToString,
  removeBranch,
  removeSequence,
  removeStep,
  sequenceMessages,
  sequenceParticipants,
  setFragmentMeta,
  setMessageMeta,
  setNoteText,
  setSequenceMeta,
  stepAt,
  unwrapFragment,
  wrapInFragment,
  type ArchDoc,
  type FragmentKind,
  type FragmentStep,
  type MessageArrow,
  type MessageStep,
  type NoteStep,
  type SequenceNode,
} from "@archer/lang";
import { CommitInput, connectionKey } from "./DetailPanel";
import { Glyph } from "./nodes";
import { Button, Icon, IconButton, Menu, PropertyRow, Section, Segmented, SidePanel, TextArea, cx, inputCls } from "./ui";

const KINDS: { value: MessageArrow; label: string; title: string }[] = [
  { value: "->", label: "Call", title: "-> a call: the sender waits for an answer" },
  { value: "-->", label: "Reply", title: "--> the answer to an earlier call" },
  { value: "~>", label: "Async", title: "~> a message nobody waits on" },
];

const FRAGMENT_NAMES: Record<FragmentKind, string> = {
  alt: "One of several branches runs",
  opt: "Runs only if its guard holds",
  loop: "Repeats",
  par: "The branches run at the same time",
};

const ID_RE = /^[a-z][a-z0-9_]*$/;

type Mutate = (fn: (d: ArchDoc) => ArchDoc) => boolean | void;

/**
 * The right-hand panel of a sequence: the selected step's form (a message,
 * a note or a fragment), or with nothing selected the sequence itself.
 */
export function SequenceInspector({
  doc,
  sequence,
  selected,
  onSelect,
  mutate,
  readOnly,
  onShowConnection,
  onPlay,
  onDeleted,
}: {
  doc: ArchDoc;
  sequence: SequenceNode;
  selected: string | null;
  onSelect: (key: string | null) => void;
  mutate: Mutate;
  readOnly: boolean;
  /** Back to the architecture with this connection selected. */
  onShowConnection: (key: string) => void;
  onPlay: (from?: number) => void;
  /** The sequence was deleted. */
  onDeleted: () => void;
}) {
  const address = selected === null ? null : parseAddressKey(selected);
  const step = address ? stepAt(sequence, address) : undefined;
  const number =
    step?.kind === "message" ? sequenceMessages(sequence).find((m) => m.address.join(".") === selected)?.number : undefined;
  const id = sequence.id;

  const move = (delta: -1 | 1) => {
    if (!address) return;
    let to: number[] | undefined;
    mutate((d) => {
      const r = moveStep(d, id, address, delta);
      to = r.address;
      return r.doc;
    });
    if (to) onSelect(to.join("."));
  };
  const remove = () => {
    if (!address) return;
    mutate((d) => removeStep(d, id, address));
    onSelect(null);
  };

  const title =
    step === undefined
      ? sequence.name ?? sequence.id
      : step.kind === "message"
        ? `Step ${number} · ${KINDS.find((k) => k.value === step.arrow)!.label}`
        : step.kind === "note"
          ? "Note"
          : `${step.fragment} fragment`;

  return (
    <SidePanel resizable defaultWidth={360}>
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          {step?.kind === "message" ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink">
              {number}
            </span>
          ) : step?.kind === "note" ? (
            <Icon.Note className="h-4 w-4 text-ink-2" />
          ) : (
            <Icon.Sequence className="h-4 w-4 text-accent" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          {!readOnly && step && (
            <>
              <IconButton label="Move up" onClick={() => move(-1)}>
                <Icon.ArrowUp />
              </IconButton>
              <IconButton label="Move down" onClick={() => move(1)}>
                <Icon.ArrowDown />
              </IconButton>
              <Menu
                trigger={({ open, toggle }) => (
                  <IconButton label="More" active={open} onClick={toggle}>
                    <Icon.More />
                  </IconButton>
                )}
                items={[
                  ...FRAGMENT_KINDS.map((k) => ({
                    label: `Wrap in ${k}`,
                    hint: FRAGMENT_NAMES[k],
                    icon: <Icon.Group />,
                    onSelect: () => {
                      if (!address) return;
                      mutate((d) =>
                        wrapInFragment(d, id, { list: address.slice(0, -1), index: address[address.length - 1]! }, 1, k).doc,
                      );
                      onSelect(address.join("."));
                    },
                  })),
                  ...(step.kind === "fragment"
                    ? [
                        {
                          label: "Unwrap",
                          hint: "Keep its steps, drop the fragment",
                          icon: <Icon.Ungroup />,
                          onSelect: () => {
                            mutate((d) => unwrapFragment(d, id, address!));
                            onSelect(null);
                          },
                        },
                      ]
                    : []),
                  "separator" as const,
                  {
                    label: step.kind === "fragment" ? "Delete fragment and its steps" : "Delete step",
                    icon: <Icon.Trash />,
                    danger: true,
                    onSelect: remove,
                  },
                ]}
              />
            </>
          )}
          {step && (
            <IconButton label="Close" onClick={() => onSelect(null)}>
              <Icon.Close />
            </IconButton>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === undefined ? (
            <SequenceDetails
              doc={doc}
              sequence={sequence}
              mutate={mutate}
              readOnly={readOnly}
              onSelect={onSelect}
              onPlay={onPlay}
              onDeleted={onDeleted}
            />
          ) : step.kind === "message" ? (
            <MessageForm
              key={selected}
              doc={doc}
              step={step}
              number={number!}
              update={(meta) => mutate((d) => setMessageMeta(d, id, address!, meta))}
              mutate={mutate}
              readOnly={readOnly}
              onShowConnection={onShowConnection}
              onPlay={() => onPlay(number)}
            />
          ) : step.kind === "note" ? (
            <NoteForm key={selected} doc={doc} step={step} readOnly={readOnly} onCommit={(text) => mutate((d) => setNoteText(d, id, address!, text))} />
          ) : (
            <FragmentForm
              key={selected}
              step={step}
              readOnly={readOnly}
              mutate={mutate}
              sequenceId={id}
              address={address!}
            />
          )}
        </div>
      </div>
    </SidePanel>
  );
}

/** Every component in the document, by path, for the From and To lists. */
function useComponentOptions(doc: ArchDoc) {
  return useMemo(
    () =>
      [...componentPaths(doc)].map((key) => ({
        key,
        name: findComponent(doc, key.split("."))?.name ?? key,
      })),
    [doc],
  );
}

function ComponentSelect({
  doc,
  value,
  onChange,
  disabled,
  label,
}: {
  doc: ArchDoc;
  value: string[];
  onChange: (path: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const options = useComponentOptions(doc);
  const c = findComponent(doc, value);
  return (
    <div className="flex items-center gap-2">
      {c && <Glyph tag={c.type} color={c.color} icon={c.icon} size={16} className="shrink-0" />}
      <select
        aria-label={label}
        disabled={disabled}
        value={pathToString(value)}
        onChange={(e) => onChange(e.target.value.split("."))}
        className={cx(inputCls, "h-7 min-w-0 flex-1")}
      >
        {!c && <option value={pathToString(value)}>{pathToString(value)} (missing)</option>}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name === o.key ? o.key : `${o.name} · ${o.key}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function MessageForm({
  doc,
  step,
  number,
  update,
  mutate,
  readOnly,
  onShowConnection,
  onPlay,
}: {
  doc: ArchDoc;
  step: MessageStep;
  number: number;
  update: (meta: Parameters<typeof setMessageMeta>[3]) => void;
  mutate: Mutate;
  readOnly: boolean;
  onShowConnection: (key: string) => void;
  onPlay: () => void;
}) {
  const index = messageConnection(doc.connections, step);
  const conn = index >= 0 ? doc.connections[index] : undefined;
  const self = pathToString(step.from) === pathToString(step.to);
  return (
    <>
      <Section title="Message">
        <PropertyRow label="From">
          <ComponentSelect doc={doc} label="From" value={step.from} disabled={readOnly} onChange={(from) => update({ from })} />
        </PropertyRow>
        <PropertyRow label="To">
          <ComponentSelect doc={doc} label="To" value={step.to} disabled={readOnly} onChange={(to) => update({ to })} />
        </PropertyRow>
        <PropertyRow label="Kind">
          <Segmented
            label="Kind"
            value={step.arrow}
            options={KINDS}
            onChange={(arrow) => !readOnly && update({ arrow })}
          />
        </PropertyRow>
        <PropertyRow label="Label">
          {readOnly ? (
            <span className="text-sm">{step.label ?? "—"}</span>
          ) : (
            <CommitInput
              defaultValue={step.label ?? ""}
              placeholder="What's sent, e.g. POST /links"
              onCommit={(v) => update({ label: v === "" ? null : v })}
            />
          )}
        </PropertyRow>
        <PropertyRow label="Type">
          {readOnly ? (
            <span className="mono text-sm">{step.type ?? "—"}</span>
          ) : (
            <CommitInput
              mono
              defaultValue={step.type ?? ""}
              placeholder="http"
              validate={(v) => (v === "" || /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(v) ? null : "A type tag, like http or aws.sqs")}
              onCommit={(v) => update({ type: v === "" ? null : v })}
            />
          )}
        </PropertyRow>
      </Section>
      <Section title="Connection">
        {conn ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
            <code className="mono truncate text-sm">
              {pathToString(conn.source)} {conn.arrow} {pathToString(conn.target)}
              {conn.type ? <span className="text-ink-3"> @{conn.type}</span> : null}
              {conn.label ? <span className="text-ink-2"> : “{conn.label}”</span> : null}
            </code>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-accent">
                <Icon.CheckCircle className="h-3.5 w-3.5" />
                {step.arrow === "-->" ? "Answers along this connection" : "Travels on this connection"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onShowConnection(connectionKey(conn))}>
                Show on architecture
              </Button>
            </div>
          </div>
        ) : self ? (
          <p className="text-sm text-ink-2">A component calling itself needs no connection.</p>
        ) : step.arrow === "-->" ? (
          <p className="text-sm text-ink-2">No connection runs from {pathToString(step.to)} to {pathToString(step.from)}; a reply goes back along the call's.</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-warn bg-warn-soft px-3 py-2">
            <p className="text-sm text-ink">
              <span className="font-semibold text-warn">No connection</span> joins {pathToString(step.from)} to{" "}
              {pathToString(step.to)}, so the architecture doesn&apos;t show this call.
            </p>
            {!readOnly && (
              <div>
                <Button
                  size="sm"
                  icon={<Icon.Plus />}
                  onClick={() =>
                    mutate((d) =>
                      addConnection(d, step.from, step.to, step.type !== undefined ? { type: step.type } : {}),
                    )
                  }
                >
                  Add connection
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>
      <Section title="Playback">
        <Button size="sm" variant="secondary" icon={<Icon.Play />} onClick={onPlay}>
          Play from step {number}
        </Button>
      </Section>
    </>
  );
}

function NoteForm({
  doc,
  step,
  readOnly,
  onCommit,
}: {
  doc: ArchDoc;
  step: NoteStep;
  readOnly: boolean;
  onCommit: (text: string) => void;
}) {
  return (
    <Section title="Note">
      <PropertyRow label="Over">
        <span className="text-sm">
          {step.over.map((p) => findComponent(doc, p)?.name ?? pathToString(p)).join(", ")}
        </span>
      </PropertyRow>
      <PropertyRow label="Text" align="start">
        <TextArea
          rows={4}
          defaultValue={step.text}
          readOnly={readOnly}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== step.text && v.trim() !== "") onCommit(v);
          }}
        />
      </PropertyRow>
    </Section>
  );
}

function FragmentForm({
  step,
  readOnly,
  mutate,
  sequenceId,
  address,
}: {
  step: FragmentStep;
  readOnly: boolean;
  mutate: Mutate;
  sequenceId: string;
  address: number[];
}) {
  const multi = step.fragment === "alt" || step.fragment === "par";
  return (
    <Section title="Fragment">
      <PropertyRow label="Kind">
        <Segmented
          mono
          label="Kind"
          value={step.fragment}
          options={FRAGMENT_KINDS.map((k) => ({ value: k, label: k, title: FRAGMENT_NAMES[k] }))}
          onChange={(fragment) => !readOnly && mutate((d) => setFragmentMeta(d, sequenceId, address, { fragment }))}
        />
      </PropertyRow>
      <p className="pb-1 pl-[100px] text-xs text-ink-3">{FRAGMENT_NAMES[step.fragment]}.</p>
      {step.branches.map((b, i) => (
        <PropertyRow key={i} label={i === 0 ? "Guard" : `else ${i}`}>
          <div className="flex items-center gap-1">
            <CommitInput
              className="min-w-0 flex-1"
              defaultValue={b.guard ?? ""}
              placeholder={i === 0 ? "e.g. slug is free" : "e.g. taken"}
              onCommit={(v) =>
                mutate((d) => setFragmentMeta(d, sequenceId, address, { branch: i, guard: v === "" ? null : v }))
              }
            />
            {i > 0 && !readOnly && (
              <IconButton label="Remove branch" onClick={() => mutate((d) => removeBranch(d, sequenceId, address, i))}>
                <Icon.Close />
              </IconButton>
            )}
          </div>
        </PropertyRow>
      ))}
      {multi && !readOnly && (
        <div className="pl-[100px] pt-1">
          <Button size="sm" variant="ghost" icon={<Icon.Plus />} onClick={() => mutate((d) => addBranch(d, sequenceId, address))}>
            Add else branch
          </Button>
        </div>
      )}
    </Section>
  );
}

function SequenceDetails({
  doc,
  sequence,
  mutate,
  readOnly,
  onSelect,
  onPlay,
  onDeleted,
}: {
  doc: ArchDoc;
  sequence: SequenceNode;
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
  onPlay: () => void;
  onDeleted: () => void;
}) {
  const messages = sequenceMessages(sequence);
  const participants = sequenceParticipants(sequence);
  return (
    <>
      <Section title="Sequence">
        <PropertyRow label="Name">
          {readOnly ? (
            <span className="text-sm">{sequence.name ?? sequence.id}</span>
          ) : (
            <CommitInput
              key={`name-${sequence.id}`}
              defaultValue={sequence.name ?? ""}
              placeholder={sequence.id}
              onCommit={(v) => mutate((d) => setSequenceMeta(d, sequence.id, { name: v === "" ? null : v }))}
            />
          )}
        </PropertyRow>
        <PropertyRow label="ID">
          {readOnly ? (
            <span className="mono text-sm">{sequence.id}</span>
          ) : (
            <CommitInput
              key={`id-${sequence.id}`}
              mono
              defaultValue={sequence.id}
              validate={(v) =>
                !ID_RE.test(v)
                  ? "snake_case required"
                  : v !== sequence.id && doc.sequences.some((q) => q.id === v)
                    ? "Another sequence has this id"
                    : null
              }
              onCommit={(v) => mutate((d) => setSequenceMeta(d, sequence.id, { id: v }))}
            />
          )}
        </PropertyRow>
        <div className="flex gap-2 pl-[100px] pt-2">
          <Button size="sm" icon={<Icon.Play />} disabled={messages.length === 0} onClick={() => onPlay()}>
            Play on architecture
          </Button>
        </div>
      </Section>
      <Section title={`Steps · ${messages.length}`}>
        {messages.length === 0 ? (
          <p className="text-sm text-ink-3">No steps yet. Add a call from the toolbar under the diagram.</p>
        ) : (
          <ol className="flex flex-col">
            {messages.map((m) => (
              <li key={m.address.join(".")}>
                <button
                  type="button"
                  onClick={() => onSelect(m.address.join("."))}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                  style={{ paddingLeft: 6 + m.depth * 14 }}
                >
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-1 text-xs font-semibold">
                    {m.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(doc, m.step.from)} {m.step.arrow === "-->" ? "⇢" : m.step.arrow === "~>" ? "↝" : "→"}{" "}
                    {nameOf(doc, m.step.to)}
                    {m.step.label && <span className="text-ink-3"> · {m.step.label}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title={`Participants · ${participants.length}`}>
        <ul className="flex flex-col gap-1">
          {participants.map((p) => {
            const c = findComponent(doc, p);
            return (
              <li key={pathToString(p)} className="flex items-center gap-2 text-sm">
                {c ? <Glyph tag={c.type} color={c.color} icon={c.icon} size={16} /> : <Icon.Warning className="h-4 w-4 text-danger" />}
                <span className="min-w-0 flex-1 truncate">{c?.name ?? pathToString(p)}</span>
                <span className="mono text-xs text-ink-3">{pathToString(p)}</span>
              </li>
            );
          })}
        </ul>
        <p className="pt-2 text-xs text-ink-3">The lifelines are the components the steps name, in order of first appearance.</p>
      </Section>
      {!readOnly && (
        <Section title="Danger zone">
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon.Trash />}
            onClick={() => {
              mutate((d) => removeSequence(d, sequence.id));
              onDeleted();
            }}
          >
            Delete sequence
          </Button>
        </Section>
      )}
    </>
  );
}

export const nameOf = (doc: ArchDoc, path: string[]): string => findComponent(doc, path)?.name ?? pathToString(path);
