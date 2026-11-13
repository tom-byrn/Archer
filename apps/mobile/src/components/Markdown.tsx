/**
 * Markdown as the web's inspector reads it (`apps/web/components/Markdown.tsx`):
 * marked's tokens rendered straight to native views. HTML shows as text, and
 * a link opens only to the web or an email address. Also renders `table`
 * payloads, which are markdown tables.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Marked, type MarkedToken, type Token, type Tokens } from "marked";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { decodeEntities } from "@/lib/nativeSvg";
import { Txt } from "./ui";

const md = new Marked({ gfm: true });

const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:)/i.test(href) ? href : null);
const isComment = (t: Token): boolean => t.type === "html" && /^\s*<!--/.test(t.text as string);

function Inline({ tokens }: { tokens: Token[] }) {
  return tokens.map((t, i) => <InlineToken key={i} token={t as MarkedToken} />);
}

function InlineToken({ token: t }: { token: MarkedToken }): ReactNode {
  const { palette, mono } = useTheme();
  switch (t.type) {
    case "text":
      return t.tokens ? <Inline tokens={t.tokens} /> : decodeEntities(t.text);
    case "escape":
      return t.text;
    case "strong":
      return (
        <Text style={{ fontWeight: "600", color: palette.ink }}>
          <Inline tokens={t.tokens} />
        </Text>
      );
    case "em":
      return (
        <Text style={{ fontStyle: "italic" }}>
          <Inline tokens={t.tokens} />
        </Text>
      );
    case "del":
      return (
        <Text style={{ textDecorationLine: "line-through" }}>
          <Inline tokens={t.tokens} />
        </Text>
      );
    case "codespan":
      return (
        <Text style={{ fontFamily: mono, fontSize: 12.5, backgroundColor: palette.surface2 }}>
          {decodeEntities(t.text)}
        </Text>
      );
    case "br":
      return "\n";
    case "link":
    case "image": {
      // An image reads as a link to it, as on the web: nothing is fetched.
      const label = t.type === "image" ? decodeEntities(t.text) || t.href : <Inline tokens={t.tokens} />;
      const href = safeHref(t.href);
      if (!href) return <Fragment>{label}</Fragment>;
      return (
        <Text style={{ color: palette.accent }} onPress={() => void Linking.openURL(href)}>
          {label}
        </Text>
      );
    }
    case "html":
      if (isComment(t)) return null;
      return /^<br\s*\/?>$/i.test(t.text) ? "\n" : t.text;
    case "checkbox":
      return null;
    default:
      return (t as Token).raw;
  }
}

function Blocks({ tokens, gap = 8 }: { tokens: Token[]; gap?: number }) {
  const blocks = tokens.filter(
    (t) => t.type !== "space" && t.type !== "def" && t.type !== "checkbox" && !isComment(t),
  );
  return (
    <View style={{ gap }}>
      {blocks.map((t, i) => (
        <Block key={i} token={t as MarkedToken} />
      ))}
    </View>
  );
}

function Block({ token: t }: { token: MarkedToken }) {
  const { palette, mono } = useTheme();
  switch (t.type) {
    case "paragraph":
      return (
        <Txt size="sm" style={{ color: palette.code.fg }}>
          <Inline tokens={t.tokens} />
        </Txt>
      );
    case "text":
      return (
        <Txt size="sm" style={{ color: palette.code.fg }}>
          {t.tokens ? <Inline tokens={t.tokens} /> : decodeEntities(t.text)}
        </Txt>
      );
    case "heading":
      return (
        <Txt size={t.depth <= 2 ? "base" : "sm"} weight="600" style={{ marginTop: 4 }}>
          <Inline tokens={t.tokens} />
        </Txt>
      );
    case "list":
      return (
        <View style={{ gap: t.loose ? 8 : 3 }}>
          {t.items.map((item: Tokens.ListItem, i: number) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Txt size="sm" tone="ink3" style={{ minWidth: 14 }}>
                {item.task
                  ? item.checked
                    ? "☑"
                    : "☐"
                  : t.ordered
                    ? `${(typeof t.start === "number" ? t.start : 1) + i}.`
                    : "•"}
              </Txt>
              <View style={{ flex: 1 }}>
                <Blocks tokens={item.tokens} gap={t.loose ? 8 : 3} />
              </View>
            </View>
          ))}
        </View>
      );
    case "blockquote":
      return (
        <View style={{ borderLeftWidth: 2, borderLeftColor: palette.line2, paddingLeft: 10 }}>
          <Blocks tokens={t.tokens} />
        </View>
      );
    case "code":
      return (
        <ScrollView horizontal style={{ backgroundColor: palette.surface2, borderRadius: RADIUS.sm }}>
          <Text selectable style={{ fontFamily: mono, fontSize: 12, color: palette.code.fg, padding: 8 }}>
            {t.text}
          </Text>
        </ScrollView>
      );
    case "table":
      return <MarkdownTable token={t} />;
    case "hr":
      return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />;
    case "html":
      return (
        <Text style={{ fontFamily: mono, fontSize: 12, color: palette.ink2 }}>{t.text}</Text>
      );
    default:
      return <Txt size="sm">{(t as Token).raw}</Txt>;
  }
}

/** A table, sideways-scrolling when it's wider than the screen. */
export function MarkdownTable({ token }: { token: Tokens.Table }) {
  const { palette } = useTheme();
  // Columns sized to their longest cell, within reason.
  const widths = token.header.map((h, c) =>
    Math.min(
      260,
      Math.max(72, ...[h.text, ...token.rows.map((r) => r[c]?.text ?? "")].map((s) => s.length * 8 + 24)),
    ),
  );
  const align = (a: Tokens.TableCell["align"]) => (a === "right" ? "right" : a === "center" ? "center" : "left");
  const cell = (cellToken: Tokens.TableCell, c: number, head: boolean) => (
    <View key={c} style={{ width: widths[c], paddingHorizontal: 10, paddingVertical: 6 }}>
      <Txt size="sm" weight={head ? "600" : undefined} style={{ textAlign: align(cellToken.align), color: head ? palette.ink : palette.code.fg }}>
        <Inline tokens={cellToken.tokens} />
      </Txt>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line2 }}>
          {token.header.map((h, c) => cell(h, c, true))}
        </View>
        {token.rows.map((row, r) => (
          <View
            key={r}
            style={{
              flexDirection: "row",
              borderBottomWidth: r < token.rows.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: palette.line,
            }}
          >
            {row.map((c, i) => cell(c, i, false))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function Markdown({ source }: { source: string }) {
  const tokens = useMemo(() => md.lexer(source), [source]);
  if (source.trim() === "") return <Txt size="sm" tone="ink3">Empty</Txt>;
  return <Blocks tokens={tokens} />;
}

/** A `table` payload's table, or null when marked doesn't read it as exactly one table (as the web's `parseTable`). */
export function parseTable(source: string): Tokens.Table | null {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const tokens = md.lexer(lines.join("\n")).filter((t) => t.type !== "space");
  return tokens.length === 1 && tokens[0]!.type === "table" ? (tokens[0] as Tokens.Table) : null;
}
