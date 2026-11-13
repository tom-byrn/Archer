/**
 * A payload as the inspector shows it: its name and format, then a table
 * drawn as one, markdown rendered, json and yaml as written — with its check
 * (the same `checkPayload` the validator runs) when it doesn't parse.
 */

import { StyleSheet, View } from "react-native";
import { checkPayload, type PayloadNode } from "@archer/lang";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { CodeView } from "./CodeView";
import { Markdown, MarkdownTable, parseTable } from "./Markdown";
import { Chip, Txt } from "./ui";

export function PayloadView({ payload }: { payload: PayloadNode }) {
  const { palette } = useTheme();
  const problem = checkPayload(payload.format, payload.content);
  const table = payload.format === "table" && !problem ? parseTable(payload.content) : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
        <Txt weight="600" mono style={{ flex: 1 }}>
          {payload.name}
        </Txt>
        <Chip label={payload.format} mono tone={problem ? "danger" : "neutral"} />
      </View>
      {table ? (
        <View style={frame(palette)}>
          <MarkdownTable token={table} />
        </View>
      ) : payload.format === "markdown" ? (
        <View style={[frame(palette), { padding: 12 }]}>
          <Markdown source={payload.content} />
        </View>
      ) : (
        <CodeView source={payload.content} language="plain" gutter={false} />
      )}
      {problem && (
        <Txt size="sm" tone="danger" style={{ paddingHorizontal: 4 }}>
          {problem}
        </Txt>
      )}
    </View>
  );
}

const frame = (palette: ReturnType<typeof useTheme>["palette"]) => ({
  backgroundColor: palette.code.bg,
  borderRadius: RADIUS.lg,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: palette.line,
  overflow: "hidden" as const,
});
