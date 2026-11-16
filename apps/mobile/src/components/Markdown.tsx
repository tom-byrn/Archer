/**
 * Markdown as the web's inspector reads it (`apps/web/components/Markdown.tsx`):
 * marked's tokens rendered straight to native views, 12px in the code color
 * with the payload editors' padding. HTML shows as text, and a link opens
 * only to the web or an email address. Tables (`table` payloads) render the
 * same way, ruled, the header row in semibold ink.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Marked, type MarkedToken, type Token, type Tokens } from "marked";
import { sans } from "@/lib/fonts";
import { decodeEntities } from "@/lib/nativeSvg";
import { useTheme } from "@/lib/theme";
import { RADIUS, TEXT } from "@/lib/tokens";
import { Icon } from "./Icon";

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
        <Text style={{ fontFamily: sans("600"), color: palette.ink }}>
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
        <Text style={{ fontFamily: mono, fontSize: 11, backgroundColor: palette.surface2 }}>
          {` ${decodeEntities(t.text)} `}
        </Text>
      );
    case "br":
      return "\n";
    case "link":
    case "image": {
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

function Para({ children, size = "sm", bold }: { children: ReactNode; size?: "sm" | "base"; bold?: boolean }) {
  const { palette } = useTheme();
  return (
    <Text style={[TEXT[size], { fontFamily: sans(bold ? "600" : "400"), color: bold ? palette.ink : palette.code.fg }]}>
      {children}
    </Text>
  );
}

function Blocks({ tokens, gap = 8 }: { tokens: Token[]; gap?: number }) {
  const blocks = tokens.filter((t) => t.type !== "space" && t.type !== "def" && t.type !== "checkbox" && !isComment(t));
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
        <Para>
          <Inline tokens={t.tokens} />
        </Para>
      );
    case "text":
      return <Para>{t.tokens ? <Inline tokens={t.tokens} /> : decodeEntities(t.text)}</Para>;
    case "heading":
      return (
        <View style={{ marginTop: 4 }}>
          <Para size={t.depth <= 2 ? "base" : "sm"} bold>
            <Inline tokens={t.tokens} />
          </Para>
        </View>
      );
    case "list":
      return (
        <View style={{ gap: t.loose ? 8 : 2 }}>
          {t.items.map((item: Tokens.ListItem, i: number) => (
            <View key={i} style={{ flexDirection: "row" }}>
              <View style={{ width: 20, alignItems: "center", paddingTop: item.task ? 3 : 0 }}>
                {item.task ? (
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: RADIUS.xs,
                      borderWidth: 1,
                      borderColor: item.checked ? palette.accent : palette.line2,
                      backgroundColor: item.checked ? palette.accent : palette.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.checked && <Icon name="check" size={9} color={palette.accentInk} />}
                  </View>
                ) : (
                  <Text style={[TEXT.sm, { color: palette.ink3 }]}>{t.ordered ? `${(typeof t.start === "number" ? t.start : 1) + i}.` : "•"}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Blocks tokens={item.tokens} gap={t.loose ? 8 : 2} />
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
          <Text selectable style={{ fontFamily: mono, fontSize: 11, lineHeight: 16, color: palette.code.fg, paddingHorizontal: 8, paddingVertical: 6 }}>
            {t.text}
          </Text>
        </ScrollView>
      );
    case "table":
      return (
        <View style={{ marginHorizontal: -10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line }}>
          <MarkdownTable token={t} />
        </View>
      );
    case "hr":
      return <View style={{ height: 1, backgroundColor: palette.line }} />;
    case "html":
      return <Text style={{ fontFamily: mono, fontSize: 11, color: palette.ink2 }}>{t.text}</Text>;
    default:
      return <Para>{(t as Token).raw}</Para>;
  }
}

/** A table, ruled like the web's: header row in semibold ink over a line-2 rule, rows split by lines. */
export function MarkdownTable({ token }: { token: Tokens.Table }) {
  const { palette } = useTheme();
  const widths = token.header.map((h, c) =>
    Math.min(280, Math.max(60, ...[h.text, ...token.rows.map((r) => r[c]?.text ?? "")].map((s) => s.length * 7.6 + 26))),
  );
  const align = (a: Tokens.TableCell["align"]) => (a === "right" ? "right" : a === "center" ? "center" : "left");
  const cell = (cellToken: Tokens.TableCell, c: number, head: boolean) => (
    <View key={c} style={{ width: widths[c], paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text
        style={[
          TEXT.sm,
          { fontFamily: sans(head ? "600" : "400"), color: head ? palette.ink : palette.code.fg, textAlign: align(cellToken.align) },
        ]}
      >
        <Inline tokens={cellToken.tokens} />
      </Text>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1 }}>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line2, backgroundColor: palette.code.bg }}>
          {token.header.map((h, c) => cell(h, c, true))}
        </View>
        {token.rows.map((row, r) => (
          <View
            key={r}
            style={{
              flexDirection: "row",
              borderBottomWidth: r < token.rows.length - 1 ? 1 : 0,
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
  const { palette } = useTheme();
  const tokens = useMemo(() => md.lexer(source), [source]);
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
      {source.trim() === "" ? <Text style={[TEXT.sm, { fontFamily: sans(), color: palette.ink3 }]}>Empty</Text> : <Blocks tokens={tokens} />}
    </View>
  );
}

/** A `table` payload's table, or null when marked doesn't read it as exactly one table (the web's `parseTable`). */
export function parseTable(source: string): Tokens.Table | null {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const tokens = md.lexer(lines.join("\n")).filter((t) => t.type !== "space");
  return tokens.length === 1 && tokens[0]!.type === "table" ? (tokens[0] as Tokens.Table) : null;
}
