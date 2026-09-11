/**
 * Lightweight Archer syntax highlighter: emits HTML with tok-* spans,
 * rendered behind a transparent textarea. Line-based with a small state
 * machine for payload fences and triple-quoted strings.
 */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const span = (cls: string, text: string): string =>
  text === "" ? "" : `<span class="${cls}">${esc(text)}</span>`;

const TOKEN =
  /(#.*$)|(""")|("(?:[^"\\]|\\.)*"?)|(`{3,})|(@[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)|(<->|->|--)|\b(arch|component|desc|layout)\b|\b(v\d+\.\d+)\b|(-?\d+)/g;

type State =
  | { kind: "normal" }
  | { kind: "fence"; len: number }
  | { kind: "triple" };

export function highlightArcher(source: string): string {
  const out: string[] = [];
  let state: State = { kind: "normal" };

  for (const line of source.split("\n")) {
    if (state.kind === "fence") {
      const fenceLen = state.len;
      if (new RegExp(`^\\s*\`{${fenceLen},}\\s*$`).test(line)) {
        out.push(span("tok-fence", line));
        state = { kind: "normal" };
      } else {
        out.push(span("tok-payload", line));
      }
      continue;
    }
    if (state.kind === "triple") {
      const close = line.indexOf('"""');
      if (close >= 0) {
        out.push(
          span("tok-string", line.slice(0, close + 3)) +
            highlightNormal(line.slice(close + 3)).html,
        );
        state = { kind: "normal" };
      } else {
        out.push(span("tok-string", line));
      }
      continue;
    }
    const res = highlightNormal(line);
    out.push(res.html);
    state = res.nextState;
  }
  return out.join("\n") + "\n";
}

function highlightNormal(line: string): { html: string; nextState: State } {
  let html = "";
  let last = 0;
  let nextState: State = { kind: "normal" };
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(line)) !== null) {
    html += esc(line.slice(last, m.index));
    const [, comment, tripleOpen, str, fence, type, arrow, kw, version, num] = m;
    if (comment !== undefined) {
      html += span("tok-comment", comment);
      last = line.length;
      break;
    } else if (tripleOpen !== undefined) {
      // Triple string: close on this line or spill to the next.
      const rest = line.slice(m.index + 3);
      const close = rest.indexOf('"""');
      if (close >= 0) {
        html += span("tok-string", line.slice(m.index, m.index + 3 + close + 3));
        TOKEN.lastIndex = m.index + 3 + close + 3;
        last = TOKEN.lastIndex;
        continue;
      }
      html += span("tok-string", line.slice(m.index));
      last = line.length;
      nextState = { kind: "triple" };
      break;
    } else if (str !== undefined) {
      html += span("tok-string", str);
    } else if (fence !== undefined) {
      // Fence: content may close on the same line with an equal run.
      const len = fence.length;
      const rest = line.slice(m.index + len);
      const closeMatch = new RegExp(`\`{${len},}`).exec(rest);
      if (closeMatch) {
        const end = m.index + len + closeMatch.index + closeMatch[0].length;
        html +=
          span("tok-fence", fence) +
          span("tok-payload", rest.slice(0, closeMatch.index)) +
          span("tok-fence", closeMatch[0]);
        TOKEN.lastIndex = end;
        last = end;
        continue;
      }
      html += span("tok-fence", line.slice(m.index));
      last = line.length;
      nextState = { kind: "fence", len };
      break;
    } else if (type !== undefined) {
      html += span("tok-type", type);
    } else if (arrow !== undefined) {
      html += span("tok-arrow", arrow);
    } else if (kw !== undefined) {
      html += span("tok-kw", kw);
    } else if (version !== undefined) {
      html += span("tok-version", version);
    } else if (num !== undefined) {
      html += span("tok-num", num);
    }
    last = TOKEN.lastIndex;
  }
  html += esc(line.slice(last));
  return { html, nextState };
}
