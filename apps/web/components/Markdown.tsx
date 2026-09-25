"use client";

/**
 * Markdown as the inspector reads it: marked's tokens rendered straight to
 * React. Nothing reaches innerHTML, so HTML in a payload shows as text, and a
 * link opens only to the web or an email address. Sized like the code editor
 * json and yaml payloads read in (12px, its padding and background), so a
 * rendered payload sits among them without standing out.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { Marked, type MarkedToken, type Token, type Tokens } from "marked";
import { Icon, cx } from "./ui";

const md = new Marked({ gfm: true });

/** The character references markdown text most often holds; others show as written. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "©",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  larr: "←",
  rarr: "→",
  times: "×",
  middot: "·",
};

/** Text as markdown shows it: `&amp;`, `&#8594;` and the like decoded. */
const decode = (text: string): string =>
  text.replace(
    /&(?:#(\d{1,7})|#x([\da-f]{1,6})|(\w+));/gi,
    (ref, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return ENTITIES[name] ?? ref;
      const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ref;
    },
  );

/** Where a link may go: the web or email. Anything else (javascript:, a relative path) stays text. */
const safeHref = (href: string): string | null =>
  /^(https?:\/\/|mailto:)/i.test(href) ? href : null;

const isComment = (t: Token): boolean => t.type === "html" && /^\s*<!--/.test(t.text as string);

function Inline({ tokens }: { tokens: Token[] }) {
  return tokens.map((t, i) => <Fragment key={i}>{inline(t as MarkedToken)}</Fragment>);
}

function inline(t: MarkedToken): ReactNode {
  switch (t.type) {
    case "text":
      return t.tokens ? <Inline tokens={t.tokens} /> : decode(t.text);
    case "escape":
      return t.text;
    case "strong":
      return (
        <strong className="font-semibold text-ink">
          <Inline tokens={t.tokens} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inline tokens={t.tokens} />
        </em>
      );
    case "del":
      return (
        <del>
          <Inline tokens={t.tokens} />
        </del>
      );
    case "codespan":
      return <code className="mono rounded-xs bg-surface-2 px-1 py-px text-xs">{t.text}</code>;
    case "br":
      return <br />;
    case "link":
    case "image": {
      // An image reads as a link to it: showing it would fetch whatever URL
      // the payload names for everyone who opens the component.
      const label = t.type === "image" ? decode(t.text) || t.href : <Inline tokens={t.tokens} />;
      const href = safeHref(t.href);
      if (!href) return label;
      return (
        <a
          href={href}
          title={t.title ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          {label}
        </a>
      );
    }
    case "html":
      // Written HTML shows as text; a line break (how table cells hold two lines) still breaks.
      if (isComment(t)) return null;
      return /^<br\s*\/?>$/i.test(t.text) ? <br /> : t.text;
    case "checkbox":
      // A task item's box, drawn by its list item.
      return null;
    default:
      return t.raw;
  }
}

/** Block tokens, a `gap` apart (headings a little more). */
function Blocks({ tokens, gap = "mt-2" }: { tokens: Token[]; gap?: string }) {
  const blocks = tokens.filter(
    (t) => t.type !== "space" && t.type !== "def" && t.type !== "checkbox" && !isComment(t),
  );
  return blocks.map((t, i) => (
    <Block
      key={i}
      token={t as MarkedToken}
      className={i === 0 ? undefined : t.type === "heading" ? "mt-3" : gap}
    />
  ));
}

function Block({ token: t, className }: { token: MarkedToken; className?: string }) {
  switch (t.type) {
    case "paragraph":
      return (
        <p className={className}>
          <Inline tokens={t.tokens} />
        </p>
      );
    case "text":
      // A tight list item's text.
      return (
        <div className={className}>{t.tokens ? <Inline tokens={t.tokens} /> : decode(t.text)}</div>
      );
    case "heading": {
      const H = `h${t.depth}` as "h1";
      return (
        <H
          className={cx(
            className,
            "font-semibold text-ink",
            t.depth <= 2 ? "text-base" : "text-sm",
          )}
        >
          <Inline tokens={t.tokens} />
        </H>
      );
    }
    case "list":
      return <List token={t} className={className} />;
    case "blockquote":
      return (
        <blockquote className={cx(className, "border-l-2 border-line-2 pl-2.5 text-ink-2")}>
          <Blocks tokens={t.tokens} />
        </blockquote>
      );
    case "code":
      return (
        <pre
          className={cx(
            className,
            "mono overflow-x-auto rounded-sm bg-surface-2 px-2 py-1.5 text-xs",
          )}
        >
          <code>{t.text}</code>
        </pre>
      );
    case "table":
      // Edge to edge, so its rules span the payload and its first column
      // lines up with the text; sideways on its own when it's too wide.
      return (
        <div className={cx(className, "-mx-2.5 overflow-x-auto border-y border-line")}>
          <MarkdownTable token={t} />
        </div>
      );
    case "hr":
      return <hr className={cx(className, "border-line")} />;
    case "html":
      return (
        <pre className={cx(className, "mono whitespace-pre-wrap text-xs text-ink-2")}>{t.text}</pre>
      );
    default:
      return <p className={className}>{t.raw}</p>;
  }
}

function List({ token, className }: { token: Tokens.List; className?: string }) {
  const items = token.items.map((item, i) => (
    <li
      key={i}
      className={cx(i > 0 && (token.loose ? "mt-2" : "mt-0.5"), item.task && "relative list-none")}
    >
      {item.task && <TaskBox checked={item.checked === true} />}
      <Blocks tokens={item.tokens} gap={token.loose ? "mt-2" : "mt-0.5"} />
    </li>
  ));
  return token.ordered ? (
    <ol
      start={typeof token.start === "number" && token.start !== 1 ? token.start : undefined}
      className={cx(className, "list-decimal pl-5 marker:text-ink-3")}
    >
      {items}
    </ol>
  ) : (
    <ul className={cx(className, "list-disc pl-5 marker:text-ink-3")}>{items}</ul>
  );
}

/** A task item's checkbox, in its bullet's place: in line with the text around the list. */
function TaskBox({ checked }: { checked: boolean }) {
  return (
    <span
      role="img"
      aria-label={checked ? "Done" : "Not done"}
      className={cx(
        "absolute -left-5 top-[3px] grid h-3 w-3 place-items-center rounded-xs border",
        checked ? "border-accent bg-accent text-accent-ink" : "border-line-2 bg-surface",
      )}
    >
      {checked && <Icon.Check className="h-2.5 w-2.5" />}
    </span>
  );
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/**
 * A table, rendered: a `table` payload on its own, edge to edge, its header
 * row held in view while the rows scroll under it.
 */
export function MarkdownTable({ token }: { token: Tokens.Table }) {
  const last = token.rows.length - 1;
  return (
    <table className="w-full border-separate border-spacing-0 text-sm text-[var(--code-fg)]">
      <thead>
        <tr>
          {token.header.map((cell, c) => (
            <th
              key={c}
              className={cx(
                "sticky top-0 border-b border-line-2 bg-[var(--code-bg)] px-2.5 py-1 align-bottom font-semibold text-ink",
                ALIGN[cell.align ?? "left"],
              )}
            >
              <Inline tokens={cell.tokens} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {token.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={cx(
                  "px-2.5 py-1 align-top",
                  r < last && "border-b border-line",
                  ALIGN[cell.align ?? "left"],
                )}
              >
                <Inline tokens={cell.tokens} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A markdown payload, rendered. */
export function Markdown({ source }: { source: string }) {
  const tokens = useMemo(() => md.lexer(source), [source]);
  return (
    <div className="break-words px-2.5 py-2 text-sm text-[var(--code-fg)]">
      {source.trim() === "" ? <p className="text-ink-3">Empty</p> : <Blocks tokens={tokens} />}
    </div>
  );
}

/**
 * A `table` payload's table, or null when marked doesn't read the source as
 * exactly one table. Lines are trimmed and blank ones dropped first, as the
 * table check (`validateTable` in @archer/lang) reads them.
 */
export function parseTable(source: string): Tokens.Table | null {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const tokens = md.lexer(lines.join("\n")).filter((t) => t.type !== "space");
  return tokens.length === 1 && tokens[0]!.type === "table" ? (tokens[0] as Tokens.Table) : null;
}
