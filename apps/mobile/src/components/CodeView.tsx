/**
 * Read-only code: `.arch` source highlighted by the web's tokenizer
 * (`@web/highlightArch`, the editor's own), or a payload's text as written.
 * Line numbers in a gutter; long lines scroll sideways rather than wrap, so
 * the structure reads as it does in the editor.
 */

import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { highlightArch } from "@web/highlightArch";
import { useTheme } from "@/lib/theme";
import type { CodePalette } from "@/lib/tokens";
import { RADIUS } from "@/lib/tokens";

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

export const CodeView = memo(function CodeView({
  source,
  language = "arch",
  gutter = true,
  framed = true,
  highlightLines,
}: {
  source: string;
  /** `arch` is highlighted; anything else shows as written. */
  language?: "arch" | "plain";
  gutter?: boolean;
  /** In a bordered box (off when the code fills a screen). */
  framed?: boolean;
  /** 1-based lines to mark (diagnostics). */
  highlightLines?: ReadonlySet<number>;
}) {
  const { palette, mono } = useTheme();
  const c = palette.code;
  const lines = useMemo(
    () =>
      language === "arch"
        ? highlightArch(source)
        : source.replace(/\n$/, "").split("\n").map((text) => [{ text, className: undefined as string | undefined }]),
    [source, language],
  );
  const width = String(lines.length).length;
  const text = { fontFamily: mono, fontSize: 12.5, lineHeight: 19 };

  return (
    <View
      style={[
        { backgroundColor: c.bg },
        framed && {
          borderRadius: RADIUS.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line,
          overflow: "hidden",
        },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ paddingVertical: 10 }}>
          {lines.map((tokens, i) => {
            const marked = highlightLines?.has(i + 1);
            return (
              <View
                key={i}
                style={{ flexDirection: "row", backgroundColor: marked ? palette.dangerSoft : undefined }}
              >
                {gutter && (
                  <Text
                    style={[text, { color: c.gutter, width: width * 8 + 20, textAlign: "right", paddingRight: 12 }]}
                  >
                    {i + 1}
                  </Text>
                )}
                <Text selectable style={[text, { color: c.fg, paddingRight: 16, paddingLeft: gutter ? 0 : 12 }]}>
                  {tokens.length === 0
                    ? " "
                    : tokens.map((t, j) => (
                        <Text key={j} style={t.className ? { color: c[TOKEN[t.className] ?? "fg"] } : undefined}>
                          {t.text}
                        </Text>
                      ))}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
