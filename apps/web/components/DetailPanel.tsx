"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  checkPayload,
  componentToPlane,
  findComponent,
  findPlane,
  isShape,
  pathToString,
  planeTree,
  removeComponent,
  removeConnection,
  removeConnectionPayload,
  removePayload,
  removePlane,
  renameComponent,
  renamePlane,
  scopeAt,
  setComponentMeta,
  setConnectionMeta,
  setConnectionPayload,
  setPayload,
  setPlaneMeta,
  shapeOf,
  resolveColor,
  SHAPE_INFO,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type ConnectionNode,
  type PayloadFormat,
  type PayloadNode,
  type PlaneNode,
} from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { isIcon } from "@archer/catalog/icons";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import type { UserLibrary } from "@/lib/userLibrary";
import { githubTreeUrl } from "@/lib/githubApi";
import type { RepoLink } from "@/lib/github";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { CodeEditor } from "./CodeMirror";
import { Markdown, MarkdownTable, parseTable } from "./Markdown";
import { Glyph, GlyphSwatch } from "./nodes";
import { ShapeIcon, ShapePicker } from "./ShapePicker";
import { IconPicker } from "./IconPicker";
import { ColorPicker } from "./ColorPicker";
import { TypeCombobox } from "./TypeCombobox";
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Input,
  Kbd,
  Menu,
  PropertyRow,
  Section,
  Segmented,
  SidePanel,
  SwapIcon,
  TextArea,
  cx,
  type MenuItem,
} from "./ui";

/** A list the component form can open straight onto ("Change shape…", "Change icon…", "Change color…"). */
export type Picker = "shape" | "icon" | "color";

export type Selection =
  | { kind: "component"; path: string }
  | { kind: "plane"; path: string }
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

const ARROW_NAMES: Record<Arrow, string> = {
  "->": "One way",
  "<->": "Both ways",
  "--": "Undirected",
};

const isHttpUrl = (v: string): boolean => /^https?:\/\//i.test(v.trim());

/* ------------------------------------------------------------ Text fields */

function CommitInput({
  defaultValue,
  placeholder,
  mono,
  validate,
  onCommit,
  className,
}: {
  defaultValue: string;
  placeholder?: string;
  mono?: boolean;
  validate?: (v: string) => string | null;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
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

/**
 * The form's sources: one input per `src` line, each with a way to open (or
 * copy) it and to remove it, then an empty input that adds one more. Clearing
 * an input removes that source; setComponentMeta drops blanks and repeats.
 */
function SourcesField({
  path,
  sources,
  repo,
  onChange,
}: {
  /** The component's path: another component gets fresh inputs. */
  path: string;
  sources: readonly string[];
  repo: RepoLink | null;
  onChange: (src: string[]) => void;
}) {
  const replace = (i: number, v: string) => onChange(sources.map((s, j) => (j === i ? v : s)));
  const remove = (i: number) => onChange(sources.filter((_, j) => j !== i));
  return (
    <PropertyRow label={sources.length > 1 ? "Sources" : "Source"} align="start">
      <div className="flex flex-col gap-1.5">
        {sources.map((src, i) => {
          const href = sourceHref(src, repo);
          return (
            <div key={`${path}:${i}:${src}`} className="flex items-center gap-1">
              <CommitInput className="min-w-0 flex-1" mono defaultValue={src} onCommit={(v) => replace(i, v)} />
              {href ? (
                <IconButton
                  label={isHttpUrl(src) ? "Open" : "Open on GitHub"}
                  size="sm"
                  onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                >
                  <Icon.External />
                </IconButton>
              ) : (
                <IconButton label="Copy path" size="sm" onClick={() => void navigator.clipboard.writeText(src)}>
                  <Icon.Copy />
                </IconButton>
              )}
              <IconButton label="Remove source" size="sm" onClick={() => remove(i)}>
                <Icon.Close />
              </IconButton>
            </div>
          );
        })}
        <CommitInput
          key={`${path}:new:${sources.length}`}
          mono
          defaultValue=""
          placeholder={sources.length > 0 ? "Add a file, folder or URL" : "apps/api/src/billing or https://…"}
          onCommit={(v) => onChange([...sources, v])}
        />
      </div>
    </PropertyRow>
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

/* --------------------------------------------------------------- Reading */

/** A read-only property, its label lined up with the form's (PropertyRow). */
function ReadRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-x-3 py-1">
      <dt className="min-w-0 truncate text-sm leading-5 text-ink-2">{label}</dt>
      <dd className="min-w-0 text-base text-ink">{children}</dd>
    </div>
  );
}

/**
 * A payload to read. Markdown and tables show rendered; json, yaml and a
 * table that doesn't pass its check show their source.
 */
function PayloadReadout({ payload }: { payload: PayloadNode }) {
  const { format, content } = payload;
  const table = useMemo(
    () =>
      format === "table" && checkPayload(format, content) === null ? parseTable(content) : null,
    [format, content],
  );
  const extensions = useMemo(() => langFor(format), [format]);
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-line first:mt-0">
      <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface-2 pl-2.5 pr-1.5">
        <span className="mono min-w-0 flex-1 truncate text-sm font-semibold">{payload.name}</span>
        <Chip>{format}</Chip>
      </div>
      <div className="bg-[var(--code-bg)]" style={{ maxHeight: 280, overflow: "auto" }}>
        {format === "markdown" ? (
          <Markdown source={content} />
        ) : table ? (
          <MarkdownTable token={table} />
        ) : (
          <CodeEditor value={content} readOnly lineNumbers={false} extensions={extensions} />
        )}
      </div>
    </div>
  );
}

/** Payloads to read; nothing at all when there are none. */
function PayloadReadouts({ payloads }: { payloads: PayloadNode[] }) {
  if (payloads.length === 0) return null;
  return (
    <Section title="Payloads">
      {payloads.map((p) => (
        <PayloadReadout key={p.name} payload={p} />
      ))}
    </Section>
  );
}

/**
 * Where a `src` entry opens: a URL as it is, a repo path (file or folder) in the
 * linked repository on GitHub. Null when there's nowhere to open it.
 */
const sourceHref = (src: string, repo: RepoLink | null): string | null =>
  isHttpUrl(src) ? src : repo ? githubTreeUrl(repo.owner, repo.name, repo.branch, src) : null;

/**
 * A component as it reads: what it is, what it's for, where its code lives
 * and its payloads. The inspector shows this until "Edit"; the read-only
 * viewer (share links, viewers) shows only this.
 */
export function ComponentDetails({
  node,
  library,
  repo,
  onOpen,
}: {
  node: ComponentNode;
  /** Custom types, for their names and glyphs. */
  library?: UserLibrary;
  /** Linked repository: turns relative `src` paths into GitHub links. */
  repo: RepoLink | null;
  /** Open it, to show what's nested in it. */
  onOpen?: () => void;
}) {
  const custom = library?.items.find((t) => t.tag === node.type);
  const typeName = custom?.name ?? lookupType(node.type)?.name;
  const sources = node.src ?? [];
  const inside = node.children.length;
  return (
    <>
      <Section title="Component">
        <dl>
          <ReadRow label="Type">
            {node.type === undefined ? (
              <span className="text-ink-3">Untyped</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5">
                <Glyph tag={node.type} color={custom?.color} glyph={custom?.glyph} size={14} className="shrink-0" />
                {typeName && <span className="truncate">{typeName}</span>}
                <span className="mono truncate text-xs text-ink-3">@{node.type}</span>
              </span>
            )}
          </ReadRow>
          {node.shape !== undefined && (
            <ReadRow label="Shape">
              <span className="flex min-w-0 items-center gap-1.5">
                <ShapeIcon shape={shapeOf(node)} width={18} className="text-ink-2" />
                {isShape(node.shape) ? (
                  <span className="truncate">{SHAPE_INFO[node.shape].name}</span>
                ) : (
                  <span className="truncate text-ink-3">
                    <span className="mono">{node.shape}</span> (unknown, drawn as a box)
                  </span>
                )}
              </span>
            </ReadRow>
          )}
          <ReadRow label="Description">
            {node.desc ? (
              <p className="whitespace-pre-wrap break-words">{node.desc}</p>
            ) : (
              <span className="text-ink-3">No description</span>
            )}
          </ReadRow>
          {sources.length > 0 && (
            <ReadRow label={sources.length > 1 ? "Sources" : "Source"}>
              <ul className="flex flex-col gap-1">
                {sources.map((src, i) => {
                  const href = sourceHref(src, repo);
                  return (
                    <li key={`${i}:${src}`}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="mono break-all text-sm text-accent hover:underline"
                        >
                          {src}
                          <Icon.External className="ml-1 inline h-3 w-3 align-middle" />
                        </a>
                      ) : (
                        <span className="mono break-all text-sm">{src}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ReadRow>
          )}
          {inside > 0 && (
            <ReadRow label="Inside">
              <span className="flex items-center gap-2">
                {inside} component{inside === 1 ? "" : "s"}
                {onOpen && (
                  <button
                    type="button"
                    onClick={onOpen}
                    className="inline-flex items-center gap-0.5 text-sm text-accent hover:underline"
                  >
                    Open
                    <Icon.ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </span>
            </ReadRow>
          )}
        </dl>
      </Section>
      <PayloadReadouts payloads={node.payloads} />
    </>
  );
}

/**
 * A plane as it reads: what it's called and for, and what's on it. The
 * inspector shows this until "Edit"; the read-only viewer shows only this.
 */
export function PlaneDetails({
  doc,
  path,
  plane,
  library,
  onSelect,
}: {
  doc: ArchDoc;
  path: string;
  plane: PlaneNode;
  library?: UserLibrary;
  /** Select something on it (unset: the list isn't clickable). */
  onSelect?: (s: Selection) => void;
}) {
  const custom = library?.items.find((t) => t.tag === plane.type);
  const typeName = custom?.name ?? lookupType(plane.type)?.name;
  const scopePath = path.split(".").slice(0, -1);
  const scope = scopeAt(doc, scopePath);
  const on = scope ? planeTree(scope).itemsOn(planeTree(scope).plane(plane.id)) : [];
  return (
    <Section title="Plane">
      <dl>
        <ReadRow label="Type">
          {plane.type === undefined ? (
            <span className="text-ink-3">Untyped</span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              <Glyph tag={plane.type} color={custom?.color} glyph={custom?.glyph} size={14} className="shrink-0" />
              {typeName && <span className="truncate">{typeName}</span>}
              <span className="mono truncate text-xs text-ink-3">@{plane.type}</span>
            </span>
          )}
        </ReadRow>
        <ReadRow label="Description">
          {plane.desc ? (
            <p className="whitespace-pre-wrap break-words">{plane.desc}</p>
          ) : (
            <span className="text-ink-3">No description</span>
          )}
        </ReadRow>
        <ReadRow label="On it">
          {on.length === 0 ? (
            <span className="text-ink-3">Nothing yet: drag components onto it</span>
          ) : (
            <span className="flex flex-col items-start gap-0.5">
              {on.map((item) => {
                const itemPath = [...scopePath, item.id].join(".");
                const label = (
                  <>
                    {item.kind === "plane" ? (
                      <Icon.Plane className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    ) : (
                      <Glyph tag={item.type} size={14} className="shrink-0" />
                    )}
                    <span className="truncate">{item.name ?? item.id}</span>
                  </>
                );
                return onSelect ? (
                  <button
                    key={itemPath}
                    type="button"
                    onClick={() => onSelect({ kind: item.kind, path: itemPath })}
                    className="flex max-w-full items-center gap-1.5 text-left hover:underline"
                  >
                    {label}
                  </button>
                ) : (
                  <span key={itemPath} className="flex max-w-full items-center gap-1.5">
                    {label}
                  </span>
                );
              })}
            </span>
          )}
        </ReadRow>
      </dl>
    </Section>
  );
}

/** One end of a connection, by name; a click selects that component. */
function Endpoint({
  doc,
  path,
  library,
  onSelect,
}: {
  doc: ArchDoc;
  path: string[];
  library: UserLibrary;
  onSelect: (s: Selection) => void;
}) {
  const key = pathToString(path);
  const node = findComponent(doc, path);
  if (!node) return <span className="mono break-all text-sm">{key}</span>;
  const custom = library.items.find((t) => t.tag === node.type);
  const name = node.name ?? node.id;
  return (
    <button
      type="button"
      title="Show this component"
      onClick={() => onSelect({ kind: "component", path: key })}
      className="flex max-w-full items-center gap-1.5 text-left hover:underline"
    >
      <Glyph
        tag={node.type}
        color={resolveColor(node.color) ?? custom?.color}
        glyph={custom?.glyph}
        icon={node.icon}
        size={14}
        className="shrink-0"
      />
      <span className="truncate">{name}</span>
      {key !== name && <span className="mono truncate text-xs text-ink-3">{key}</span>}
    </button>
  );
}

/** A connection as it reads: its two ends, how it flows, and its payloads. */
function ConnectionDetails({
  doc,
  conn,
  library,
  onSelect,
}: {
  doc: ArchDoc;
  conn: ConnectionNode;
  library: UserLibrary;
  onSelect: (s: Selection) => void;
}) {
  return (
    <>
      <Section title="Connection">
        <dl>
          <ReadRow label="From">
            <Endpoint doc={doc} path={conn.source} library={library} onSelect={onSelect} />
          </ReadRow>
          <ReadRow label="To">
            <Endpoint doc={doc} path={conn.target} library={library} onSelect={onSelect} />
          </ReadRow>
          <ReadRow label="Direction">
            {ARROW_NAMES[conn.arrow]}
            <span className="mono pl-1.5 text-sm text-ink-3">{conn.arrow}</span>
          </ReadRow>
          <ReadRow label="Type">
            {conn.type ? (
              <span className="mono text-sm">{conn.type}</span>
            ) : (
              <span className="text-ink-3">Untyped</span>
            )}
          </ReadRow>
          {conn.label && <ReadRow label="Label">{conn.label}</ReadRow>}
        </dl>
      </Section>
      <PayloadReadouts payloads={conn.payloads} />
    </>
  );
}

/**
 * Switches the inspector between reading and the form. "Edit" and "Done"
 * share one width, so the header holds still.
 */
function EditToggle({
  editing,
  onChange,
}: {
  editing: boolean;
  onChange: (editing: boolean) => void;
}) {
  return (
    <Button
      size="sm"
      icon={<SwapIcon swapped={editing} from={<Icon.Pencil />} to={<Icon.Check />} />}
      title={editing ? "Done editing (esc)" : undefined}
      onClick={() => onChange(!editing)}
    >
      <span className="grid *:col-start-1 *:row-start-1">
        <span className={cx(editing && "invisible")}>Edit</span>
        <span className={cx(!editing && "invisible")}>Done</span>
      </span>
    </Button>
  );
}

/* ------------------------------------------------------------- Component */

function ComponentInspector({
  doc,
  path,
  editing,
  onEditingChange,
  readOnly,
  mutate,
  onSelect,
  onClose,
  onDrillIn,
  library,
  repo,
  openPicker,
  onPickerOpened,
}: {
  doc: ArchDoc;
  path: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  readOnly: boolean;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
  onDrillIn?: (path: string) => void;
  library: UserLibrary;
  repo: RepoLink | null;
  /** Open the form's shape, icon or color list as soon as it shows. */
  openPicker?: Picker;
  onPickerOpened?: () => void;
}) {
  const isDark = useIsDark();
  const segments = path.split(".");
  const node = findComponent(doc, segments);
  if (!node) return null;
  const inside = node.children.length;
  const custom = library.items.find((t) => t.tag === node.type);
  const own = resolveColor(node.color);
  const accent = displayColor(own ?? custom?.color ?? lookupType(node.type)?.color, isDark) ?? "#64748b";
  // Any component opens, to show (or start) what's nested in it; the
  // read-only views have nothing to show in an empty one.
  const openInside = onDrillIn && (inside > 0 || !readOnly) ? () => onDrillIn(path) : undefined;
  const ownConnections = doc.connections.some(
    (c) => pathToString(c.source) === path || pathToString(c.target) === path,
  );
  const planeBlocker = ownConnections
    ? "It has connections of its own"
    : node.payloads.length > 0
      ? "It has payloads"
      : node.src !== undefined
        ? "It has a source link"
        : null;
  const actions: (MenuItem | "separator")[] = [
    ...(openInside
      ? [
          {
            label: "Open",
            hint: inside > 0 ? `${inside} inside` : "Put components inside it",
            icon: <Icon.Open />,
            onSelect: openInside,
          },
        ]
      : []),
    ...(readOnly
      ? []
      : [
          ...(inside > 0
            ? [
                {
                  label: "Convert to plane",
                  hint: planeBlocker ?? "What's inside goes on it",
                  icon: <Icon.Plane />,
                  disabled: planeBlocker !== null,
                  onSelect: () => {
                    mutate((d) => componentToPlane(d, segments).doc);
                    onSelect({ kind: "plane", path });
                  },
                },
              ]
            : []),
          "separator" as const,
          {
            label: "Delete component",
            icon: <Icon.Trash />,
            danger: true,
            onSelect: () => {
              mutate((d) => removeComponent(d, segments));
              onClose();
            },
          },
        ]),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3">
        {(node.type !== undefined || isIcon(node.icon)) && (
          <GlyphSwatch
            tag={node.type}
            color={own ?? custom?.color}
            glyph={custom?.glyph}
            icon={node.icon}
            box={24}
            size={15}
            background={`${accent}1a`}
            className="rounded-sm"
          />
        )}
        <div className="min-w-0 flex-1 leading-tight" title={node.name ?? node.id}>
          <div className="truncate text-base font-semibold">{node.name ?? node.id}</div>
          <div className="mono truncate text-xs text-ink-3">{path}</div>
        </div>
        {!readOnly && <EditToggle editing={editing} onChange={onEditingChange} />}
        {actions.length > 0 && (
          <Menu
            trigger={({ open, toggle }) => (
              <IconButton label="More" active={open} onClick={toggle}>
                <Icon.More />
              </IconButton>
            )}
            items={actions}
          />
        )}
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing ? (
          <ComponentForm
            node={node}
            path={path}
            mutate={mutate}
            onSelect={onSelect}
            library={library}
            repo={repo}
            openPicker={openPicker}
            onPickerOpened={onPickerOpened}
          />
        ) : (
          <ComponentDetails node={node} library={library} repo={repo} onOpen={openInside} />
        )}
      </div>
    </div>
  );
}

/** The component's form: each field commits as you leave it. */
function ComponentForm({
  node,
  path,
  mutate,
  onSelect,
  library,
  repo,
  openPicker,
  onPickerOpened,
}: {
  node: ComponentNode;
  path: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  library: UserLibrary;
  repo: RepoLink | null;
  openPicker?: Picker;
  onPickerOpened?: () => void;
}) {
  const segments = path.split(".");
  const custom = library.items.find((t) => t.tag === node.type);
  return (
    <>
      <Section title="Component" className="pb-5">
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
        <PropertyRow label="Shape" align="start">
          <ShapePicker
            value={node.shape}
            onChange={(shape) => mutate((d) => setComponentMeta(d, segments, { shape }))}
            autoOpen={openPicker === "shape"}
            onAutoOpened={onPickerOpened}
          />
        </PropertyRow>
        <PropertyRow label="Icon" align="start">
          <IconPicker
            value={node.icon}
            type={
              node.type === undefined
                ? undefined
                : { tag: node.type, color: resolveColor(node.color) ?? custom?.color, glyph: custom?.glyph }
            }
            onChange={(icon) => mutate((d) => setComponentMeta(d, segments, { icon }))}
            autoOpen={openPicker === "icon"}
            onAutoOpened={onPickerOpened}
          />
        </PropertyRow>
        <PropertyRow label="Color" align="start">
          <ColorPicker
            value={node.color}
            typeColor={custom?.color ?? lookupType(node.type)?.color}
            onChange={(color) => mutate((d) => setComponentMeta(d, segments, { color }))}
            autoOpen={openPicker === "color"}
            onAutoOpened={onPickerOpened}
          />
        </PropertyRow>
        <PropertyRow label="Description" align="start">
          <TextArea
            key={`${path}-desc`}
            defaultValue={node.desc ?? ""}
            placeholder="What is this component for?"
            rows={6}
            // Grows with the viewport so short screens still reach Payloads.
            style={{ height: "clamp(120px, 22dvh, 280px)" }}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === (node.desc ?? "")) return;
              mutate((d) => setComponentMeta(d, segments, { desc: v === "" ? null : v }));
            }}
          />
        </PropertyRow>
        <SourcesField
          path={path}
          sources={node.src ?? []}
          repo={repo}
          onChange={(src) => mutate((d) => setComponentMeta(d, segments, { src }))}
        />
        <p className="pl-[100px] text-xs text-ink-3">
          Files, folders or URLs where this lives in the codebase. Agents start here.
        </p>
      </Section>

      <PayloadsSection
        scope={path}
        payloads={node.payloads}
        empty="Structured detail — a schema, endpoints, env vars…"
        onSet={(name, f, c) => mutate((d) => setPayload(d, segments, name, f, c))}
        onRemove={(name) => mutate((d) => removePayload(d, segments, name))}
      />
    </>
  );
}

/* ----------------------------------------------------------------- Plane */

function PlaneInspector({
  doc,
  path,
  editing,
  onEditingChange,
  readOnly,
  mutate,
  onSelect,
  onClose,
  library,
}: {
  doc: ArchDoc;
  path: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  readOnly: boolean;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
  library: UserLibrary;
}) {
  const isDark = useIsDark();
  const segments = path.split(".");
  const plane = findPlane(doc, segments);
  if (!plane) return null;
  const custom = library.items.find((t) => t.tag === plane.type);
  const accent = displayColor(custom?.color ?? lookupType(plane.type)?.color, isDark) ?? "#64748b";
  const actions: (MenuItem | "separator")[] = readOnly
    ? []
    : [
        {
          label: "Ungroup",
          hint: "Remove the plane, keep what's on it",
          icon: <Icon.Ungroup />,
          onSelect: () => {
            mutate((d) => removePlane(d, segments, { keepContents: true }));
            onClose();
          },
        },
        "separator",
        {
          label: "Delete plane and contents",
          icon: <Icon.Trash />,
          danger: true,
          onSelect: () => {
            mutate((d) => removePlane(d, segments));
            onClose();
          },
        },
      ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3">
        {plane.type === undefined ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
            <Icon.Plane className="h-3.5 w-3.5" />
          </span>
        ) : (
          <GlyphSwatch
            tag={plane.type}
            color={custom?.color}
            glyph={custom?.glyph}
            box={24}
            size={15}
            background={`${accent}1a`}
            className="rounded-sm"
          />
        )}
        <div className="min-w-0 flex-1 leading-tight" title={plane.name ?? plane.id}>
          <div className="truncate text-base font-semibold">{plane.name ?? plane.id}</div>
          <div className="mono truncate text-xs text-ink-3">plane · {path}</div>
        </div>
        {!readOnly && <EditToggle editing={editing} onChange={onEditingChange} />}
        {actions.length > 0 && (
          <Menu
            trigger={({ open, toggle }) => (
              <IconButton label="More" active={open} onClick={toggle}>
                <Icon.More />
              </IconButton>
            )}
            items={actions}
          />
        )}
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing ? (
          <PlaneForm plane={plane} path={path} mutate={mutate} onSelect={onSelect} library={library} />
        ) : (
          <PlaneDetails doc={doc} path={path} plane={plane} library={library} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}

/** The plane's form: each field commits as you leave it. */
function PlaneForm({
  plane,
  path,
  mutate,
  onSelect,
  library,
}: {
  plane: PlaneNode;
  path: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  library: UserLibrary;
}) {
  const segments = path.split(".");
  return (
    <Section title="Plane" className="pb-5">
      <PropertyRow label="Name">
        <CommitInput
          defaultValue={plane.name ?? ""}
          placeholder={plane.id}
          onCommit={(v) => mutate((d) => setPlaneMeta(d, segments, { name: v === "" ? null : v }))}
        />
      </PropertyRow>
      <PropertyRow label="ID" align="start">
        <CommitInput
          mono
          defaultValue={plane.id}
          validate={(v) => (ID_RE.test(v) ? null : "snake_case required")}
          onCommit={(v) => {
            mutate((d) => renamePlane(d, segments, v));
            onSelect({ kind: "plane", path: [...segments.slice(0, -1), v].join(".") });
          }}
        />
      </PropertyRow>
      <PropertyRow label="Type">
        <TypeCombobox
          value={plane.type}
          library={library}
          onChange={(tag) => mutate((d) => setPlaneMeta(d, segments, { type: tag ?? null }))}
        />
      </PropertyRow>
      <PropertyRow label="Description" align="start">
        <TextArea
          key={`${path}-desc`}
          defaultValue={plane.desc ?? ""}
          placeholder="What does this plane group?"
          rows={4}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (plane.desc ?? "")) return;
            mutate((d) => setPlaneMeta(d, segments, { desc: v === "" ? null : v }));
          }}
        />
      </PropertyRow>
      <p className="pl-[100px] text-xs text-ink-3">
        A plane groups what's on it for readers. It isn't part of paths, and connections never end on it.
      </p>
    </Section>
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
  editing,
  onEditingChange,
  readOnly,
  mutate,
  onSelect,
  onClose,
  library,
}: {
  doc: ArchDoc;
  connKey: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  readOnly: boolean;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
  library: UserLibrary;
}) {
  const index = doc.connections.findIndex((c) => connectionKey(c) === connKey);
  const conn = doc.connections[index];
  if (!conn) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="mono min-w-0 flex-1 truncate text-sm font-semibold">
          {pathToString(conn.source)}
          <span className="px-1.5 text-ink-3">{conn.arrow === "<->" ? "↔" : conn.arrow === "--" ? "—" : "→"}</span>
          {pathToString(conn.target)}
        </span>
        {!readOnly && (
          <>
            <EditToggle editing={editing} onChange={onEditingChange} />
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
          </>
        )}
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing ? (
          <ConnectionForm
            conn={conn}
            index={index}
            connKey={connKey}
            mutate={mutate}
            onSelect={onSelect}
          />
        ) : (
          <ConnectionDetails doc={doc} conn={conn} library={library} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}

function ConnectionForm({
  conn,
  index,
  connKey,
  mutate,
  onSelect,
}: {
  conn: ConnectionNode;
  index: number;
  connKey: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
}) {
  // Direction, type and label are part of the key, so the selection follows the edit.
  const commit = (meta: Parameters<typeof setConnectionMeta>[2]) => {
    const updated = { ...conn, ...normalizeMeta(meta) };
    mutate((d) => setConnectionMeta(d, index, meta));
    onSelect({ kind: "connection", key: connectionKey(updated as ConnectionNode) });
  };

  return (
    <>
      <Section title="Connection">
        <PropertyRow label="Direction">
          <Segmented
            mono
            value={conn.arrow}
            options={(["->", "<->", "--"] as Arrow[]).map((a) => ({
              value: a,
              label: a,
              title: ARROW_NAMES[a],
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
    </>
  );
}

/* ---------------------------------------------------------- Multi-select */

/** Several things selected at once: what they are, and what can be done to all of them. */
export interface MultiSelection {
  /** Selected components and planes. */
  components: { path: string; name: string; type?: string; plane?: boolean }[];
  connections: number;
  actions: (MenuItem | "separator")[];
}

function MultiInspector({
  multi,
  onSelect,
  onClose,
}: {
  multi: MultiSelection;
  onSelect: (s: Selection) => void;
  onClose: () => void;
}) {
  const planes = multi.components.filter((c) => c.plane).length;
  const components = multi.components.length - planes;
  const parts = [
    components > 0 && `${components} component${components === 1 ? "" : "s"}`,
    planes > 0 && `${planes} plane${planes === 1 ? "" : "s"}`,
    multi.connections > 0 && `${multi.connections} connection${multi.connections === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {parts.join(", ")} selected
        </span>
        <IconButton label="Clear selection" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Actions">
          <div className="flex flex-col">
            {multi.actions.map((a, i) =>
              a === "separator" ? (
                <div key={i} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={a.label}
                  type="button"
                  disabled={a.disabled}
                  onClick={a.onSelect}
                  className={cx(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-75 disabled:opacity-40",
                    a.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-2",
                  )}
                >
                  <span className="flex w-4 shrink-0 items-center justify-center text-ink-2 [&>svg]:h-3.5 [&>svg]:w-3.5">
                    {a.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {a.shortcut && <Kbd>{a.shortcut}</Kbd>}
                </button>
              ),
            )}
          </div>
        </Section>
        {multi.components.length > 0 && (
          <Section title={planes > 0 ? "Selected" : "Components"}>
            <div className="flex flex-col">
              {multi.components.map((c) => (
                <button
                  key={c.path}
                  type="button"
                  title="Select only this one"
                  onClick={() => onSelect({ kind: c.plane ? "plane" : "component", path: c.path })}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-75 hover:bg-surface-2"
                >
                  {c.plane && c.type === undefined ? (
                    <Icon.Plane className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                  ) : (
                    <Glyph tag={c.type} size={14} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                  <span className="mono shrink-0 truncate text-xs text-ink-3">{c.path}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
        <p className="px-3 py-2.5 text-xs text-ink-3">
          Shift-drag on the canvas to box-select; shift- or ⌘-click to add and remove.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Panel */

export function DetailPanel({
  doc,
  selection,
  multi = null,
  editing,
  onEditingChange,
  readOnly = false,
  mutate,
  onSelect,
  onDrillIn,
  library,
  repo = null,
  pickerFor = null,
  onPickerOpened,
}: {
  doc: ArchDoc;
  selection: Selection;
  /** Several things selected (selection is then null). */
  multi?: MultiSelection | null;
  /** The selection shows its form. Otherwise it reads, with an Edit button. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Nothing can change (diff mode): no Edit button, no deleting. */
  readOnly?: boolean;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  /** Open a component on the canvas, to show what's nested in it (the touch stand-in for double-click). */
  onDrillIn?: (path: string) => void;
  library: UserLibrary;
  /** Linked repository: turns relative `src` paths into GitHub links. */
  repo?: RepoLink | null;
  /** A component whose form should open straight onto its shape, icon or color list ("Change shape…"). */
  pickerFor?: { path: string; picker: Picker } | null;
  onPickerOpened?: () => void;
}) {
  if (selection === null && multi === null) return null;
  const form = editing && !readOnly;
  // Desktop: a right-hand column. Phones: a bottom sheet over the canvas.
  return (
    <SidePanel resizable defaultWidth={480}>
      {selection === null ? (
        <MultiInspector multi={multi!} onSelect={onSelect} onClose={() => onSelect(null)} />
      ) : selection.kind === "plane" ? (
        <PlaneInspector
          key={selection.path}
          doc={doc}
          path={selection.path}
          editing={form}
          onEditingChange={onEditingChange}
          readOnly={readOnly}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
          library={library}
        />
      ) : selection.kind === "component" ? (
        <ComponentInspector
          key={selection.path}
          doc={doc}
          path={selection.path}
          editing={form}
          onEditingChange={onEditingChange}
          readOnly={readOnly}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
          onDrillIn={onDrillIn}
          library={library}
          repo={repo}
          openPicker={pickerFor?.path === selection.path ? pickerFor.picker : undefined}
          onPickerOpened={onPickerOpened}
        />
      ) : (
        <ConnectionInspector
          key={selection.key}
          doc={doc}
          connKey={selection.key}
          editing={form}
          onEditingChange={onEditingChange}
          readOnly={readOnly}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
          library={library}
        />
      )}
    </SidePanel>
  );
}
