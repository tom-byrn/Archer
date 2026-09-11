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
  desc?: string;
  payloads: PayloadNode[];
  children: ComponentNode[];
  span: Span;
}

export type Arrow = "->" | "<->" | "--";

export interface ConnectionNode {
  kind: "connection";
  /** Dot-path segments from the root, e.g. ["backend", "api"]. */
  source: string[];
  target: string[];
  arrow: Arrow;
  type?: string;
  label?: string;
  span: Span;
}

export type DisplayMode = "icon" | "plane";

export interface LayoutEntry {
  kind: "layout-entry";
  path: string[];
  at?: [number, number];
  size?: [number, number];
  display?: DisplayMode;
  span: Span;
}

export interface ArchDoc {
  kind: "doc";
  title: string;
  /** Spec version, e.g. "0.1". */
  version: string;
  components: ComponentNode[];
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
