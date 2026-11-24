/**
 * Read-only code as the web's code views draw it (the "View code" popout's
 * `Source`): line numbers in a gutter, 12px mono at 1.6 line height, the
 * editor's own `.arch` tokenizer (`@web/highlightArch`) for colors. Long lines
 * scroll sideways rather than wrap. Payloads (json, yaml) get the code
 * editor's key and value colors.
 */

import { memo, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { highlightArch, type HighlightToken } from "@web/highlightArch";
import { useTheme } from "@/lib/theme";
import type { CodePalette } from "@/lib/tokens";

const TOKEN: Record<string, keyof CodePalette> = {
  "tok-kw": "kw",
  "tok-string": "string",
  "tok-type": "type",
  "tok-arrow": "arrow",
  "tok-num": "num",
  "tok-comment": "comment",
  "tok-fence": "fence",
  "tok-payload": "payload",
  "tok-version": "version",
};

/**
 * JSON and YAML colored as the payload editors color them: keys in the type
 * color, strings, numbers and keywords in theirs. A line-by-line tokenizer;
 * good enough for reading.
 */
export function highlightData(source: string, format: "json" | "yaml"): HighlightToken[][] {
  const re =
    format === "json"
      ? /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([^"\d\-tfn]+|.)/g
      : /^(\s*-?\s*)([^:#\s][^:#]*?)(\s*:)(?=\s|$)|("(?:[^"\\]|\\.)*"|'[^']*')|(#.*$)|(-?\d+(?:\.\d+)?)(?=\s*$)|\b(true|false|null|yes|no)\b(?=\s*$)|([^"'#\d]+|.)/g;
  return source
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const out: HighlightToken[] = [];
      const push = (text: string, className?: string) => {
        if (text === "") return;
        const last = out[out.length - 1];
        if (last && last.className === className) last.text += text;
        else out.push({ text, ...(className ? { className } : {}) });
      };
      for (const m of line.matchAll(re)) {
        if (format === "json") {
          if (m[1] !== undefined) {
            push(m[1], m[2] !== undefined ? "tok-type" : "tok-string");
            if (m[2]) push(m[2]);
          } else if (m[3] !== undefined) push(m[3], "tok-num");
          else if (m[4] !== undefined) push(m[4], "tok-kw");
          else push(m[0]);
        } else if (m[2] !== undefined) {
          push(m[1] ?? "");
          push(m[2], "tok-type");
          push(m[3] ?? "");
        } else if (m[4] !== undefined) push(m[4], "tok-string");
        else if (m[5] !== undefined) push(m[5], "tok-comment");
        else if (m[6] !== undefined) push(m[6], "tok-num");
        else if (m[7] !== undefined) push(m[7], "tok-kw");
        else push(m[0]);
      }
      return out;
    });
}

export const CodeView = memo(function CodeView({
  source,
  language = "arch",
  gutter = true,
  scroll = false,
  errorLines,
}: {
  source: string;
  language?: "arch" | "json" | "yaml" | "plain";
  gutter?: boolean;
  /** Scroll vertically too (a full-screen code view). */
  scroll?: boolean;
  /** 1-based lines the validator flagged, washed in the danger tint. */
  errorLines?: ReadonlySet<number>;
}) {
  const { palette, mono } = useTheme();
  const c = palette.code;
  const lines = useMemo<HighlightToken[][]>(
    () =>
      language === "arch"
        ? highlightArch(source)
        : language === "plain"
          ? source.replace(/\n$/, "").split("\n").map((text) => [{ text }] as HighlightToken[])
          : highlightData(source, language),
    [source, language],
  );
  const text = { fontFamily: mono, fontSize: 12, lineHeight: 19 } as const;
  const body = (
    <View style={{ flexDirection: "row", paddingVertical: 8 }}>
      {gutter && (
        <View style={{ paddingLeft: 4 }}>
          {lines.map((_, i) => (
            <Text key={i} style={[text, { color: c.gutter, minWidth: 28, paddingRight: 6, textAlign: "right" }]}>
              {i + 1}
            </Text>
          ))}
        </View>
      )}
      <View style={{ paddingLeft: gutter ? 24 : 10, paddingRight: 12 }}>
        {lines.map((tokens, i) => (
          <Text
            key={i}
            selectable
            style={[text, { color: c.fg }, errorLines?.has(i + 1) && { backgroundColor: palette.dangerSoft }]}
          >
            {tokens.length === 0
              ? " "
              : tokens.map((t, j) => (
                  <Text key={j} style={t.className ? { color: c[TOKEN[t.className] ?? "fg"] } : undefined}>
                    {t.text}
                  </Text>
                ))}
          </Text>
        ))}
      </View>
    </View>
  );
  const sideways = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: c.bg }}>
      {body}
    </ScrollView>
  );
  return scroll ? (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }}>
      {sideways}
    </ScrollView>
  ) : (
    sideways
  );
});
