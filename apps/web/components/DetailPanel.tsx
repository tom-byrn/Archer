"use client";

import { useMemo, useRef, useState } from "react";
import {
  checkPayload,
  effectiveDisplay,
  findComponent,
  layoutMap,
  pathToString,
  removeComponent,
  removeConnection,
  removeConnectionPayload,
  removePayload,
  renameComponent,
  setComponentMeta,
  setConnectionMeta,
  setConnectionPayload,
  setDisplay,
  setPayload,
  type ArchDoc,
  type Arrow,
  type ConnectionNode,
  type PayloadFormat,
  type PayloadNode,
} from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import type { UserLibrary } from "@/lib/userLibrary";
import { authorLabel, type DocumentActivity, type Thread } from "@/lib/activity";
import { githubTreeUrl } from "@/lib/githubApi";
import type { RepoLink } from "@/lib/github";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { CodeEditor } from "./CodeMirror";
import { Glyph } from "./nodes";
import { TypeCombobox } from "./TypeCombobox";
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Input,
  Menu,
  PropertyRow,
  Section,
  Segmented,
  SidePanel,
  TextArea,
  cx,
  relativeTime,
} from "./ui";

export type Selection =
  | { kind: "component"; path: string }
  | { kind: "connection"; key: string }
  | null;

export const connectionKey = (c: ConnectionNode): string =>
  [pathToString(c.source), c.arrow, pathToString(c.target), c.type ?? "", c.label ?? ""].join(
    "|",
  );

const ID_RE = /^[a-z][a-z0-9_]*$/;

const FORMATS: PayloadFormat[] = ["json", "yaml", "table", "markdown"];

const langFor = (f: PayloadFormat): Extension =>
  f === "json" ? json() : f === "yaml" ? yaml() : f === "markdown" ? markdown() : [];

/* ------------------------------------------------------------ Text fields */

function CommitInput({
  defaultValue,
  placeholder,
  mono,
  validate,
  onCommit,
}: {
  defaultValue: string;
  placeholder?: string;
  mono?: boolean;
  validate?: (v: string) => string | null;
  onCommit: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Input
        defaultValue={defaultValue}
        placeholder={placeholder}
        mono={mono}
        invalid={error !== null}
        onChange={(e) => setError(validate ? validate(e.target.value) : null)}
        onBlur={(e) => {
          if (e.target.value === defaultValue) return;
          if (validate && validate(e.target.value)) return;
          onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {error && <p className="pt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- Payloads */

function PayloadCard({
  name,
  format,
  content,
  onChange,
  onDelete,
}: {
  name: string;
  format: PayloadFormat;
  content: string;
  onChange: (format: PayloadFormat, content: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(content);
  const [fmt, setFmt] = useState<PayloadFormat>(format);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;
  const committedRef = useRef({ format, content });
  const problem = useMemo(() => checkPayload(fmt, draft), [fmt, draft]);

  const commit = (f: PayloadFormat, c: string) => {
    const last = committedRef.current;
    if (last.format === f && last.content === c) return;
    if (checkPayload(f, c) !== null) return;
    committedRef.current = { format: f, content: c };
    onChange(f, c);
  };

  const extensions = useMemo<Extension>(
    () => [
      langFor(fmt),
      EditorView.domEventHandlers({
        blur: () => {
          commit(fmtRef.current, draftRef.current);
          return false;
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fmt],
  );

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-line first:mt-0">
      <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface-2 pl-2.5 pr-1">
        <span className="mono min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        <Segmented
          mono
          value={fmt}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          onChange={(f) => {
            setFmt(f);
            commit(f, draft);
          }}
        />
        <Chip tone={problem === null ? "accent" : "danger"}>
          {problem === null ? "valid" : "invalid"}
        </Chip>
        <IconButton label="Delete payload" size="sm" onClick={onDelete}>
          <Icon.Trash />
        </IconButton>
      </div>
      <div style={{ minHeight: 96, maxHeight: 280, overflow: "auto" }}>
        <CodeEditor
          value={draft}
          onChange={setDraft}
          extensions={extensions}
          lineNumbers={false}
          style={{ minHeight: 96 }}
        />
      </div>
      {problem !== null && (
        <p className="border-t border-line bg-danger-soft px-2.5 py-1 text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The payload list + "add" flow, shared by components and connections.
 * `scope` keys the cards so switching selection remounts their editors.
 */
function PayloadsSection({
  scope,
  payloads,
  empty,
  onSet,
  onRemove,
}: {
  scope: string;
  payloads: PayloadNode[];
  empty: string;
  onSet: (name: string, format: PayloadFormat, content: string) => void;
  onRemove: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const nameError = newName === "" ? null : ID_RE.test(newName) ? null : "snake_case required";

  const add = () => {
    const name = newName.trim();
    if (!ID_RE.test(name) || payloads.some((p) => p.name === name)) return;
    onSet(name, "json", "{}");
    setNewName("");
    setAdding(false);
  };

  return (
    <Section
      title="Payloads"
      action={
        <IconButton
          label="Add payload"
          size="sm"
          active={adding}
          onClick={() => setAdding((a) => !a)}
        >
          <Icon.Plus />
        </IconButton>
      }
    >
      {adding && (
        <div className="pb-2">
          <Input
            autoFocus
            mono
            value={newName}
            placeholder="payload_name"
            invalid={nameError !== null}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
          />
          <p className={cx("pt-1 text-xs", nameError ? "text-danger" : "text-ink-3")}>
            {nameError ?? "Enter to create a json payload"}
          </p>
        </div>
      )}
      {payloads.length === 0 && !adding && <p className="text-sm text-ink-3">{empty}</p>}
      {payloads.map((p) => (
        <PayloadCard
          key={`${scope}-${p.name}`}
          name={p.name}
          format={p.format}
          content={p.content}
          onChange={(f, c) => onSet(p.name, f, c)}
          onDelete={() => onRemove(p.name)}
        />
      ))}
    </Section>
  );
}

/* -------------------------------------------------------------- Questions */

const isHttpUrl = (v: string): boolean => /^https?:\/\//i.test(v.trim());

function Avatar({ kind }: { kind: "user" | "agent" }) {
  return (
    <span
      className={cx(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full [&>svg]:h-3 [&>svg]:w-3",
        kind === "agent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2",
      )}
    >
      {kind === "agent" ? <Icon.Bot /> : <Icon.User />}
    </span>
  );
}

function ThreadCard({ thread, activity }: { thread: Thread; activity: DocumentActivity }) {
  const [reply, setReply] = useState("");
  const resolved = thread.status === "resolved";
  const send = () => {
    const text = reply.trim();
    if (text === "") return;
    void activity.reply(thread._id, text);
    setReply("");
  };
  return (
    <div className={cx("mt-2 rounded-md border border-line first:mt-0", resolved && "opacity-60")}>
      <div className="flex flex-col gap-2 px-2.5 pt-2.5">
        {thread.messages.map((m, i) => (
          <div key={i} className="flex gap-2">
            <Avatar kind={m.author.kind} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium">{authorLabel(m.author)}</span>
                <span className="text-xs text-ink-3">{relativeTime(m.at)}</span>
                {i === 0 && resolved && <Chip className="ml-auto">Resolved</Chip>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2.5 pt-2">
        <Input
          value={reply}
          placeholder="Reply…"
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <IconButton label="Send reply" size="sm" onClick={send} disabled={reply.trim() === ""}>
          <Icon.Send />
        </IconButton>
      </div>
      <div className="flex items-center px-1.5 py-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void activity.setThreadStatus(thread._id, resolved ? "open" : "resolved")}
        >
          {resolved ? "Reopen" : "Resolve"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="ml-auto"
          onClick={() => void activity.removeThread(thread._id)}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function QuestionsSection({ path, activity }: { path: string; activity: DocumentActivity }) {
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const threads = useMemo(() => {
    const mine = activity.threads.filter((t) => t.path === path);
    return [
      ...mine.filter((t) => t.status === "open"),
      ...mine.filter((t) => t.status === "resolved"),
    ];
  }, [activity.threads, path]);

  const ask = () => {
    const text = draft.trim();
    if (text === "") return;
    void activity.askQuestion(path, text);
    setDraft("");
    setAsking(false);
  };

  return (
    <Section
      title="Questions"
      action={
        <IconButton
          label="Ask a question"
          size="sm"
          active={asking}
          onClick={() => setAsking((a) => !a)}
        >
          <Icon.Plus />
        </IconButton>
      }
    >
      {asking && (
        <div className="pb-2">
          <TextArea
            autoFocus
            rows={2}
            value={draft}
            placeholder="Ask an agent or leave a note for one…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAsking(false);
                setDraft("");
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
            }}
          />
          <div className="flex items-center gap-1.5 pt-1.5">
            <Button variant="primary" size="sm" onClick={ask} disabled={draft.trim() === ""}>
              Ask
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(false);
                setDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {threads.length === 0 && !asking && (
        <p className="text-sm text-ink-3">No questions on this component.</p>
      )}
      {threads.map((t) => (
        <ThreadCard key={t._id} thread={t} activity={activity} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------- Component */

function ComponentInspector({
  doc,
  path,
  mutate,
  onSelect,
  onClose,
  onDrillIn,
  library,
  activity,
  repo,
}: {
  doc: ArchDoc;
  path: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
  onDrillIn?: (path: string) => void;
  library: UserLibrary;
  activity: DocumentActivity;
  repo: RepoLink | null;
}) {
  const isDark = useIsDark();
  const segments = path.split(".");
  const node = findComponent(doc, segments);
  if (!node) return null;
  const entry = layoutMap(doc).get(path);
  const display = effectiveDisplay(node, entry);
  const isContainer = node.children.length > 0;
  const custom = library.items.find((t) => t.tag === node.type);
  const accent = displayColor(custom?.color ?? lookupType(node.type)?.color, isDark) ?? "#64748b";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm"
          style={{ backgroundColor: `${accent}1a` }}
        >
          <Glyph tag={node.type} color={custom?.color} glyph={custom?.glyph} size={15} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-base font-semibold">{node.name ?? node.id}</div>
          <div className="mono truncate text-xs text-ink-3">{path}</div>
        </div>
        <Menu
          trigger={({ open, toggle }) => (
            <IconButton label="More" active={open} onClick={toggle}>
              <Icon.More />
            </IconButton>
          )}
          items={[
            ...(isContainer && onDrillIn
              ? [
                  {
                    label: "Open",
                    hint: "Show what's inside",
                    icon: <Icon.ChevronRight />,
                    onSelect: () => onDrillIn(path),
                  },
                ]
              : []),
            ...(isContainer
              ? [
                  {
                    label: display === "plane" ? "Collapse to icon" : "Expand to plane",
                    icon: <Icon.Layout />,
                    onSelect: () =>
                      mutate((d) => setDisplay(d, segments, display === "plane" ? "icon" : "plane")),
                  },
                  "separator" as const,
                ]
              : []),
            {
              label: "Delete component",
              icon: <Icon.Trash />,
              danger: true,
              onSelect: () => {
                mutate((d) => removeComponent(d, segments));
                onClose();
              },
            },
          ]}
        />
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Component">
          <PropertyRow label="Name">
            <CommitInput
              defaultValue={node.name ?? ""}
              placeholder={node.id}
              onCommit={(v) =>
                mutate((d) => setComponentMeta(d, segments, { name: v === "" ? null : v }))
              }
            />
          </PropertyRow>
          <PropertyRow label="ID" align="start">
            <CommitInput
              mono
              defaultValue={node.id}
              validate={(v) => (ID_RE.test(v) ? null : "snake_case required")}
              onCommit={(v) => {
                mutate((d) => renameComponent(d, segments, v));
                onSelect({
                  kind: "component",
                  path: [...segments.slice(0, -1), v].join("."),
                });
              }}
            />
          </PropertyRow>
          <PropertyRow label="Type">
            <TypeCombobox
              value={node.type}
              library={library}
              onChange={(tag) =>
                mutate((d) => setComponentMeta(d, segments, { type: tag ?? null }))
              }
            />
          </PropertyRow>
          <PropertyRow label="Description" align="start">
            <TextArea
              key={`${path}-desc`}
              defaultValue={node.desc ?? ""}
              placeholder="What is this component for?"
              rows={3}
              onBlur={(e) => {
                const v = e.target.value;
                if (v === (node.desc ?? "")) return;
                mutate((d) => setComponentMeta(d, segments, { desc: v === "" ? null : v }));
              }}
            />
          </PropertyRow>
          <PropertyRow label="Source">
            <div className="flex items-center gap-1">
              <CommitInput
                key={`${path}-src`}
                mono
                defaultValue={node.src ?? ""}
                placeholder="apps/api/src/billing or https://…"
                onCommit={(v) =>
                  mutate((d) => setComponentMeta(d, segments, { src: v.trim() === "" ? null : v.trim() }))
                }
              />
              {node.src !== undefined && isHttpUrl(node.src) && (
                <IconButton
                  label="Open"
                  size="sm"
                  onClick={() => window.open(node.src, "_blank", "noopener,noreferrer")}
                >
                  <Icon.External />
                </IconButton>
              )}
              {node.src !== undefined && !isHttpUrl(node.src) && repo && (
                <IconButton
                  label="Open on GitHub"
                  size="sm"
                  onClick={() =>
                    window.open(
                      githubTreeUrl(repo.owner, repo.name, repo.branch, node.src ?? ""),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <Icon.External />
                </IconButton>
              )}
              {node.src !== undefined && !isHttpUrl(node.src) && !repo && (
                <IconButton
                  label="Copy path"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(node.src ?? "")}
                >
                  <Icon.Copy />
                </IconButton>
              )}
            </div>
          </PropertyRow>
          <p className="pl-[100px] text-xs text-ink-3">Where this lives in the codebase. Agents start here.</p>
        </Section>

        <PayloadsSection
          scope={path}
          payloads={node.payloads}
          empty="Structured detail — a schema, endpoints, env vars…"
          onSet={(name, f, c) => mutate((d) => setPayload(d, segments, name, f, c))}
          onRemove={(name) => mutate((d) => removePayload(d, segments, name))}
        />

        <QuestionsSection path={path} activity={activity} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Connection */

const normalizeMeta = (meta: {
  arrow?: Arrow;
  type?: string | null;
  label?: string | null;
}) => {
  const out: Record<string, unknown> = {};
  if (meta.arrow !== undefined) out.arrow = meta.arrow;
  if (meta.type !== undefined) out.type = meta.type ?? undefined;
  if (meta.label !== undefined) out.label = meta.label ?? undefined;
  return out;
};

function ConnectionInspector({
  doc,
  connKey,
  mutate,
  onSelect,
  onClose,
}: {
  doc: ArchDoc;
  connKey: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
}) {
  const index = doc.connections.findIndex((c) => connectionKey(c) === connKey);
  const conn = doc.connections[index];
  if (!conn) return null;

  const commit = (meta: Parameters<typeof setConnectionMeta>[2]) => {
    const updated = { ...conn, ...normalizeMeta(meta) };
    mutate((d) => setConnectionMeta(d, index, meta));
    onSelect({ kind: "connection", key: connectionKey(updated as ConnectionNode) });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="mono min-w-0 flex-1 truncate text-sm font-semibold">
          {pathToString(conn.source)}
          <span className="px-1.5 text-ink-3">{conn.arrow === "<->" ? "↔" : conn.arrow === "--" ? "—" : "→"}</span>
          {pathToString(conn.target)}
        </span>
        <Menu
          trigger={({ open, toggle }) => (
            <IconButton label="More" active={open} onClick={toggle}>
              <Icon.More />
            </IconButton>
          )}
          items={[
            {
              label: "Delete connection",
              icon: <Icon.Trash />,
              danger: true,
              onSelect: () => {
                mutate((d) => removeConnection(d, index));
                onClose();
              },
            },
          ]}
        />
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Connection">
          <PropertyRow label="Direction">
            <Segmented
              mono
              value={conn.arrow}
              options={(["->", "<->", "--"] as Arrow[]).map((a) => ({
                value: a,
                label: a,
                title: a === "->" ? "One way" : a === "<->" ? "Both ways" : "Undirected",
              }))}
              onChange={(a) => commit({ arrow: a })}
            />
          </PropertyRow>
          <PropertyRow label="Type">
            <TypeCombobox
              key={connKey}
              mode="connection"
              value={conn.type}
              onChange={(t) => commit({ type: t ?? null })}
            />
          </PropertyRow>
          <PropertyRow label="Label">
            <CommitInput
              defaultValue={conn.label ?? ""}
              placeholder="e.g. checkout sessions"
              onCommit={(v) => commit({ label: v === "" ? null : v })}
            />
          </PropertyRow>
        </Section>

        <PayloadsSection
          scope={connKey}
          payloads={conn.payloads}
          empty="What travels on this edge — a message schema, a request shape, an event list…"
          onSet={(name, f, c) => mutate((d) => setConnectionPayload(d, index, name, f, c))}
          onRemove={(name) => mutate((d) => removeConnectionPayload(d, index, name))}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Panel */

export function DetailPanel({
  doc,
  selection,
  mutate,
  onSelect,
  onDrillIn,
  library,
  activity,
  repo = null,
}: {
  doc: ArchDoc;
  selection: Selection;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  /** Focus the canvas on a container's children (the touch stand-in for double-click). */
  onDrillIn?: (path: string) => void;
  library: UserLibrary;
  activity: DocumentActivity;
  /** Linked repository: turns relative `src` paths into GitHub links. */
  repo?: RepoLink | null;
}) {
  if (selection === null) return null;
  // Desktop: a right-hand column. Phones: a bottom sheet over the canvas.
  return (
    <SidePanel className="md:w-[300px]">
      {selection.kind === "component" ? (
        <ComponentInspector
          key={selection.path}
          doc={doc}
          path={selection.path}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
          onDrillIn={onDrillIn}
          library={library}
          activity={activity}
          repo={repo}
        />
      ) : (
        <ConnectionInspector
          key={selection.key}
          doc={doc}
          connKey={selection.key}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      )}
    </SidePanel>
  );
}
