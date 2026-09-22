"use client";

import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { SITE_URL } from "@/lib/site";
import { Button, Icon, cx } from "../ui";

const PROMPT = `Read ${SITE_URL}/language to learn the Archer language.

Then map this repository's architecture as an Archer document: the components, what runs inside them, and how they connect. Use real names from the code and give each component a one-line desc. Check the result against the spec and save it as architecture.arch.

When you're done, tell me to paste it into a new document at ${SITE_URL}.`;

// Links and the output file get terminal colors; everything else stays plain.
const PARTS = PROMPT.split(/(https?:\/\/\S+?(?=[.,;:]?(?:\s|$))|architecture\.arch)/).filter(Boolean);

// Typing starts this long after mount: the hero's rise-in, then a beat of
// idle cursor. A box that scrolls into view later still idles for IDLE_MS.
const START_MS = 1000;
const IDLE_MS = 300;

/** The prompt's characters from `from` to `to`, colored the way a terminal would. */
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
    if (part === "architecture.arch") {
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

/** The prompt's copy action on its own, for the page's closing call to action. */
export function CopyPromptButton() {
  const { copied, copy } = useCopyPrompt();
  return (
    <Button size="lg" icon={copied ? <Icon.Check /> : <Icon.Copy />} onClick={copy}>
      <span aria-live="polite">{copied ? "Copied" : "Copy the agent prompt"}</span>
    </Button>
  );
}

export function AgentPrompt() {
  const root = useRef<HTMLDivElement>(null);
  const { shown, typing, finish } = useTypewriter(PROMPT, root);
  const done = shown === PROMPT.length;
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
          <span className={cx(dot, "group-hover:bg-danger")} />
          <span className={cx(dot, "group-hover:bg-warn")} />
          <span className={cx(dot, "group-hover:bg-accent")} />
        </span>
        <Button
          variant="primary"
          size="sm"
          className="min-w-[104px] rounded-none!"
          icon={copied ? <Icon.Check /> : <Icon.Copy />}
          onClick={copy}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy prompt"}</span>
        </Button>
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
            <Slice from={shown} to={PROMPT.length} />
          </span>
        </p>
      </div>
      <p className="sr-only">{PROMPT}</p>
    </div>
  );
}
