"use client";

import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { SITE_URL } from "@/lib/site";
import { Button, Icon, SwapIcon, cx } from "../ui";

/** What "Copy prompt" puts on the clipboard: the whole setup, step by step. */
const PROMPT = `Set me up with Archer (${SITE_URL}), an architecture canvas I share with AI agents. Work through these steps in order, and stop where a step says to wait for me.

1. Install the Archer MCP server
It's hosted at ${SITE_URL}/mcp (Streamable HTTP). There's no API key, header or client ID to configure: sign-in happens in the browser.
- Claude Code: claude mcp add --transport http archer ${SITE_URL}/mcp
- Codex: codex mcp add archer --url ${SITE_URL}/mcp
- Gemini CLI: gemini mcp add --transport http archer ${SITE_URL}/mcp
- Cursor: add "archer": { "url": "${SITE_URL}/mcp" } under mcpServers in ~/.cursor/mcp.json
- VS Code: add "archer": { "type": "http", "url": "${SITE_URL}/mcp" } under servers in .vscode/mcp.json
- Any other client: follow ${SITE_URL}/docs/mcp
If you can't change your own MCP settings (Claude on the web or desktop, for example), give me the exact steps from that page instead. If your client has to restart or reload to pick up the server, tell me and wait.

2. Connect it
Start the sign-in so my browser opens, or tell me how to (Claude Code: I run /mcp, choose archer, then Authenticate; Codex: codex mcp login archer; Gemini CLI: /mcp auth archer). Wait while I sign in with GitHub, then call get_workspace_info to check you're connected and tell me which workspace you're working in.

3. Learn Archer
Archer keeps a system's architecture as a document we both edit: its components, what runs inside them and how they connect, written in the .arch language and drawn as a live diagram on my canvas. You work on it through the MCP tools. Everything you save is validated (a broken document is rejected, not saved), recorded in the project's history under your name, and appears on my canvas straight away. Call get_guide now, once: it has the workflows, the error codes and the full language spec.

4. Ask me what we're building
If you're working in a codebase right now, ask whether I'd like you to map its architecture into a new Archer project. If not, ask whether I'd like to plan the architecture of a new project together. Wait for my answer before you create anything.`;

/** What the box on the page types out: the same steps, trimmed to fit. */
const PREVIEW = `Set me up with Archer (${SITE_URL}).

1. Install the Archer MCP server: ${SITE_URL}/mcp (Streamable HTTP). The setup for your client is at ${SITE_URL}/docs/mcp.
2. Connect it: start the sign-in so my browser opens, and wait while I sign in with GitHub.
3. Learn Archer: it's an architecture canvas that people and agents share, edited as .arch documents through the MCP tools. Call get_guide once.
4. Ask me: if we're in a codebase, should you map its architecture into Archer? If not, should we plan a new project's architecture?`;

// Links and tool names get terminal colors; everything else stays plain.
const PARTS = PREVIEW.split(/(https?:\/\/\S+?(?=[.,;:)]*(?:\s|$))|get_guide)/).filter(Boolean);

// Typing starts this long after mount: the hero's rise-in, then a beat of
// idle cursor. A box that scrolls into view later still idles for IDLE_MS.
const START_MS = 1000;
const IDLE_MS = 300;

/** The preview's characters from `from` to `to`, colored the way a terminal would. */
function Slice({ from, to }: { from: number; to: number }) {
  let at = 0;
  return PARTS.map((part, i) => {
    const start = at;
    at += part.length;
    const text = part.slice(Math.max(0, from - start), Math.max(0, to - start));
    if (!text) return null;
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener"
          tabIndex={-1}
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-current"
        >
          {text}
        </a>
      );
    }
    if (part === "get_guide") {
      return (
        <span key={i} className="text-[var(--tok-string)]">
          {text}
        </span>
      );
    }
    return <Fragment key={i}>{text}</Fragment>;
  });
}

/**
 * When each character lands, in ms: quick jittered keys, a beat after
 * sentences and clauses, a longer one at line breaks.
 */
function keyTimes(text: string): number[] {
  const due: number[] = [];
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1];
    let ms = 3 + Math.random() * 8;
    if (prev === " ") ms += Math.random() * 12;
    if ((prev === "." || prev === ":") && c === " ") ms += 170;
    else if (prev === "," && c === " ") ms += 80;
    if (c === "\n") ms += prev === "\n" ? 90 : 260;
    t += ms;
    due.push(t);
  }
  return due;
}

/**
 * Types `text` out (about five seconds for the prompt) once `ref` is mostly on
 * screen. Returns how many characters show, whether it is mid-typing, and
 * `finish` to jump to the end. Reduced motion starts at the end.
 */
function useTypewriter(text: string, ref: RefObject<HTMLElement | null>) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const finishRef = useRef(() => {});

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mountedAt = performance.now();
    let timer = 0;
    let frame = 0;

    const type = () => {
      const due = keyTimes(text);
      let start = 0;
      let count = 0;
      setTyping(true);
      const tick = (now: number) => {
        if (!start) start = now;
        let next = count;
        while (next < text.length && (due[next] ?? Infinity) <= now - start) next++;
        if (next !== count) {
          count = next;
          setShown(next);
        }
        if (count < text.length) frame = requestAnimationFrame(tick);
        else setTyping(false);
      };
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const wait = Math.max(IDLE_MS, START_MS - (performance.now() - mountedAt));
        timer = window.setTimeout(type, wait);
      },
      { threshold: 0.35 },
    );

    const stop = () => {
      io.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    finishRef.current = () => {
      stop();
      setShown(text.length);
      setTyping(false);
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) finishRef.current();
    else io.observe(el);
    return stop;
  }, [text, ref]);

  return { shown, typing, finish: () => finishRef.current() };
}

/** Copies the prompt; `copied` stays true for a moment afterwards. */
function useCopyPrompt() {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  return { copied, copy };
}

/** Tells screen readers the prompt was copied: the button's label stays the same. */
function CopiedStatus({ copied }: { copied: boolean }) {
  return (
    <span role="status" className="sr-only">
      {copied ? "Copied" : ""}
    </span>
  );
}

/** The prompt's copy action on its own, for the page's closing call to action. */
export function CopyPromptButton() {
  const { copied, copy } = useCopyPrompt();
  return (
    <>
      <Button
        size="lg"
        icon={<SwapIcon swapped={copied} from={<Icon.Copy />} to={<Icon.Check />} />}
        onClick={copy}
      >
        Copy agent prompt
      </Button>
      <CopiedStatus copied={copied} />
    </>
  );
}

export function AgentPrompt() {
  const root = useRef<HTMLDivElement>(null);
  const { shown, typing, finish } = useTypewriter(PREVIEW, root);
  const done = shown === PREVIEW.length;
  const { copied, copy: copyPrompt } = useCopyPrompt();
  const copy = () => {
    finish();
    copyPrompt();
  };
  const dot = "size-2.5 rounded-full bg-line-2 transition-colors duration-150";
  return (
    <div ref={root} className="group overflow-hidden border border-line-2 bg-[var(--code-bg)] shadow-md">
      <div className="flex items-center justify-between border-b border-line bg-surface py-1 pl-3 pr-1">
        {/* Grey like an unfocused window until the pointer is over it. */}
        <span className="flex gap-1.5" aria-hidden>
          <span className={cx(dot, "group-hover:bg-[var(--landing-close)]")} />
          <span className={cx(dot, "group-hover:bg-[var(--landing-minimize)]")} />
          <span className={cx(dot, "group-hover:bg-[var(--landing-zoom)]")} />
        </span>
        <Button
          size="sm"
          className="rounded-none!"
          icon={<SwapIcon swapped={copied} from={<Icon.Copy />} to={<Icon.Check />} />}
          onClick={copy}
        >
          Copy prompt
        </Button>
        <CopiedStatus copied={copied} />
      </div>
      {/* Pressing anywhere in the text finishes the typing, so a selection starts on the whole prompt. */}
      <div
        className="mono grid cursor-text grid-cols-[2ch_minmax(0,1fr)] px-4 pb-4 pt-3.5 text-sm leading-[20px] text-[var(--code-fg)]"
        onPointerDown={finish}
        aria-hidden
      >
        <span className="select-none text-accent">❯</span>
        <p className="whitespace-pre-wrap wrap-break-word">
          <Slice from={0} to={shown} />
          <span className={cx("landing-caret", typing && "is-typing", !done && "motion-reduce:invisible")} />
          {/* The rest is laid out but invisible, so the box has its final size and line breaks from the first frame. */}
          <span className="invisible motion-reduce:visible">
            <Slice from={shown} to={PREVIEW.length} />
          </span>
        </p>
      </div>
      <p className="sr-only">{PROMPT}</p>
    </div>
  );
}
