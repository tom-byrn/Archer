"use client";

import { useMemo } from "react";
import {
  FLOW_NODE_KINDS,
  VIEW_LABELS,
  addGraphEdgeTo,
  componentPaths,
  findComponent,
  pathToString,
  removeEntity,
  removeGraphEdge,
  removeGraphNode,
  removeView,
  setEntity,
  setEntityFields,
  setFlowNode,
  setGraphEdge,
  setState,
  setViewMeta,
  type ArchDoc,
  type EntityDecl,
  type EntityField,
  type FlowNode,
  type FlowNodeKind,
  type MachineNode,
  type ModelNode,
} from "@archer/lang";
import { CommitInput } from "./DetailPanel";
import { Glyph } from "./nodes";
import { edgeKey, nodeKey } from "./ViewDiagrams";
import { Button, Icon, IconButton, PropertyRow, Section, Segmented, SidePanel, cx, inputCls } from "./ui";

type Mutate = (fn: (d: ArchDoc) => ArchDoc) => boolean | void;
type GraphView =
  | { kind: "flow"; node: FlowNode }
  | { kind: "states"; node: MachineNode }
  | { kind: "entities"; node: ModelNode };

const ID_RE = /^[a-z][a-z0-9_]*$/;
const FLOW_NAMES: Record<FlowNodeKind, string> = { start: "Start", step: "Step", decision: "Decision", end: "End" };

/** The right-hand panel of a flow, state machine or data model. */
export function ViewInspector({
  doc,
  view,
  selected,
  onSelect,
  mutate,
  readOnly,
  onDeleted,
}: {
  doc: ArchDoc;
  view: GraphView;
  selected: string | null;
  onSelect: (key: string | null) => void;
  mutate: Mutate;
  readOnly: boolean;
  onDeleted: () => void;
}) {
  const id = view.node.id;
  const nodeId = selected?.startsWith("n:") ? selected.slice(2) : undefined;
  const edgeIndex = selected?.startsWith("e:") ? Number(selected.slice(2)) : undefined;
  const edges = view.kind === "flow" ? view.node.edges : view.kind === "states" ? view.node.transitions : [];
  const edge = edgeIndex !== undefined ? edges[edgeIndex] : undefined;
  const flowNode = view.kind === "flow" && nodeId ? view.node.nodes.find((n) => n.id === nodeId) : undefined;
  const state = view.kind === "states" && nodeId ? view.node.states.find((s) => s.id === nodeId) : undefined;
  const entity = view.kind === "entities" && nodeId ? view.node.entities.find((e) => e.id === nodeId) : undefined;
  const item = flowNode ?? state ?? entity ?? edge;

  const title = flowNode
    ? `${FLOW_NAMES[flowNode.node]} · ${flowNode.name ?? flowNode.id}`
    : state
      ? `State · ${state.name ?? state.id}`
      : entity
        ? `Entity · ${entity.name ?? entity.id}`
        : edge
          ? view.kind === "flow"
            ? "Edge"
            : "Transition"
          : (view.node.name ?? view.node.id);

  const remove = () => {
    if (edgeIndex !== undefined) mutate((d) => removeGraphEdge(d, id, edgeIndex));
    else if (entity) mutate((d) => removeEntity(d, id, entity.id));
    else if (nodeId) mutate((d) => removeGraphNode(d, id, nodeId));
    onSelect(null);
  };

  return (
    <SidePanel resizable defaultWidth={380}>
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          {view.kind === "flow" ? (
            <Icon.Flow className="h-4 w-4 text-accent" />
          ) : view.kind === "states" ? (
            <Icon.States className="h-4 w-4 text-accent" />
          ) : (
            <Icon.Entities className="h-4 w-4 text-accent" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
          {item && !readOnly && (
            <IconButton label="Delete" onClick={remove}>
              <Icon.Trash />
            </IconButton>
          )}
          {item && (
            <IconButton label="Close" onClick={() => onSelect(null)}>
              <Icon.Close />
            </IconButton>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {flowNode && view.kind === "flow" ? (
            <FlowNodeForm key={selected} doc={doc} flow={view.node} node={flowNode} mutate={mutate} readOnly={readOnly} onSelect={onSelect} />
          ) : state && view.kind === "states" ? (
            <StateForm key={selected} machine={view.node} state={state} mutate={mutate} readOnly={readOnly} onSelect={onSelect} />
          ) : entity && view.kind === "entities" ? (
            <EntityForm key={selected} model={view.node} entity={entity} mutate={mutate} readOnly={readOnly} onSelect={onSelect} />
          ) : edge && edgeIndex !== undefined ? (
            <EdgeForm
              key={selected}
              ids={(view.kind === "flow" ? view.node.nodes : (view.node as MachineNode).states).map((n) => ({ id: n.id, name: n.name ?? n.id }))}
              edge={edge}
              index={edgeIndex}
              viewId={id}
              mutate={mutate}
              readOnly={readOnly}
              what={view.kind === "flow" ? "Edge" : "Transition"}
            />
          ) : (
            <ViewDetails doc={doc} view={view} mutate={mutate} readOnly={readOnly} onSelect={onSelect} onDeleted={onDeleted} />
          )}
        </div>
      </div>
    </SidePanel>
  );
}

/** A component, or none, from every component in the document. */
export function ComponentPicker({
  doc,
  value,
  onChange,
  disabled,
  label,
  none = "None",
}: {
  doc: ArchDoc;
  value: string[] | undefined;
  onChange: (path: string[] | null) => void;
  disabled?: boolean;
  label: string;
  none?: string;
}) {
  const options = useMemo(
    () => [...componentPaths(doc)].map((key) => ({ key, name: findComponent(doc, key.split("."))?.name ?? key })),
    [doc],
  );
  const c = value ? findComponent(doc, value) : undefined;
  return (
    <div className="flex items-center gap-2">
      {c && <Glyph tag={c.type} color={c.color} icon={c.icon} size={16} className="shrink-0" />}
      <select
        aria-label={label}
        disabled={disabled}
        value={value ? pathToString(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value.split("."))}
        className={cx(inputCls, "h-7 min-w-0 flex-1")}
      >
        <option value="">{none}</option>
        {value && !c && <option value={pathToString(value)}>{pathToString(value)} (missing)</option>}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name === o.key ? o.key : `${o.name} · ${o.key}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function IdInput({ value, taken, onCommit, readOnly }: { value: string; taken: string[]; onCommit: (v: string) => void; readOnly: boolean }) {
  if (readOnly) return <span className="mono text-sm">{value}</span>;
  return (
    <CommitInput
      mono
      defaultValue={value}
      validate={(v) => (!ID_RE.test(v) ? "snake_case required" : v !== value && taken.includes(v) ? "Already taken" : null)}
      onCommit={onCommit}
    />
  );
}

function NameInput({ value, placeholder, onCommit, readOnly }: { value?: string; placeholder: string; onCommit: (v: string | null) => void; readOnly: boolean }) {
  if (readOnly) return <span className="text-sm">{value ?? placeholder}</span>;
  return <CommitInput defaultValue={value ?? ""} placeholder={placeholder} onCommit={(v) => onCommit(v === "" ? null : v)} />;
}

/** The edges out of a node: each label editable, and a way to add one. */
function Outgoing({
  viewId,
  from,
  edges,
  ids,
  mutate,
  readOnly,
  onSelect,
  what,
}: {
  viewId: string;
  from: string;
  edges: { from: string; to: string; label?: string }[];
  ids: { id: string; name: string }[];
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
  what: string;
}) {
  const out = edges.map((e, i) => ({ e, i })).filter(({ e }) => e.from === from);
  const nameOf = (id: string) => ids.find((x) => x.id === id)?.name ?? id;
  return (
    <Section title={`${what} out · ${out.length}`}>
      <ul className="flex flex-col gap-1.5">
        {out.map(({ e, i }) => (
          <li key={i} className="flex items-center gap-2">
            <button type="button" onClick={() => onSelect(edgeKey(i))} className="flex w-28 shrink-0 items-center gap-1 truncate text-left text-sm hover:text-accent">
              <Icon.ArrowRight className="h-3 w-3 shrink-0 text-ink-3" />
              <span className="truncate">{nameOf(e.to)}</span>
            </button>
            {readOnly ? (
              <span className="text-sm text-ink-2">{e.label}</span>
            ) : (
              <CommitInput
                className="min-w-0 flex-1"
                defaultValue={e.label ?? ""}
                placeholder="label"
                onCommit={(v) => mutate((d) => setGraphEdge(d, viewId, i, { label: v === "" ? null : v }))}
              />
            )}
            {!readOnly && (
              <IconButton label="Remove" onClick={() => mutate((d) => removeGraphEdge(d, viewId, i))}>
                <Icon.Close />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <select
          aria-label={what === "Edges" ? "Add an edge to" : "Add a transition to"}
          value=""
          onChange={(e) => {
            const to = e.target.value;
            if (to) mutate((d) => addGraphEdgeTo(d, viewId, from, to).doc);
          }}
          className={cx(inputCls, "mt-2 h-7")}
        >
          <option value="">Add {what === "Edges" ? "an edge" : "a transition"} to…</option>
          {ids.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

function FlowNodeForm({
  doc,
  flow,
  node,
  mutate,
  readOnly,
  onSelect,
}: {
  doc: ArchDoc;
  flow: FlowNode;
  node: FlowNode["nodes"][number];
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
}) {
  return (
    <>
      <Section title="Node">
        <PropertyRow label="Kind">
          <Segmented
            label="Kind"
            value={node.node}
            options={FLOW_NODE_KINDS.map((k) => ({ value: k, label: FLOW_NAMES[k] }))}
            onChange={(k) => !readOnly && mutate((d) => setFlowNode(d, flow.id, node.id, { node: k }))}
          />
        </PropertyRow>
        <PropertyRow label="Name">
          <NameInput value={node.name} placeholder={node.id} readOnly={readOnly} onCommit={(v) => mutate((d) => setFlowNode(d, flow.id, node.id, { name: v }))} />
        </PropertyRow>
        <PropertyRow label="ID">
          <IdInput
            value={node.id}
            taken={flow.nodes.map((n) => n.id)}
            readOnly={readOnly}
            onCommit={(v) => {
              mutate((d) => setFlowNode(d, flow.id, node.id, { id: v }));
              onSelect(nodeKey(v));
            }}
          />
        </PropertyRow>
        <PropertyRow label="Lane">
          <ComponentPicker
            doc={doc}
            label="Lane"
            none="No lane"
            value={node.lane}
            disabled={readOnly}
            onChange={(lane) => mutate((d) => setFlowNode(d, flow.id, node.id, { lane }))}
          />
        </PropertyRow>
        <p className="pl-[100px] text-xs text-ink-3">The lane is the component that does this step.</p>
      </Section>
      <Outgoing
        viewId={flow.id}
        from={node.id}
        edges={flow.edges}
        ids={flow.nodes.filter((n) => n.id !== node.id).map((n) => ({ id: n.id, name: n.name ?? n.id }))}
        mutate={mutate}
        readOnly={readOnly}
        onSelect={onSelect}
        what="Edges"
      />
    </>
  );
}

function StateForm({
  machine,
  state,
  mutate,
  readOnly,
  onSelect,
}: {
  machine: MachineNode;
  state: MachineNode["states"][number];
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
}) {
  return (
    <>
      <Section title="State">
        <PropertyRow label="Name">
          <NameInput value={state.name} placeholder={state.id} readOnly={readOnly} onCommit={(v) => mutate((d) => setState(d, machine.id, state.id, { name: v }))} />
        </PropertyRow>
        <PropertyRow label="ID">
          <IdInput
            value={state.id}
            taken={machine.states.map((s) => s.id)}
            readOnly={readOnly}
            onCommit={(v) => {
              mutate((d) => setState(d, machine.id, state.id, { id: v }));
              onSelect(nodeKey(v));
            }}
          />
        </PropertyRow>
        <PropertyRow label="Marks">
          <div className="flex gap-4 text-sm">
            {(["initial", "final"] as const).map((flag) => (
              <label key={flag} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={!!state[flag]}
                  onChange={(e) => mutate((d) => setState(d, machine.id, state.id, { [flag]: e.target.checked }))}
                  className="accent-[var(--accent)]"
                />
                {flag === "initial" ? "Initial" : "Final"}
              </label>
            ))}
          </div>
        </PropertyRow>
      </Section>
      <Outgoing
        viewId={machine.id}
        from={state.id}
        edges={machine.transitions}
        ids={machine.states.map((s) => ({ id: s.id, name: s.name ?? s.id }))}
        mutate={mutate}
        readOnly={readOnly}
        onSelect={onSelect}
        what="Transitions"
      />
    </>
  );
}

function EdgeForm({
  ids,
  edge,
  index,
  viewId,
  mutate,
  readOnly,
  what,
}: {
  ids: { id: string; name: string }[];
  edge: { from: string; to: string; label?: string };
  index: number;
  viewId: string;
  mutate: Mutate;
  readOnly: boolean;
  what: string;
}) {
  const pick = (end: "from" | "to") => (
    <select
      aria-label={end === "from" ? "From" : "To"}
      disabled={readOnly}
      value={edge[end]}
      onChange={(e) => mutate((d) => setGraphEdge(d, viewId, index, { [end]: e.target.value }))}
      className={cx(inputCls, "h-7")}
    >
      {ids.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  return (
    <Section title={what}>
      <PropertyRow label="From">{pick("from")}</PropertyRow>
      <PropertyRow label="To">{pick("to")}</PropertyRow>
      <PropertyRow label="Label">
        <NameInput
          value={edge.label}
          placeholder={what === "Transition" ? "The event, e.g. paid" : "e.g. yes"}
          readOnly={readOnly}
          onCommit={(v) => mutate((d) => setGraphEdge(d, viewId, index, { label: v }))}
        />
      </PropertyRow>
    </Section>
  );
}

function EntityForm({
  model,
  entity,
  mutate,
  readOnly,
  onSelect,
}: {
  model: ModelNode;
  entity: EntityDecl;
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
}) {
  const fields = entity.fields;
  const commit = (next: EntityField[]) => mutate((d) => setEntityFields(d, model.id, entity.id, next));
  const patch = (i: number, p: Omit<Partial<EntityField>, "ref"> & { ref?: EntityField["ref"] | null }) =>
    commit(
      fields.map((f, k) => {
        if (k !== i) return f;
        const out: EntityField = { ...f };
        for (const [key, v] of Object.entries(p) as [keyof EntityField, unknown][]) {
          if (v === undefined || v === null || v === false || v === "") delete out[key];
          else (out as unknown as Record<string, unknown>)[key] = v;
        }
        if (out.type === undefined) out.type = f.type;
        return out;
      }),
    );
  const others = model.entities;
  return (
    <>
      <Section title="Entity">
        <PropertyRow label="Name">
          <NameInput value={entity.name} placeholder={entity.id} readOnly={readOnly} onCommit={(v) => mutate((d) => setEntity(d, model.id, entity.id, { name: v }))} />
        </PropertyRow>
        <PropertyRow label="ID">
          <IdInput
            value={entity.id}
            taken={model.entities.map((e) => e.id)}
            readOnly={readOnly}
            onCommit={(v) => {
              mutate((d) => setEntity(d, model.id, entity.id, { id: v }));
              onSelect(nodeKey(v));
            }}
          />
        </PropertyRow>
      </Section>
      <Section title={`Fields · ${fields.length}`}>
        <div className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <div key={`${entity.id}-${i}-${f.name}`} className="rounded-md border border-line p-2">
              <div className="flex items-center gap-1.5">
                <CommitInput
                  mono
                  className="min-w-0 flex-1"
                  defaultValue={f.name}
                  validate={(v) => (!ID_RE.test(v) ? "snake_case" : v !== f.name && fields.some((x) => x.name === v) ? "taken" : null)}
                  onCommit={(v) => patch(i, { name: v })}
                />
                <CommitInput
                  mono
                  className="w-28 shrink-0"
                  defaultValue={f.type}
                  validate={(v) => (v.trim() === "" || v.includes('"') ? "a type" : null)}
                  onCommit={(v) => patch(i, { type: v.trim() })}
                />
                {!readOnly && (
                  <IconButton label={`Remove ${f.name}`} onClick={() => commit(fields.filter((_, k) => k !== i))}>
                    <Icon.Close />
                  </IconButton>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1.5 text-xs text-ink-2">
                {(["pk", "unique", "optional"] as const).map((flag) => (
                  <label key={flag} className="flex items-center gap-1">
                    <input type="checkbox" disabled={readOnly} checked={!!f[flag]} onChange={(e) => patch(i, { [flag]: e.target.checked || undefined })} className="accent-[var(--accent)]" />
                    {flag === "pk" ? "PK" : flag}
                  </label>
                ))}
                <select
                  aria-label={`${f.name} refers to`}
                  disabled={readOnly}
                  value={f.ref ? `${f.ref.entity}${f.ref.field ? `.${f.ref.field}` : ""}` : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const [ent, fld] = v.split(".");
                    patch(i, { ref: v === "" ? null : { entity: ent!, ...(fld ? { field: fld } : {}) } });
                  }}
                  className={cx(inputCls, "ml-auto h-6 w-36 text-xs")}
                >
                  <option value="">No reference</option>
                  {others.flatMap((o) => [
                    <option key={o.id} value={o.id}>
                      → {o.id}
                    </option>,
                    ...o.fields
                      .filter((x) => x.pk || x.unique)
                      .map((x) => (
                        <option key={`${o.id}.${x.name}`} value={`${o.id}.${x.name}`}>
                          → {o.id}.{x.name}
                        </option>
                      )),
                  ])}
                </select>
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            icon={<Icon.Plus />}
            onClick={() => {
              let n = fields.length + 1;
              while (fields.some((f) => f.name === `field_${n}`)) n++;
              commit([...fields, { name: `field_${n}`, type: "text" }]);
            }}
          >
            Add field
          </Button>
        )}
      </Section>
    </>
  );
}

function ViewDetails({
  doc,
  view,
  mutate,
  readOnly,
  onSelect,
  onDeleted,
}: {
  doc: ArchDoc;
  view: GraphView;
  mutate: Mutate;
  readOnly: boolean;
  onSelect: (key: string | null) => void;
  onDeleted: () => void;
}) {
  const v = view.node;
  const items =
    view.kind === "flow"
      ? view.node.nodes.map((n) => ({ id: n.id, name: n.name ?? n.id, hint: FLOW_NAMES[n.node] }))
      : view.kind === "states"
        ? view.node.states.map((s) => ({ id: s.id, name: s.name ?? s.id, hint: s.initial ? "initial" : s.final ? "final" : "" }))
        : view.node.entities.map((e) => ({ id: e.id, name: e.name ?? e.id, hint: `${e.fields.length} fields` }));
  const subject = view.kind === "states" ? view.node.of : view.kind === "entities" ? view.node.on : undefined;
  return (
    <>
      <Section title={VIEW_LABELS[view.kind].one.replace(/^./, (c) => c.toUpperCase())}>
        <PropertyRow label="Name">
          <NameInput key={`name-${v.id}`} value={v.name} placeholder={v.id} readOnly={readOnly} onCommit={(name) => mutate((d) => setViewMeta(d, v.id, { name }))} />
        </PropertyRow>
        <PropertyRow label="ID">
          <IdInput
            key={`id-${v.id}`}
            value={v.id}
            taken={[...doc.sequences, ...doc.flows, ...doc.machines, ...doc.models].map((x) => x.id)}
            readOnly={readOnly}
            onCommit={(id) => mutate((d) => setViewMeta(d, v.id, { id }))}
          />
        </PropertyRow>
        {view.kind !== "flow" && (
          <PropertyRow label={view.kind === "states" ? "States of" : "Model of"}>
            <ComponentPicker
              doc={doc}
              label={view.kind === "states" ? "States of" : "Model of"}
              value={subject}
              disabled={readOnly}
              onChange={(p) => mutate((d) => setViewMeta(d, v.id, { subject: p }))}
            />
          </PropertyRow>
        )}
      </Section>
      <Section title={`${view.kind === "flow" ? "Nodes" : view.kind === "states" ? "States" : "Entities"} · ${items.length}`}>
        <ul className="flex flex-col">
          {items.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => onSelect(nodeKey(x.id))} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{x.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {!readOnly && (
        <Section title="Danger zone">
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon.Trash />}
            onClick={() => {
              mutate((d) => removeView(d, v.id));
              onDeleted();
            }}
          >
            Delete {VIEW_LABELS[view.kind].one}
          </Button>
        </Section>
      )}
    </>
  );
}
