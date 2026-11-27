// Core AST and diagnostic types for Archer. See docs/language-spec.md.

export interface Pos {
  /** 1-based line */
  line: number;
  /** 1-based column */
  col: number;
  /** 0-based offset into the source */
  offset: number;
}

export interface Span {
  start: Pos;
  end: Pos;
}

export type PayloadFormat = "json" | "yaml" | "table" | "markdown";
export const PAYLOAD_FORMATS: readonly PayloadFormat[] = [
  "json",
  "yaml",
  "table",
  "markdown",
];

/** Payloads attach to components and to connections alike. */
export interface PayloadNode {
  kind: "payload";
  name: string;
  format: PayloadFormat;
  /** Dedented content, no leading/trailing blank line. */
  content: string;
  span: Span;
}

export interface ComponentNode {
  kind: "component";
  id: string;
  /** Display name; defaults to id when absent. */
  name?: string;
  /** Type tag without the leading `@`, e.g. "aws.s3". */
  type?: string;
  /**
   * How the canvas draws it, e.g. "cylinder" (see SHAPES). Kept as written:
   * a name the language doesn't know is a warning, drawn as a box.
   */
  shape?: string;
  /**
   * The icon it shows, by name (a Phosphor icon, `@archer/catalog/icons`),
   * instead of its type's glyph or logo. Kept as written: a name the tools
   * don't know is a warning, drawn as if there were none. Without one, an
   * untyped component shows no icon.
   */
  icon?: string;
  /**
   * Its own color, instead of its type's: a palette name (`COLORS`, e.g.
   * "blue") or "#rrggbb". Kept as written: one the language doesn't know is a
   * warning, drawn as if there were none.
   */
  color?: string;
  desc?: string;
  /**
   * Where this component lives in code, one entry per `src` line in the order
   * written: repo-relative paths to a file or a folder (e.g.
   * `apps/api/src/billing`) or URLs. Lets agents and humans jump from the
   * diagram to the implementation. Absent, never empty, when there are none.
   */
  src?: string[];
  payloads: PayloadNode[];
  /**
   * The file its inside lives in (`use "./billing/billing.arch"`, relative to
   * the file that says so): its components, planes, the connections between
   * them and the views about them are that file's (spec §2.2). In a file on
   * disk such a component declares nothing inside itself; in a document put
   * together from its files (files.ts) the contents are filled in and `use`
   * remembers where they go back to.
   */
  use?: string;
  /**
   * Written `import "<file>" as <id>`: the shorthand for a component whose
   * whole definition, its display name included, comes from the file. Only
   * meaningful with `use`.
   */
  imported?: boolean;
  /**
   * The plane it sits on: the id of one of its scope's planes (the document's
   * top-level `planes`, or its parent component's). Absent when it sits on no
   * plane. Planes aren't part of paths, so this never changes its path.
   */
  plane?: string;
  /** Nested components: its own canvas, which the editor opens by drilling in. */
  children: ComponentNode[];
  /** The planes on that canvas. */
  planes: PlaneNode[];
  span: Span;
}

/**
 * A plane: a titled region of the canvas that components (and smaller planes)
 * sit on — "Frontend", "Backend", a VPC. It groups things for the reader and
 * nothing more: it is no component's parent, never part of a path, and never
 * a connection's endpoint. Its id shares a namespace with the components of
 * its scope, and `path + id` keys its layout entry.
 */
export interface PlaneNode {
  kind: "plane";
  id: string;
  /** Display name; defaults to id when absent. */
  name?: string;
  /** Type tag without the leading `@`, for its icon and tint, e.g. "aws.vpc". */
  type?: string;
  desc?: string;
  /** The plane it sits on, by id in the same scope; absent at the top of the scope. */
  plane?: string;
  span: Span;
}

/** Anything declared in a scope: a component or a plane. */
export type ItemNode = ComponentNode | PlaneNode;

export type Arrow = "->" | "<->" | "--";

export interface ConnectionNode {
  kind: "connection";
  /** Dot-path segments from the root, e.g. ["backend", "api"]. */
  source: string[];
  target: string[];
  arrow: Arrow;
  type?: string;
  label?: string;
  /**
   * Structured data on the edge — a message schema on a queue, a request
   * shape on an http call. Same block syntax and validation as component
   * payloads; empty for the common one-line connection.
   */
  payloads: PayloadNode[];
  span: Span;
}

/**
 * Where a component or plane sits on its canvas. `path` is a component's
 * dot-path, or a plane's: its scope's path plus its id. `at` is relative to
 * the plane it sits on (else to its canvas), `size` in grid cells.
 */
export interface LayoutEntry {
  kind: "layout-entry";
  path: string[];
  at?: [number, number];
  size?: [number, number];
  span: Span;
}

/** A message arrow in a sequence: a call, the reply to one, or a call nobody waits on. */
export type MessageArrow = "->" | "-->" | "~>";

export const MESSAGE_KINDS = { "->": "call", "-->": "reply", "~>": "async" } as const;
export type MessageKind = (typeof MESSAGE_KINDS)[MessageArrow];

/** One message between two components (or a component and itself). */
export interface MessageStep {
  kind: "message";
  from: string[];
  to: string[];
  arrow: MessageArrow;
  /** Connection type tag without `@`, e.g. "http". */
  type?: string;
  label?: string;
  span: Span;
}

export type FragmentKind = "alt" | "opt" | "loop" | "par";
export const FRAGMENT_KINDS: readonly FragmentKind[] = ["alt", "opt", "loop", "par"];

/** One branch of a fragment: its guard (`"slug is free"`) and its steps. */
export interface FragmentBranch {
  guard?: string;
  steps: StepNode[];
}

/**
 * `alt "a" { … } else "b" { … }`, `opt`, `loop`, `par`: a group of steps that
 * runs conditionally, repeatedly or concurrently. Only alt and par have more
 * than one branch.
 */
export interface FragmentStep {
  kind: "fragment";
  fragment: FragmentKind;
  branches: FragmentBranch[];
  span: Span;
}

/** `note over a, b "text"`: a remark spanning one or more lifelines. */
export interface NoteStep {
  kind: "note";
  over: string[][];
  text: string;
  span: Span;
}

export type StepNode = MessageStep | FragmentStep | NoteStep;

/**
 * A sequence: the order in which components exchange messages for one
 * scenario. Connections say who talks to whom; a sequence says when. Every
 * participant is a declared component, so it can't drift from the
 * architecture.
 */
export interface SequenceNode {
  kind: "sequence";
  id: string;
  /** Display name; defaults to id when absent. */
  name?: string;
  steps: StepNode[];
  span: Span;
}

/* ------------------------------------------------------------ Flows (§6.2) */

export type FlowNodeKind = "start" | "step" | "decision" | "end";
export const FLOW_NODE_KINDS: readonly FlowNodeKind[] = ["start", "step", "decision", "end"];

/** A node of an activity flow, in the lane of the component that does it (`in api`). */
export interface FlowNodeDecl {
  kind: "flow-node";
  node: FlowNodeKind;
  id: string;
  name?: string;
  lane?: string[];
  span: Span;
}

/** `a -> b : "yes"`: control passes from one node to the next. */
export interface FlowEdgeDecl {
  kind: "flow-edge";
  from: string;
  to: string;
  label?: string;
  span: Span;
}

/** An activity diagram: the steps and decisions of a process, one lane per component. */
export interface FlowNode {
  kind: "flow";
  id: string;
  name?: string;
  nodes: FlowNodeDecl[];
  edges: FlowEdgeDecl[];
  span: Span;
}

/* ------------------------------------------------------- State machines (§6.3) */

export interface StateDecl {
  kind: "state";
  id: string;
  name?: string;
  initial?: true;
  final?: true;
  span: Span;
}

/** `a -> b : "event"`: what moves the machine from one state to another. */
export interface TransitionDecl {
  kind: "transition";
  from: string;
  to: string;
  label?: string;
  span: Span;
}

/** The states one component (`of db`) moves through, and what moves it. */
export interface MachineNode {
  kind: "machine";
  id: string;
  name?: string;
  of?: string[];
  states: StateDecl[];
  transitions: TransitionDecl[];
  span: Span;
}

/* --------------------------------------------------------- Data models (§6.4) */

export interface EntityField {
  name: string;
  /** As written: an identifier (`uuid`) or a quoted string (`"varchar(255)"`). */
  type: string;
  pk?: true;
  unique?: true;
  optional?: true;
  /** `-> link` or `-> link.id`: a reference to another entity of the same model. */
  ref?: { entity: string; field?: string };
}

export interface EntityDecl {
  kind: "entity";
  id: string;
  name?: string;
  fields: EntityField[];
  span: Span;
}

/** The entities a store (`on db`) holds and how they relate. */
export interface ModelNode {
  kind: "model";
  id: string;
  name?: string;
  on?: string[];
  entities: EntityDecl[];
  span: Span;
}

/** Every kind of view (diagram) a document can hold besides its architecture. */
export type ViewKind = "sequence" | "flow" | "states" | "entities";
export type ViewNode = SequenceNode | FlowNode | MachineNode | ModelNode;

/**
 * Where a node of a flow, state machine or data model sits in its view's
 * diagram, when someone placed it (`view <id> { <node>: { at: [x, y] } }` in
 * the layout block). Presentation only, like component layout; in a flow
 * only `x` counts, since a node's lane is its row.
 */
export interface ViewLayoutEntry {
  kind: "view-layout";
  view: string;
  node: string;
  /** Grid cells of the view's diagram (40px, like the canvas). */
  at: [number, number];
  span: Span;
}

export interface ArchDoc {
  kind: "doc";
  title: string;
  /** Spec version, e.g. "0.2". */
  version: string;
  /** Top-level components. */
  components: ComponentNode[];
  /** Top-level planes. */
  planes: PlaneNode[];
  connections: ConnectionNode[];
  /** Sequences, in document order (the order the switcher lists them). */
  sequences: SequenceNode[];
  /** Activity flows, in document order. */
  flows: FlowNode[];
  /** State machines (`states` blocks), in document order. */
  machines: MachineNode[];
  /** Data models (`entities` blocks), in document order. */
  models: ModelNode[];
  layout: LayoutEntry[];
  /** Placed nodes of views (machine-managed, like `layout`). */
  viewLayout: ViewLayoutEntry[];
}

export type Severity = "error" | "warning";

export interface Diagnostic {
  /** e.g. "E001", "E101", "W301" — see spec §8. */
  code: string;
  message: string;
  severity: Severity;
  span?: Span;
}

export interface ParseResult {
  /** Best-effort document — present even when there are errors, unless the header is unusable. */
  doc: ArchDoc;
  diagnostics: Diagnostic[];
}

export const pathToString = (path: readonly string[]): string => path.join(".");
