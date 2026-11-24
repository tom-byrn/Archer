import { planeTree, scopeOf, type Scope } from "./scope";
import {
  pathToString,
  type ArchDoc,
  type ComponentNode,
  type ConnectionNode,
  type LayoutEntry,
  type PayloadNode,
  type PlaneNode,
  type SequenceNode,
  type StepNode,
  type FlowNode,
  type MachineNode,
  type ModelNode,
  type EntityField,
  type ViewKind,
  type ViewNode,
} from "./types";

const INDENT = "  ";

const quote = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

const indentBlock = (text: string, depth: number): string =>
  text
    .split("\n")
    .map((l) => (l === "" ? l : INDENT.repeat(depth) + l))
    .join("\n");

/** A fence long enough that `content` can't close it early. */
const fenceFor = (content: string): string => {
  let longest = 2;
  for (const m of content.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
};

function formatPayload(p: PayloadNode, depth: number): string {
  const fence = fenceFor(p.content);
  const open = `${INDENT.repeat(depth)}${p.name} ${p.format} ${fence}`;
  const body = indentBlock(p.content, depth);
  return `${open}\n${body}\n${INDENT.repeat(depth)}${fence}`;
}

function formatDesc(desc: string, depth: number): string {
  const pad = INDENT.repeat(depth);
  if (!desc.includes("\n")) return `${pad}desc ${quote(desc)}`;
  return `${pad}desc """\n${indentBlock(desc, depth + 1)}\n${pad}"""`;
}

/**
 * A scope's declarations (or one plane's): components and planes in
 * canonical order, each plane with what sits on it.
 */
function formatItems(scope: Scope, on: PlaneNode | undefined, depth: number): string[] {
  const tree = planeTree(scope);
  const items = (plane: PlaneNode | undefined, d: number): string[] =>
    tree.itemsOn(plane).map((item) =>
      item.kind === "component" ? formatComponent(item, d) : formatPlane(item, d, items(item, d + 1)),
    );
  return items(on, depth);
}

function formatComponent(c: ComponentNode, depth: number): string {
  const pad = INDENT.repeat(depth);
  let head = `${pad}component ${c.id}`;
  if (c.name !== undefined) head += ` ${quote(c.name)}`;
  if (c.type !== undefined) head += ` @${c.type}`;

  const body: string[] = [];
  if (c.shape !== undefined) body.push(`${INDENT.repeat(depth + 1)}shape ${c.shape}`);
  if (c.icon !== undefined) body.push(`${INDENT.repeat(depth + 1)}icon ${c.icon}`);
  // A palette name stays bare; anything else (a hex value) is a string.
  if (c.color !== undefined)
    body.push(`${INDENT.repeat(depth + 1)}color ${/^[a-z][a-z0-9_]*$/.test(c.color) ? c.color : quote(c.color)}`);
  if (c.desc !== undefined) body.push(formatDesc(c.desc, depth + 1));
  for (const src of c.src ?? []) body.push(`${INDENT.repeat(depth + 1)}src ${quote(src)}`);
  for (const p of c.payloads) body.push(formatPayload(p, depth + 1));
  body.push(...formatItems(scopeOf(c), undefined, depth + 1));

  if (body.length === 0) return head;
  return `${head} {\n${body.join("\n")}\n${pad}}`;
}

function formatPlane(p: PlaneNode, depth: number, items: string[]): string {
  const pad = INDENT.repeat(depth);
  let head = `${pad}plane ${p.id}`;
  if (p.name !== undefined) head += ` ${quote(p.name)}`;
  if (p.type !== undefined) head += ` @${p.type}`;

  const body: string[] = [];
  if (p.desc !== undefined) body.push(formatDesc(p.desc, depth + 1));
  body.push(...items);

  if (body.length === 0) return head;
  return `${head} {\n${body.join("\n")}\n${pad}}`;
}

function connectionSortKey(c: ConnectionNode): string {
  return [
    pathToString(c.source),
    pathToString(c.target),
    c.arrow,
    c.type ?? "",
    c.label ?? "",
  ].join(" ");
}

function formatConnection(c: ConnectionNode): string {
  let line = `${pathToString(c.source)} ${c.arrow} ${pathToString(c.target)}`;
  if (c.type !== undefined) line += ` @${c.type}`;
  if (c.label !== undefined) line += ` : ${quote(c.label)}`;
  if (c.payloads.length === 0) return line;
  const body = c.payloads.map((p) => formatPayload(p, 1)).join("\n");
  return `${line} {\n${body}\n}`;
}

/**
 * One-line connections pack together; a connection with a body gets a blank
 * line on each side so the fences read as their own paragraph.
 */
function joinConnections(lines: string[]): string {
  let out = "";
  for (const [i, line] of lines.entries()) {
    if (i > 0) {
      const multi = line.includes("\n") || lines[i - 1]!.includes("\n");
      out += multi ? "\n\n" : "\n";
    }
    out += line;
  }
  return out;
}

function formatSteps(steps: readonly StepNode[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  const out: string[] = [];
  for (const step of steps) {
    if (step.kind === "message") {
      let line = `${pad}${pathToString(step.from)} ${step.arrow} ${pathToString(step.to)}`;
      if (step.type !== undefined) line += ` @${step.type}`;
      if (step.label !== undefined) line += ` : ${quote(step.label)}`;
      out.push(line);
    } else if (step.kind === "note") {
      out.push(`${pad}note over ${step.over.map(pathToString).join(", ")} ${quote(step.text)}`);
    } else {
      let line = pad;
      step.branches.forEach((b, i) => {
        line += i === 0 ? step.fragment : " else";
        if (b.guard !== undefined) line += ` ${quote(b.guard)}`;
        const inner = formatSteps(b.steps, depth + 1);
        line += inner.length === 0 ? " {}" : ` {\n${inner.join("\n")}\n${pad}}`;
      });
      out.push(line);
    }
  }
  return out;
}

/** One sequence in canonical form: how merge and diff compare them. */
export function formatSequence(s: SequenceNode): string {
  let head = `sequence ${s.id}`;
  if (s.name !== undefined) head += ` ${quote(s.name)}`;
  const steps = formatSteps(s.steps, 1);
  return steps.length === 0 ? `${head} {}` : `${head} {\n${steps.join("\n")}\n}`;
}

const IDENT_RE = /^[a-z][a-z0-9_]*$/;

const viewHead = (kw: string, v: { id: string; name?: string }, prep?: string, subject?: string[]): string => {
  let head = `${kw} ${v.id}`;
  if (v.name !== undefined) head += ` ${quote(v.name)}`;
  if (prep && subject) head += ` ${prep} ${pathToString(subject)}`;
  return head;
};

const block = (head: string, lines: string[]): string =>
  lines.length === 0 ? `${head} {}` : `${head} {\n${lines.join("\n")}\n}`;

const edgeLine = (e: { from: string; to: string; label?: string }): string =>
  `${INDENT}${e.from} -> ${e.to}${e.label !== undefined ? ` : ${quote(e.label)}` : ""}`;

/** One flow in canonical form: its nodes, then its edges, each as written. */
export function formatFlow(f: FlowNode): string {
  const lines = f.nodes.map((n) => {
    let line = `${INDENT}${n.node} ${n.id}`;
    if (n.name !== undefined) line += ` ${quote(n.name)}`;
    if (n.lane) line += ` in ${pathToString(n.lane)}`;
    return line;
  });
  lines.push(...f.edges.map(edgeLine));
  return block(viewHead("flow", f), lines);
}

/** One state machine in canonical form: its states, then its transitions. */
export function formatMachine(m: MachineNode): string {
  const lines = m.states.map((st) => {
    let line = `${INDENT}state ${st.id}`;
    if (st.name !== undefined) line += ` ${quote(st.name)}`;
    if (st.initial) line += " initial";
    if (st.final) line += " final";
    return line;
  });
  lines.push(...m.transitions.map(edgeLine));
  return block(viewHead("states", m, "of", m.of), lines);
}

const formatField = (f: EntityField): string => {
  let line = `${INDENT.repeat(2)}${f.name} ${IDENT_RE.test(f.type) ? f.type : quote(f.type)}`;
  if (f.pk) line += " pk";
  if (f.unique) line += " unique";
  if (f.optional) line += " optional";
  if (f.ref) line += ` -> ${f.ref.entity}${f.ref.field !== undefined ? `.${f.ref.field}` : ""}`;
  return line;
};

/** One data model in canonical form: its entities and their fields, as written. */
export function formatModel(m: ModelNode): string {
  const lines = m.entities.map((e) => {
    let head = `${INDENT}entity ${e.id}`;
    if (e.name !== undefined) head += ` ${quote(e.name)}`;
    return e.fields.length === 0 ? head : `${head} {\n${e.fields.map(formatField).join("\n")}\n${INDENT}}`;
  });
  return block(viewHead("entities", m, "on", m.on), lines);
}

/** Any view in canonical form: how diff and merge compare them. */
export function formatView(kind: ViewKind, node: ViewNode): string {
  return kind === "sequence"
    ? formatSequence(node as SequenceNode)
    : kind === "flow"
      ? formatFlow(node as FlowNode)
      : kind === "states"
        ? formatMachine(node as MachineNode)
        : formatModel(node as ModelNode);
}

function formatLayoutEntry(e: LayoutEntry): string {
  const props: string[] = [];
  if (e.at) props.push(`at: [${e.at[0]}, ${e.at[1]}]`);
  if (e.size) props.push(`size: [${e.size[0]}, ${e.size[1]}]`);
  return `${INDENT}${pathToString(e.path)}: { ${props.join(", ")} }`;
}

export interface FormatOptions {
  /** Omit the layout block entirely (used for repository files). */
  stripLayout?: boolean;
}

/**
 * Canonical form: header, declarations (components and planes in document
 * order, see PlaneTree.itemsOn), connections (sorted), views — sequences,
 * flows, state machines, data models — each kind in document order with its
 * contents as written, then layout (sorted by path). format(parse(format(x))) === format(x).
 */
export function format(doc: ArchDoc, opts: FormatOptions = {}): string {
  const sections: string[] = [`arch ${quote(doc.title)} v${doc.version}`];

  const declarations = formatItems({ components: doc.components, planes: doc.planes }, undefined, 0);
  if (declarations.length > 0) sections.push(declarations.join("\n\n"));

  if (doc.connections.length > 0) {
    const sorted = [...doc.connections].sort((a, b) =>
      connectionSortKey(a) < connectionSortKey(b) ? -1 : 1,
    );
    sections.push(joinConnections(sorted.map(formatConnection)));
  }

  // Sequences keep document order, and their steps always do: order is what they mean.
  for (const seq of doc.sequences) sections.push(formatSequence(seq));
  for (const f of doc.flows) sections.push(formatFlow(f));
  for (const m of doc.machines) sections.push(formatMachine(m));
  for (const m of doc.models) sections.push(formatModel(m));

  if (!opts.stripLayout && doc.layout.length > 0) {
    const sorted = [...doc.layout].sort((a, b) =>
      pathToString(a.path) < pathToString(b.path) ? -1 : 1,
    );
    sections.push(`layout {\n${sorted.map(formatLayoutEntry).join("\n")}\n}`);
  }

  return sections.join("\n\n") + "\n";
}
