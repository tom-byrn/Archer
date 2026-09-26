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
  desc?: string;
  /**
   * Where this component lives in code: a repo-relative path (e.g.
   * `apps/api/src/billing`) or a URL. Lets agents and humans jump from the
   * diagram to the implementation.
   */
  src?: string;
  payloads: PayloadNode[];
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
  layout: LayoutEntry[];
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
