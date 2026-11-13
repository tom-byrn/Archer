/** The validator's findings (spec §8 codes), errors first. */

import { View } from "react-native";
import type { Diagnostic } from "@archer/lang";
import { Chip, Row, Section, Txt } from "./ui";

export function Diagnostics({ diagnostics, title }: { diagnostics: readonly Diagnostic[]; title?: string }) {
  const sorted = [...diagnostics].sort(
    (a, b) =>
      Number(a.severity !== "error") - Number(b.severity !== "error") ||
      (a.span?.start.offset ?? 0) - (b.span?.start.offset ?? 0),
  );
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return (
    <Section
      title={
        title ??
        [errors > 0 && `${errors} error${errors === 1 ? "" : "s"}`, warnings > 0 && `${warnings} warning${warnings === 1 ? "" : "s"}`]
          .filter(Boolean)
          .join(" · ")
      }
    >
      {sorted.map((d, i) => (
        <Row
          key={i}
          first={i === 0}
          leading={<Chip label={d.code} mono tone={d.severity === "error" ? "danger" : "warn"} />}
          title={
            <Txt size="sm" numberOfLines={4}>
              {d.message}
            </Txt>
          }
          right={
            d.span ? (
              <View>
                <Txt size="xs" tone="ink3">
                  line {d.span.start.line}
                </Txt>
              </View>
            ) : undefined
          }
        />
      ))}
    </Section>
  );
}
