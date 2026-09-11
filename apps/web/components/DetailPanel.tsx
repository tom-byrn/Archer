"use client";

import { useMemo, useState } from "react";
import {
  checkPayload,
  findComponent,
  pathToString,
  removeComponent,
  removeConnection,
  removePayload,
  renameComponent,
  setComponentMeta,
  setConnectionMeta,
  setDisplay,
  setPayload,
  effectiveDisplay,
  layoutMap,
  type ArchDoc,
  type Arrow,
  type ConnectionNode,
  type PayloadFormat,
} from "@archlang/lang";
import { CATALOG, CONNECTION_TYPES } from "@archlang/catalog";
import { Glyph } from "./nodes";

export type Selection =
  | { kind: "component"; path: string }
  | { kind: "connection"; key: string }
  | null;

export const connectionKey = (c: ConnectionNode): string =>
  [pathToString(c.source), c.arrow, pathToString(c.target), c.type ?? "", c.label ?? ""].join(
    "|",
  );

const ID_RE = /^[a-z][a-z0-9_]*$/;
const TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400";
const labelCls =
  "block pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400";

function TextField({
  label,
  defaultValue,
  placeholder,
  mono,
  validate,
  onCommit,
}: {
  label: string;
  defaultValue: string;
  placeholder?: string;
  mono?: boolean;
  validate?: (v: string) => string | null;
  onCommit: (v: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        defaultValue={defaultValue}
        placeholder={placeholder}
        spellCheck={false}
        className={`${inputCls} ${mono ? "mono" : ""} ${error ? "!border-red-400" : ""}`}
        onChange={(e) => setError(validate ? validate(e.target.value) : null)}
        onBlur={(e) => {
          if (e.target.value === defaultValue) return;
          const problem = validate ? validate(e.target.value) : null;
          if (problem) return;
          onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {error && <p className="pt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function PayloadEditor({
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
  const problem = useMemo(() => checkPayload(fmt, draft), [fmt, draft]);
  return (
    <div className="mt-2 rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5">
        <span className="mono text-[11px] font-bold text-slate-600">{name}</span>
        <select
          value={fmt}
          onChange={(e) => {
            const f = e.target.value as PayloadFormat;
            setFmt(f);
            if (checkPayload(f, draft) === null) onChange(f, draft);
          }}
          className="rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-600"
        >
          {(["json", "yaml", "table", "markdown"] as const).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <span
          className={`rounded-full px-1.5 text-[10px] font-semibold ${
            problem === null
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {problem === null ? "valid" : "invalid"}
        </span>
        <button
          onClick={onDelete}
          className="ml-auto text-[11px] text-slate-400 hover:text-red-600"
          title="Delete payload"
        >
          delete
        </button>
      </div>
      <textarea
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== content) onChange(fmt, draft);
        }}
        rows={Math.min(12, Math.max(4, draft.split("\n").length + 1))}
        className="mono w-full resize-y rounded-b-xl p-2 text-[11.5px] leading-relaxed outline-none"
      />
      {problem !== null && (
        <p className="border-t border-red-100 bg-red-50 px-2.5 py-1 text-[11px] text-red-700">
          {problem}
        </p>
      )}
    </div>
  );
}

function ComponentDetail({
  doc,
  path,
  mutate,
  onSelect,
  onClose,
}: {
  doc: ArchDoc;
  path: string;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
  onClose: () => void;
}) {
  const segments = path.split(".");
  const node = findComponent(doc, segments);
  const [newPayload, setNewPayload] = useState("");
  if (!node) return null;
  const entry = layoutMap(doc).get(path);
  const display = effectiveDisplay(node, entry);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <Glyph tag={node.type} size={18} />
        <span className="truncate text-[13px] font-semibold">
          {node.name ?? node.id}
        </span>
        <span className="mono truncate text-[10.5px] text-slate-400">{path}</span>
        <button
          onClick={onClose}
          className="ml-auto text-slate-400 hover:text-slate-700"
          aria-label="Close details"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <TextField
          label="Display name"
          defaultValue={node.name ?? ""}
          placeholder={node.id}
          onCommit={(v) =>
            mutate((d) => setComponentMeta(d, segments, { name: v === "" ? null : v }))
          }
        />
        <TextField
          label="Id"
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
        <div>
          <label className={labelCls}>Type</label>
          <input
            list="archlang-types"
            defaultValue={node.type ?? ""}
            placeholder="untyped"
            spellCheck={false}
            className={`${inputCls} mono`}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (node.type ?? "")) return;
              if (v !== "" && !TYPE_RE.test(v)) return;
              mutate((d) => setComponentMeta(d, segments, { type: v === "" ? null : v }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <datalist id="archlang-types">
            {CATALOG.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.name}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea
            key={`${path}-desc`}
            defaultValue={node.desc ?? ""}
            placeholder="What is this component for?"
            rows={3}
            className={`${inputCls} resize-y`}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === (node.desc ?? "")) return;
              mutate((d) => setComponentMeta(d, segments, { desc: v === "" ? null : v }));
            }}
          />
        </div>
        {node.children.length > 0 && (
          <div>
            <label className={labelCls}>Display</label>
            <div className="flex gap-1">
              {(["plane", "icon"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => mutate((d) => setDisplay(d, segments, mode))}
                  className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-medium ${
                    display === mode
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {mode === "plane" ? "Plane (open)" : "Icon (collapsed)"}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className={labelCls}>Payloads</label>
        {node.payloads.length === 0 && (
          <p className="text-[11.5px] text-slate-400">
            Structured detail — a schema, endpoints, env vars…
          </p>
        )}
        {node.payloads.map((p) => (
          <PayloadEditor
            key={`${path}-${p.name}`}
            name={p.name}
            format={p.format}
            content={p.content}
            onChange={(f, c) => mutate((d) => setPayload(d, segments, p.name, f, c))}
            onDelete={() => mutate((d) => removePayload(d, segments, p.name))}
          />
        ))}
        <div className="mt-2 flex gap-1.5">
          <input
            value={newPayload}
            onChange={(e) => setNewPayload(e.target.value)}
            placeholder="payload_name"
            spellCheck={false}
            className={`${inputCls} mono flex-1`}
          />
          <button
            onClick={() => {
              const name = newPayload.trim();
              if (!ID_RE.test(name)) return;
              mutate((d) => setPayload(d, segments, name, "json", "{}"));
              setNewPayload("");
            }}
            className="rounded-lg border border-slate-300 px-2.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>

        <button
          onClick={() => {
            mutate((d) => removeComponent(d, segments));
            onClose();
          }}
          className="mt-5 w-full rounded-lg border border-red-200 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50"
        >
          Delete component
        </button>
      </div>
    </div>
  );
}

function ConnectionDetail({
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
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <span className="mono truncate text-[12px] font-semibold">
          {pathToString(conn.source)} {conn.arrow} {pathToString(conn.target)}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-slate-400 hover:text-slate-700"
          aria-label="Close details"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <label className={labelCls}>Direction</label>
        <div className="flex gap-1">
          {(["->", "<->", "--"] as Arrow[]).map((a) => (
            <button
              key={a}
              onClick={() => commit({ arrow: a })}
              className={`mono rounded-lg border px-3 py-1 text-[12px] font-bold ${
                conn.arrow === a
                  ? "border-slate-700 bg-slate-800 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <input
            list="archlang-conn-types"
            key={connKey}
            defaultValue={conn.type ?? ""}
            placeholder="untyped"
            spellCheck={false}
            className={`${inputCls} mono`}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (conn.type ?? "") || (v !== "" && !TYPE_RE.test(v))) return;
              commit({ type: v === "" ? null : v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <datalist id="archlang-conn-types">
            {CONNECTION_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <TextField
          label="Label"
          defaultValue={conn.label ?? ""}
          placeholder="e.g. checkout sessions"
          onCommit={(v) => commit({ label: v === "" ? null : v })}
        />
        <button
          onClick={() => {
            mutate((d) => removeConnection(d, index));
            onClose();
          }}
          className="mt-5 w-full rounded-lg border border-red-200 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50"
        >
          Delete connection
        </button>
      </div>
    </div>
  );
}

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

export function DetailPanel({
  doc,
  selection,
  mutate,
  onSelect,
}: {
  doc: ArchDoc;
  selection: Selection;
  mutate: (fn: (d: ArchDoc) => ArchDoc) => void;
  onSelect: (s: Selection) => void;
}) {
  if (selection === null) return null;
  return (
    <aside className="w-[300px] shrink-0 border-l border-slate-200 bg-white">
      {selection.kind === "component" ? (
        <ComponentDetail
          key={selection.path}
          doc={doc}
          path={selection.path}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      ) : (
        <ConnectionDetail
          key={selection.key}
          doc={doc}
          connKey={selection.key}
          mutate={mutate}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      )}
    </aside>
  );
}
