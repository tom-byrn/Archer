import { lex, type Token, type TokenType } from "./lexer";
import { SHAPES } from "./shapes";
import {
  PAYLOAD_FORMATS,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type ConnectionNode,
  type Diagnostic,
  type LayoutEntry,
  type ParseResult,
  type PayloadFormat,
  type PlaneNode,
  type Span,
} from "./types";

class ParseError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

export const CURRENT_VERSION = "0.2";

/** Where a declaration goes: a scope's components and planes, and the plane it sits on. */
interface Target {
  components: ComponentNode[];
  planes: PlaneNode[];
  plane?: string;
}

export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = lex(source);
  let i = 0;

  const peek = (ahead = 0): Token => tokens[Math.min(i + ahead, tokens.length - 1)]!;
  const next = (): Token => {
    const t = peek();
    if (t.type !== "eof") i++;
    return t;
  };
  const at = (type: TokenType, value?: string): boolean => {
    const t = peek();
    return t.type === type && (value === undefined || t.value === value);
  };
  const fail = (message: string, span: Span): never => {
    throw new ParseError({ code: "E001", severity: "error", message, span });
  };
  const expect = (type: TokenType, what: string): Token => {
    const t = peek();
    if (t.type !== type) fail(`Expected ${what}, got ${describe(t)}.`, t.span);
    return next();
  };
  /** Where the last consumed token ends. */
  const lastEnd = () => tokens[Math.max(i - 1, 0)]!.span.end;

  const doc: ArchDoc = {
    kind: "doc",
    title: "Untitled",
    version: CURRENT_VERSION,
    components: [],
    planes: [],
    connections: [],
    layout: [],
  };

  // --- header ---------------------------------------------------------------
  if (at("ident", "arch")) {
    try {
      next();
      doc.title = expect("string", "a quoted document title").value;
      doc.version = expect("version", "a spec version like v0.2").value;
      const major = doc.version.split(".")[0];
      if (major !== CURRENT_VERSION.split(".")[0]) {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: `Unsupported spec major version v${doc.version} (this parser understands v${CURRENT_VERSION}).`,
        });
      }
    } catch (e) {
      if (e instanceof ParseError) diagnostics.push(e.diagnostic);
      else throw e;
    }
  } else {
    diagnostics.push({
      code: "E001",
      severity: "error",
      message: 'Missing header: a document must start with `arch "Title" v0.2`.',
      span: peek().span,
    });
  }

  // --- helpers --------------------------------------------------------------
  const parsePath = (): { path: string[]; span: Span } => {
    const first = expect("ident", "an identifier");
    const path = [first.value];
    let end = first.span.end;
    while (at("dot")) {
      next();
      const seg = expect("ident", "an identifier after '.'");
      path.push(seg.value);
      end = seg.span.end;
    }
    return { path, span: { start: first.span.start, end } };
  };

  const parseType = (): string => {
    expect("at", "'@'");
    const { path } = parsePath();
    return path.join(".");
  };

  const parseComponent = (): ComponentNode => {
    const kw = expect("ident", "'component'"); // caller guarantees value
    const idTok = expect("ident", "a component id");
    const node: ComponentNode = {
      kind: "component",
      id: idTok.value,
      payloads: [],
      children: [],
      planes: [],
      span: { start: kw.span.start, end: idTok.span.end },
    };
    if (at("string")) node.name = next().value;
    if (at("at")) node.type = parseType();
    // A declaration without a body spans its name and type too.
    node.span = { start: kw.span.start, end: lastEnd() };
    if (at("lbrace")) {
      next();
      const inside: Target = { components: node.children, planes: node.planes };
      while (!at("rbrace") && !at("eof")) {
        try {
          if (at("ident", "component")) {
            node.children.push(parseComponent());
          } else if (startsPlane()) {
            parsePlane(inside);
          } else if (at("ident", "desc")) {
            next();
            const t = peek();
            if (t.type === "string" || t.type === "triple-string") {
              node.desc = next().value;
            } else {
              fail(`Expected a string after 'desc', got ${describe(t)}.`, t.span);
            }
          } else if (at("ident", "src")) {
            const kwTok = next();
            const t = peek();
            if (t.type !== "string") {
              fail(`Expected a string after 'src', got ${describe(t)}.`, t.span);
            }
            const value = next().value;
            if (node.src !== undefined) {
              diagnostics.push({
                code: "E004",
                severity: "error",
                message: `Component '${node.id}' has more than one 'src'.`,
                span: { start: kwTok.span.start, end: t.span.end },
              });
            }
            node.src = value;
          } else if (at("ident", "shape")) {
            const kwTok = next();
            const t = peek();
            if (t.type !== "ident") {
              fail(
                `Expected a shape name after 'shape' (${SHAPES.join(" | ")}), got ${describe(t)}.`,
                t.span,
              );
            }
            const value = next().value;
            if (node.shape !== undefined) {
              diagnostics.push({
                code: "E004",
                severity: "error",
                message: `Component '${node.id}' has more than one 'shape'.`,
                span: { start: kwTok.span.start, end: t.span.end },
              });
            }
            node.shape = value;
          } else if (at("ident")) {
            node.payloads.push(parsePayload());
          } else {
            fail(
              `Expected 'desc', 'src', 'shape', 'component', 'plane', or a payload inside a component body, got ${describe(peek())}.`,
              peek().span,
            );
          }
        } catch (e) {
          if (e instanceof ParseError) {
            diagnostics.push(e.diagnostic);
            syncBody();
          } else throw e;
        }
      }
      const close = expect("rbrace", "'}'");
      node.span = { start: kw.span.start, end: close.span.end };
    }
    return node;
  };

  /**
   * `plane <id>` ahead. Checking for the id keeps `plane` usable as a
   * component id in connections (`plane -> db`).
   */
  const startsPlane = (): boolean => at("ident", "plane") && peek(1).type === "ident";

  /**
   * `plane <id> ["Name"] [@type] [{ desc, components, planes }]`. Its
   * components and planes belong to the enclosing scope, marked as sitting on
   * it: planes group what's on a canvas without adding a level to paths.
   */
  const parsePlane = (into: Target): void => {
    const kw = expect("ident", "'plane'");
    const idTok = expect("ident", "a plane id");
    const node: PlaneNode = {
      kind: "plane",
      id: idTok.value,
      ...(into.plane !== undefined ? { plane: into.plane } : {}),
      span: { start: kw.span.start, end: idTok.span.end },
    };
    // Listed before its body, so a scope's planes are in document order.
    into.planes.push(node);
    if (at("string")) node.name = next().value;
    if (at("at")) node.type = parseType();
    node.span = { start: kw.span.start, end: lastEnd() };
    if (!at("lbrace")) return;
    next();
    const on: Target = { components: into.components, planes: into.planes, plane: node.id };
    while (!at("rbrace") && !at("eof")) {
      const start = i;
      try {
        if (at("ident", "component")) {
          const c = parseComponent();
          c.plane = node.id;
          into.components.push(c);
        } else if (startsPlane()) {
          parsePlane(on);
        } else if (at("ident", "desc")) {
          next();
          const t = peek();
          if (t.type === "string" || t.type === "triple-string") node.desc = next().value;
          else fail(`Expected a string after 'desc', got ${describe(t)}.`, t.span);
        } else {
          fail(
            `Expected 'desc', 'component', or 'plane' inside a plane body, got ${describe(peek())}.`,
            peek().span,
          );
        }
      } catch (e) {
        if (e instanceof ParseError) {
          diagnostics.push(e.diagnostic);
          // `src` and `shape` are statement starts elsewhere but not here:
          // step over one so recovery always moves on.
          if (i === start) next();
          syncBody();
        } else throw e;
      }
    }
    const close = expect("rbrace", "'}'");
    node.span = { start: kw.span.start, end: close.span.end };
  };

  const parsePayload = () => {
    const nameTok = expect("ident", "a payload name");
    const fmtTok = expect("ident", "a payload format (json | yaml | table | markdown)");
    if (!PAYLOAD_FORMATS.includes(fmtTok.value as PayloadFormat)) {
      fail(
        `Unknown payload format '${fmtTok.value}' (expected json | yaml | table | markdown).`,
        fmtTok.span,
      );
    }
    const fenceTok = expect("fence", "a fenced payload body (\`\`\` ... \`\`\`)");
    return {
      kind: "payload" as const,
      name: nameTok.value,
      format: fmtTok.value as PayloadFormat,
      content: fenceTok.value,
      span: { start: nameTok.span.start, end: fenceTok.span.end },
    };
  };

  const parseConnection = (): ConnectionNode => {
    const src = parsePath();
    const arrowTok = expect("arrow", "an arrow (-> | <-> | --)");
    const tgt = parsePath();
    const node: ConnectionNode = {
      kind: "connection",
      source: src.path,
      target: tgt.path,
      arrow: arrowTok.value as Arrow,
      payloads: [],
      span: { start: src.span.start, end: tgt.span.end },
    };
    if (at("at")) node.type = parseType();
    if (at("colon")) {
      next();
      const label = expect("string", "a quoted connection label after ':'");
      node.label = label.value;
      node.span = { start: src.span.start, end: label.span.end };
    }
    // Optional body: payload blocks only (a message schema, a request shape…).
    if (at("lbrace")) {
      next();
      while (!at("rbrace") && !at("eof")) {
        // A statement keyword here means the body was never closed: report it
        // and hand the token back to the top-level loop instead of eating it.
        if (["component", "layout", "desc", "src"].some((kw) => at("ident", kw)) || startsPlane()) {
          diagnostics.push({
            code: "E001",
            severity: "error",
            message: `Expected '}' closing the connection body, got ${describe(peek())}.`,
            span: peek().span,
          });
          return node;
        }
        try {
          if (at("ident")) {
            node.payloads.push(parsePayload());
          } else {
            fail(
              `Expected a payload inside a connection body, got ${describe(peek())}.`,
              peek().span,
            );
          }
        } catch (e) {
          if (e instanceof ParseError) {
            diagnostics.push(e.diagnostic);
            syncBody();
          } else throw e;
        }
      }
      const close = expect("rbrace", "'}' closing the connection body");
      node.span = { start: src.span.start, end: close.span.end };
    }
    return node;
  };

  const parseLayoutBlock = () => {
    next(); // 'layout'
    expect("lbrace", "'{' after 'layout'");
    while (!at("rbrace") && !at("eof")) {
      try {
        const { path, span } = parsePath();
        expect("colon", "':' after layout path");
        expect("lbrace", "'{'");
        const entry: LayoutEntry = { kind: "layout-entry", path, span };
        while (!at("rbrace") && !at("eof")) {
          if (at("comma")) {
            next();
            continue;
          }
          const key = expect("ident", "a layout property (at | size)");
          expect("colon", "':'");
          if (key.value === "at" || key.value === "size") {
            expect("lbracket", "'['");
            const a = expect("number", "a number");
            expect("comma", "','");
            const b = expect("number", "a number");
            expect("rbracket", "']'");
            entry[key.value] = [parseInt(a.value, 10), parseInt(b.value, 10)];
          } else {
            fail(`Unknown layout property '${key.value}'.`, key.span);
          }
        }
        expect("rbrace", "'}'");
        doc.layout.push(entry);
      } catch (e) {
        if (e instanceof ParseError) {
          diagnostics.push(e.diagnostic);
          syncBody();
        } else throw e;
      }
    }
    expect("rbrace", "'}' closing the layout block");
  };

  /** After an error inside a body/block: skip to something that looks like a statement boundary. */
  const syncBody = () => {
    while (
      !at("eof") &&
      !at("rbrace") &&
      !at("ident", "component") &&
      !at("ident", "desc") &&
      !at("ident", "src") &&
      !at("ident", "shape") &&
      !at("ident", "plane") &&
      !at("ident", "layout")
    ) {
      next();
    }
  };

  // --- top-level statements -------------------------------------------------
  const top: Target = { components: doc.components, planes: doc.planes };
  while (!at("eof")) {
    try {
      if (at("ident", "component")) {
        doc.components.push(parseComponent());
      } else if (startsPlane()) {
        parsePlane(top);
      } else if (at("ident", "layout")) {
        parseLayoutBlock();
      } else if (at("ident")) {
        doc.connections.push(parseConnection());
      } else {
        fail(
          `Expected 'component', 'plane', 'layout', or a connection, got ${describe(peek())}.`,
          peek().span,
        );
      }
    } catch (e) {
      if (e instanceof ParseError) {
        diagnostics.push(e.diagnostic);
        // Recover: skip one token, then sync to a plausible statement start.
        if (!at("eof")) next();
        while (!at("eof") && !at("ident") && !at("rbrace")) next();
        if (at("rbrace")) next();
      } else throw e;
    }
  }

  return { doc, diagnostics };
}

function describe(t: Token): string {
  if (t.type === "eof") return "end of file";
  if (t.type === "ident") return `'${t.value}'`;
  if (t.type === "string" || t.type === "triple-string") return "a string";
  return `'${t.value}'`;
}
