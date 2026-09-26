"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const TOKEN =
  /(#.*$)|("(?:[^"\\]|\\.)*")|(@[\w.-]+)|(->)|\b(arch|component|plane|layout|desc|at|size)\b|\b(v\d[\d.]*)\b|(-?\b\d+\b)|(```)/g;
const CLASSES = ["tok-comment", "tok-string", "tok-type", "tok-arrow", "tok-kw", "tok-version", "tok-num", "tok-fence"];

/** One line of Archer source as token-colored spans. */
export function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    const group = m.slice(1).findIndex((g) => g !== undefined);
    out.push(
      <span key={at} className={CLASSES[group]}>
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Read-only view of the document source. Lines that just changed flash, and scroll into view. */
export function SourcePane({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\n$/, "").split("\n");
  const previous = useRef(lines);
  const scroller = useRef<HTMLDivElement>(null);
  const [changed, setChanged] = useState<{ lines: Set<number>; tick: number }>({
    lines: new Set(),
    tick: 0,
  });

  useEffect(() => {
    const next = source.replace(/\n$/, "").split("\n");
    const before = previous.current;
    previous.current = next;
    const diff = new Set<number>();
    next.forEach((l, i) => {
      if (l !== before[i]) diff.add(i);
    });
    if (diff.size === 0 || diff.size === next.length) return;
    setChanged((c) => ({ lines: diff, tick: c.tick + 1 }));
    // Scroll inside the pane only; scrollIntoView would move the page too.
    const el = scroller.current;
    const first = el?.querySelector<HTMLElement>(`[data-line="${Math.min(...diff)}"]`);
    if (el && first) {
      const top = first.offsetTop - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, [source]);

  return (
    <div ref={scroller} className={className} style={{ background: "var(--code-bg)" }}>
      <pre
        className="mono relative py-3 text-sm leading-[20px]"
        style={{ color: "var(--code-fg)" }}
        aria-label="Document source"
      >
        {lines.map((line, i) => {
          const hit = changed.lines.has(i);
          return (
            <span
              key={hit ? `${i}:${changed.tick}` : i}
              data-line={i}
              className={hit ? "landing-source-line is-changed" : "landing-source-line"}
            >
              {highlight(line)}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
