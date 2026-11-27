import { lex, type Token, type TokenType } from "./lexer";
import { SHAPES } from "./shapes";
import {
  PAYLOAD_FORMATS,
  type ArchDoc,
  type Arrow,
  type ComponentNode,
  type ConnectionNode,
  type Diagnostic,
  type FragmentKind,
  type FragmentStep,
  type MessageArrow,
  type MessageStep,
  type NoteStep,
  type SequenceNode,
  type StepNode,
  FRAGMENT_KINDS,
  FLOW_NODE_KINDS,
  type EntityDecl,
  type EntityField,
  type FlowNode,
  type FlowNodeKind,
  type MachineNode,
  type ModelNode,
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
    sequences: [],
    flows: [],
    machines: [],
    models: [],
    layout: [],
    viewLayout: [],
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

  /** `import "<file>" as <id>` ahead (a connection from a component named `import` has an arrow next). */
  const startsImport = (): boolean => at("ident", "import") && peek(1).type === "string";

  const parseComponent = (): ComponentNode => {
    const imported = at("ident", "import");
    const kw = next(); // caller guarantees 'component' or 'import'
    let use: string | undefined;
    if (imported) {
      use = expect("string", "the file to import, as a quoted path").value;
      if (!at("ident", "as")) fail(`Expected 'as <id>' after the imported file, got ${describe(peek())}.`, peek().span);
      next();
    }
    const idTok = expect("ident", "a component id");
    const node: ComponentNode = {
      kind: "component",
      id: idTok.value,
      payloads: [],
      children: [],
      planes: [],
      ...(imported ? { use, imported: true } : {}),
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
          if (at("ident", "component") || startsImport()) {
            node.children.push(parseComponent());
          } else if (startsPlane()) {
            parsePlane(inside);
          } else if (at("ident", "use") && peek(1).type === "string") {
            const kwTok = next();
            const t = next();
            if (node.use !== undefined) {
              diagnostics.push({
                code: "E004",
                severity: "error",
                message: `Component '${node.id}' names more than one file to use.`,
                span: { start: kwTok.span.start, end: t.span.end },
              });
            }
            node.use = t.value;
          } else if (at("ident", "desc")) {
            next();
            const t = peek();
            if (t.type === "string" || t.type === "triple-string") {
              node.desc = next().value;
            } else {
              fail(`Expected a string after 'desc', got ${describe(t)}.`, t.span);
            }
          } else if (at("ident", "src")) {
            next();
            const t = peek();
            if (t.type !== "string") {
              fail(`Expected a string after 'src', got ${describe(t)}.`, t.span);
            }
            // One line per place the component lives; they add up in order.
            (node.src ??= []).push(next().value);
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
          } else if (at("ident", "icon")) {
            const kwTok = next();
            const t = peek();
            if (t.type !== "ident") {
              fail(`Expected an icon name after 'icon' (e.g. icon database), got ${describe(t)}.`, t.span);
            }
            const value = next().value;
            if (node.icon !== undefined) {
              diagnostics.push({
                code: "E004",
                severity: "error",
                message: `Component '${node.id}' has more than one 'icon'.`,
                span: { start: kwTok.span.start, end: t.span.end },
              });
            }
            node.icon = value;
          } else if (at("ident", "color")) {
            const kwTok = next();
            const t = peek();
            if (t.type !== "ident" && t.type !== "string") {
              fail(
                `Expected a color after 'color' (a name like color blue, or color "#rrggbb"), got ${describe(t)}.`,
                t.span,
              );
            }
            const value = next().value;
            if (node.color !== undefined) {
              diagnostics.push({
                code: "E004",
                severity: "error",
                message: `Component '${node.id}' has more than one 'color'.`,
                span: { start: kwTok.span.start, end: t.span.end },
              });
            }
            node.color = value;
          } else if (at("ident")) {
            node.payloads.push(parsePayload());
          } else {
            fail(
              `Expected 'desc', 'src', 'shape', 'icon', 'color', 'use', 'component', 'import', 'plane', or a payload inside a component body, got ${describe(peek())}.`,
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
        if (at("ident", "component") || startsImport()) {
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
          // `src`, `shape`, `icon` and `color` are statement starts elsewhere but not here:
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
    if (arrowTok.value === "-->" || arrowTok.value === "~>") {
      fail(
        `'${arrowTok.value}' is a sequence arrow (a reply or an async call): connections use -> | <-> | --.`,
        arrowTok.span,
      );
    }
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
        if (["component", "layout", "desc", "src"].some((kw) => at("ident", kw)) || startsPlane() || startsImport()) {
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

  /**
   * `sequence <id> <name> { … }` ahead. Checking for the id keeps `sequence`
   * usable as a component id in connections.
   */
  const startsSequence = (): boolean => at("ident", "sequence") && peek(1).type === "ident";

  /** A message ahead: a path, then an arrow. */
  const startsMessage = (): boolean =>
    at("ident") && (peek(1).type === "arrow" || peek(1).type === "dot");
  const startsFragment = (): boolean =>
    at("ident") &&
    FRAGMENT_KINDS.includes(peek().value as FragmentKind) &&
    (peek(1).type === "string" || peek(1).type === "lbrace");
  const startsNote = (): boolean => at("ident", "note") && peek(1).type === "ident" && peek(1).value === "over";

  const parseMessage = (): MessageStep => {
    const from = parsePath();
    const arrowTok = expect("arrow", "a message arrow (-> | --> | ~>)");
    if (arrowTok.value !== "->" && arrowTok.value !== "-->" && arrowTok.value !== "~>") {
      fail(
        `'${arrowTok.value}' isn't a message arrow: use -> (a call), --> (a reply) or ~> (an async call).`,
        arrowTok.span,
      );
    }
    const to = parsePath();
    const node: MessageStep = {
      kind: "message",
      from: from.path,
      to: to.path,
      arrow: arrowTok.value as MessageArrow,
      span: { start: from.span.start, end: to.span.end },
    };
    if (at("at")) node.type = parseType();
    if (at("colon")) {
      next();
      node.label = expect("string", "a quoted message label after ':'").value;
    }
    node.span = { start: from.span.start, end: lastEnd() };
    return node;
  };

  const parseNote = (): NoteStep => {
    const kw = next(); // 'note'
    next(); // 'over'
    const over = [parsePath().path];
    while (at("comma")) {
      next();
      over.push(parsePath().path);
    }
    const t = peek();
    if (t.type !== "string" && t.type !== "triple-string")
      fail(`Expected the note's text (a quoted string), got ${describe(t)}.`, t.span);
    const text = next().value;
    return { kind: "note", over, text, span: { start: kw.span.start, end: lastEnd() } };
  };

  /**
   * The '}' after a list of steps. When it's missing, parseSteps has already
   * said so (or the file ended): leave what follows to the statement it starts.
   */
  const closeSteps = (what: string) => {
    if (at("rbrace")) next();
    else if (at("eof"))
      diagnostics.push({ code: "E001", severity: "error", message: `Expected '}' closing the ${what}, got end of file.`, span: peek().span });
  };

  const parseBranch = (): StepNode[] => {
    expect("lbrace", "'{'");
    const steps = parseSteps();
    closeSteps("fragment");
    return steps;
  };

  const parseFragment = (): FragmentStep => {
    const kw = next();
    const fragment = kw.value as FragmentKind;
    const guard = at("string") ? next().value : undefined;
    const node: FragmentStep = {
      kind: "fragment",
      fragment,
      branches: [{ ...(guard !== undefined ? { guard } : {}), steps: parseBranch() }],
      span: kw.span,
    };
    while (at("ident", "else") && peek(1).type !== "arrow" && peek(1).type !== "dot") {
      const elseTok = next();
      if (fragment !== "alt" && fragment !== "par") {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: `Only 'alt' and 'par' take 'else' branches, not '${fragment}'.`,
          span: elseTok.span,
        });
      }
      const g = at("string") ? next().value : undefined;
      node.branches.push({ ...(g !== undefined ? { guard: g } : {}), steps: parseBranch() });
    }
    node.span = { start: kw.span.start, end: lastEnd() };
    return node;
  };

  /** Steps up to the closing '}' of a sequence or a branch (not consumed). */
  const parseSteps = (): StepNode[] => {
    const steps: StepNode[] = [];
    while (!at("rbrace") && !at("eof")) {
      // A top-level keyword means a body was never closed: leave it to the top level.
      if (at("ident", "component") || startsImport() || at("ident", "layout") || startsPlane() || startsSequence() || startsView("flow") || startsView("states") || startsView("entities")) {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: `Expected '}' closing the sequence, got ${describe(peek())}.`,
          span: peek().span,
        });
        return steps;
      }
      const start = i;
      try {
        if (startsMessage()) steps.push(parseMessage());
        else if (startsFragment()) steps.push(parseFragment());
        else if (startsNote()) steps.push(parseNote());
        else
          fail(
            `Expected a message (a -> b), a fragment (alt, opt, loop, par) or a note inside a sequence, got ${describe(peek())}.`,
            peek().span,
          );
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        diagnostics.push(e.diagnostic);
        if (i === start) next();
        while (!at("eof") && !at("rbrace") && !startsMessage() && !startsFragment() && !startsNote()) next();
      }
    }
    return steps;
  };

  const parseSequence = (): SequenceNode => {
    const kw = next(); // 'sequence'
    const idTok = expect("ident", "a sequence id");
    const node: SequenceNode = { kind: "sequence", id: idTok.value, steps: [], span: kw.span };
    if (at("string")) node.name = next().value;
    expect("lbrace", "'{' opening the sequence");
    node.steps = parseSteps();
    closeSteps("sequence");
    node.span = { start: kw.span.start, end: lastEnd() };
    return node;
  };

  /** `<kw> <id>` ahead at the top level: a view, not a connection from a component called `<kw>`. */
  const startsView = (kw: string): boolean => at("ident", kw) && peek(1).type === "ident";
  /** The next token is on the same line as `tok`: a declaration's modifiers never wrap. */
  const sameLine = (tok: Token): boolean => peek().type !== "eof" && peek().span.start.line === tok.span.start.line;

  /** `{ … }` of a view: statements until '}', each parsed by `statement`, recovering per line. */
  const parseViewBody = (what: string, statement: () => void) => {
    expect("lbrace", `'{' opening the ${what}`);
    while (!at("rbrace") && !at("eof")) {
      if (at("ident", "component") || startsImport() || at("ident", "layout") || startsPlane() || startsSequence() || startsView("flow") || startsView("states") || startsView("entities")) {
        diagnostics.push({
          code: "E001",
          severity: "error",
          message: `Expected '}' closing the ${what}, got ${describe(peek())}.`,
          span: peek().span,
        });
        return;
      }
      const start = i;
      const line = peek().span.start.line;
      try {
        statement();
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        diagnostics.push(e.diagnostic);
        if (i === start) next();
        // Skip the rest of the line.
        while (!at("eof") && !at("rbrace") && peek().span.start.line === line) next();
      }
    }
    closeSteps(what);
  };

  /** A view's head: `<kw> <id> ["Name"] [<prep> <path>]`. */
  const parseViewHead = (prep?: string) => {
    const kw = next();
    const idTok = expect("ident", `an id after '${kw.value}'`);
    const head: { kw: Token; id: string; name?: string; subject?: string[] } = { kw, id: idTok.value };
    if (at("string")) head.name = next().value;
    if (prep && at("ident", prep) && peek(1).type === "ident" && sameLine(kw)) {
      next();
      head.subject = parsePath().path;
    }
    return head;
  };

  const parseEdge = (what: string): { from: string; to: string; label?: string; span: Span } => {
    const from = expect("ident", `a ${what} id`);
    const arrow = expect("arrow", "'->'");
    if (arrow.value !== "->") fail(`Use '->' between ${what}s, not '${arrow.value}'.`, arrow.span);
    const to = expect("ident", `a ${what} id after '->'`);
    const edge: { from: string; to: string; label?: string; span: Span } = {
      from: from.value,
      to: to.value,
      span: { start: from.span.start, end: to.span.end },
    };
    if (at("colon")) {
      next();
      edge.label = expect("string", "a quoted label after ':'").value;
    }
    edge.span = { start: from.span.start, end: lastEnd() };
    return edge;
  };

  const parseFlow = (): FlowNode => {
    const head = parseViewHead();
    const node: FlowNode = {
      kind: "flow",
      id: head.id,
      ...(head.name !== undefined ? { name: head.name } : {}),
      nodes: [],
      edges: [],
      span: head.kw.span,
    };
    parseViewBody("flow", () => {
      if (at("ident") && FLOW_NODE_KINDS.includes(peek().value as FlowNodeKind) && peek(1).type === "ident") {
        const kw = next();
        const id = expect("ident", `an id after '${kw.value}'`);
        const n: FlowNode["nodes"][number] = { kind: "flow-node", node: kw.value as FlowNodeKind, id: id.value, span: kw.span };
        if (at("string") && sameLine(kw)) n.name = next().value;
        if (at("ident", "in") && peek(1).type === "ident" && sameLine(kw)) {
          next();
          n.lane = parsePath().path;
        }
        n.span = { start: kw.span.start, end: lastEnd() };
        node.nodes.push(n);
      } else if (at("ident") && peek(1).type === "arrow") {
        node.edges.push({ kind: "flow-edge", ...parseEdge("node") });
      } else {
        fail(`Expected a node (start, step, decision, end) or an edge (a -> b) inside a flow, got ${describe(peek())}.`, peek().span);
      }
    });
    node.span = { start: head.kw.span.start, end: lastEnd() };
    return node;
  };

  const parseMachine = (): MachineNode => {
    const head = parseViewHead("of");
    const node: MachineNode = {
      kind: "machine",
      id: head.id,
      ...(head.name !== undefined ? { name: head.name } : {}),
      ...(head.subject ? { of: head.subject } : {}),
      states: [],
      transitions: [],
      span: head.kw.span,
    };
    parseViewBody("states block", () => {
      if (at("ident", "state") && peek(1).type === "ident") {
        const kw = next();
        const id = expect("ident", "a state id");
        const st: MachineNode["states"][number] = { kind: "state", id: id.value, span: kw.span };
        if (at("string") && sameLine(kw)) st.name = next().value;
        while ((at("ident", "initial") || at("ident", "final")) && sameLine(kw)) {
          if (next().value === "initial") st.initial = true;
          else st.final = true;
        }
        st.span = { start: kw.span.start, end: lastEnd() };
        node.states.push(st);
      } else if (at("ident") && peek(1).type === "arrow") {
        node.transitions.push({ kind: "transition", ...parseEdge("state") });
      } else {
        fail(`Expected a state (state <id>) or a transition (a -> b) inside a states block, got ${describe(peek())}.`, peek().span);
      }
    });
    node.span = { start: head.kw.span.start, end: lastEnd() };
    return node;
  };

  const MODIFIERS = new Set(["pk", "unique", "optional"]);

  const parseField = (): EntityField => {
    const nameTok = expect("ident", "a field name");
    const t = peek();
    if ((t.type !== "ident" && t.type !== "string") || !sameLine(nameTok))
      fail(`Expected a type after field '${nameTok.value}' (e.g. ${nameTok.value} uuid), got ${describe(t)}.`, t.span);
    const field: EntityField = { name: nameTok.value, type: next().value };
    while (at("ident") && MODIFIERS.has(peek().value) && sameLine(nameTok)) {
      const m = next().value as "pk" | "unique" | "optional";
      field[m] = true;
    }
    if (at("arrow") && sameLine(nameTok)) {
      const arrow = next();
      if (arrow.value !== "->") fail(`A reference is written '-> entity' or '-> entity.field', not '${arrow.value}'.`, arrow.span);
      const { path } = parsePath();
      if (path.length > 2) fail("A reference names an entity, and optionally one of its fields: '-> link' or '-> link.id'.", arrow.span);
      field.ref = { entity: path[0]!, ...(path[1] !== undefined ? { field: path[1] } : {}) };
    }
    return field;
  };

  const parseModel = (): ModelNode => {
    const head = parseViewHead("on");
    const node: ModelNode = {
      kind: "model",
      id: head.id,
      ...(head.name !== undefined ? { name: head.name } : {}),
      ...(head.subject ? { on: head.subject } : {}),
      entities: [],
      span: head.kw.span,
    };
    parseViewBody("entities block", () => {
      if (at("ident", "entity") && peek(1).type === "ident") {
        const kw = next();
        const id = expect("ident", "an entity id");
        const ent: EntityDecl = { kind: "entity", id: id.value, fields: [], span: kw.span };
        if (at("string")) ent.name = next().value;
        if (at("lbrace")) parseViewBody("entity", () => ent.fields.push(parseField()));
        ent.span = { start: kw.span.start, end: lastEnd() };
        node.entities.push(ent);
      } else {
        fail(`Expected an entity (entity <id> { … }) inside an entities block, got ${describe(peek())}.`, peek().span);
      }
    });
    node.span = { start: head.kw.span.start, end: lastEnd() };
    return node;
  };

  const parseLayoutBlock = () => {
    next(); // 'layout'
    expect("lbrace", "'{' after 'layout'");
    while (!at("rbrace") && !at("eof")) {
      try {
        // `view <id> { <node>: { at: [x, y] } … }`: placed nodes of a view.
        if (at("ident", "view") && peek(1).type === "ident" && peek(2).type === "lbrace") {
          next();
          const view = next().value;
          next(); // '{'
          while (!at("rbrace") && !at("eof")) {
            const nodeTok = expect("ident", "a node id");
            expect("colon", "':' after the node id");
            expect("lbrace", "'{'");
            const key = expect("ident", "'at'");
            if (key.value !== "at") fail(`A view's layout only takes 'at', not '${key.value}'.`, key.span);
            expect("colon", "':'");
            expect("lbracket", "'['");
            const a = expect("number", "a number");
            expect("comma", "','");
            const b = expect("number", "a number");
            expect("rbracket", "']'");
            if (at("comma")) next();
            expect("rbrace", "'}'");
            doc.viewLayout.push({
              kind: "view-layout",
              view,
              node: nodeTok.value,
              at: [parseInt(a.value, 10), parseInt(b.value, 10)],
              span: { start: nodeTok.span.start, end: lastEnd() },
            });
          }
          expect("rbrace", "'}' closing the view's layout");
          continue;
        }
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
      !at("ident", "import") &&
      !at("ident", "use") &&
      !at("ident", "desc") &&
      !at("ident", "src") &&
      !at("ident", "shape") &&
      !at("ident", "icon") &&
      !at("ident", "color") &&
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
      if (at("ident", "component") || startsImport()) {
        doc.components.push(parseComponent());
      } else if (startsPlane()) {
        parsePlane(top);
      } else if (startsSequence()) {
        doc.sequences.push(parseSequence());
      } else if (startsView("flow")) {
        doc.flows.push(parseFlow());
      } else if (startsView("states")) {
        doc.machines.push(parseMachine());
      } else if (startsView("entities")) {
        doc.models.push(parseModel());
      } else if (at("ident", "layout")) {
        parseLayoutBlock();
      } else if (at("ident")) {
        doc.connections.push(parseConnection());
      } else {
        fail(
          `Expected 'component', 'import', 'plane', 'sequence', 'flow', 'states', 'entities', 'layout', or a connection, got ${describe(peek())}.`,
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
