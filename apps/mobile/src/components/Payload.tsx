/**
 * A payload to read, as the web inspector's `PayloadReadout`: a bordered card
 * with its name (mono, semibold) and format chip on a surface-2 strip, then
 * the content on the code color — markdown and tables rendered, json and
 * yaml as written (highlighted), a table that fails its check as source.
 */

import { View } from "react-native";
import { checkPayload, type PayloadNode } from "@archer/lang";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { CodeView } from "./CodeView";
import { Markdown, MarkdownTable, parseTable } from "./Markdown";
import { Chip, Txt } from "./ui";

export function PayloadReadout({ payload, first }: { payload: PayloadNode; first?: boolean }) {
  const { palette } = useTheme();
  const { format, content } = payload;
  const table = format === "table" && checkPayload(format, content) === null ? parseTable(content) : null;
  return (
    <View
      style={{
        marginTop: first ? 0 : 8,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: palette.line,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 28,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: 10,
          paddingRight: 6,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
          backgroundColor: palette.surface2,
        }}
      >
        <Txt size="sm" weight="600" mono numberOfLines={1} style={{ flex: 1 }}>
          {payload.name}
        </Txt>
        <Chip label={format} />
      </View>
      <View style={{ backgroundColor: palette.code.bg, maxHeight: 280 }}>
        {format === "markdown" ? (
          <Markdown source={content} />
        ) : table ? (
          <MarkdownTable token={table} />
        ) : (
          <CodeView source={content} language={format === "table" ? "plain" : format} gutter={false} />
        )}
      </View>
    </View>
  );
}
