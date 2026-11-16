/**
 * The code popout, as the web's `CodeDialog` / `CodePane` show it on a phone:
 * full screen, a 48px bar (code icon, title, `.arch`, error and warning
 * counts, copy buttons, close), the source highlighted with line numbers,
 * and the validator's findings in a list under it. Editors switch to typing
 * with Edit; like the web editor, it then saves by itself once the text stops
 * changing and has no errors.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { compileForAgent, type Diagnostic } from "@archer/lang";
import { analyzeSource, typeTags } from "@archer/mcp/analysis";
import { useTheme } from "@/lib/theme";
import { CodeView } from "./CodeView";
import { Icon } from "./Icon";
import { Button, Chip, IconButton, Txt, VRule } from "./ui";

/** Wait until `value` has been stable for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CodeDialog({
  open,
  onClose,
  title,
  source,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  source: string;
  /** Set: the code can be edited, and is saved through this. */
  onSave?: (source: string) => Promise<void>;
}) {
  const { palette, mono } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(source);
  const [copied, setCopied] = useState<"code" | "agent" | null>(null);
  const [typing, setTyping] = useState(false);
  const editing = useRef(false);
  useEffect(() => {
    if (!open) setTyping(false);
  }, [open]);
  // Follow the stored source (an agent's edit) while the user isn't typing.
  useEffect(() => {
    if (!editing.current) setText(source);
  }, [source]);
  const checked = useDebounced(text, 600);
  const analysis = useMemo(() => analyzeSource(checked, typeTags()), [checked]);
  const errors = analysis.errors.length;
  const warnings = analysis.warnings.length;

  // Autosave, as the web editor does: once typing stops and nothing is broken.
  useEffect(() => {
    if (!onSave || checked === source || errors > 0 || !editing.current) return;
    void onSave(checked);
  }, [checked, source, errors, onSave]);

  const copy = (kind: "code" | "agent") => {
    void Clipboard.setStringAsync(kind === "agent" ? compileForAgent(analysis.doc) : text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const errorLines = new Set(analysis.errors.filter((d) => d.span).map((d) => d.span!.start.line));

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: palette.code.bg, paddingTop: insets.top }}
      >
        <View
          style={{
            height: 48,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 12,
            paddingRight: 8,
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
            backgroundColor: palette.surface,
          }}
        >
          <Icon name="code" size={16} color={palette.ink3} />
          <Txt weight="500" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Txt>
          <Txt size="xs" tone="ink3" mono>
            .arch
          </Txt>
          {errors > 0 && <Chip tone="danger" label={`${errors} error${errors === 1 ? "" : "s"}`} />}
          {warnings > 0 && <Chip tone="warn" label={`${warnings} warning${warnings === 1 ? "" : "s"}`} />}
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
            {onSave && (
              <Button size="sm" title={typing ? "Done" : "Edit"} icon={typing ? "check" : "pencil"} onPress={() => setTyping((t) => !t)} />
            )}
            <Button size="sm" title="" icon={copied === "code" ? "check" : "copy"} onPress={() => copy("code")} style={{ paddingHorizontal: 7, gap: 0 }} />
            <Button
              size="sm"
              title=""
              icon={copied === "agent" ? "check" : "sparkle"}
              disabled={errors > 0}
              onPress={() => copy("agent")}
              style={{ paddingHorizontal: 7, gap: 0 }}
            />
            <VRule style={{ marginHorizontal: 4 }} />
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {onSave && typing ? (
            <TextInput
              value={text}
              onChangeText={(t) => {
                editing.current = true;
                setText(t);
              }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              selectionColor={palette.accent}
              accessibilityLabel="Document source"
              autoFocus
              style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontFamily: mono, fontSize: 12, lineHeight: 19, color: palette.code.fg }}
            />
          ) : (
            <CodeView source={text} scroll errorLines={errorLines} />
          )}
        </View>
        {analysis.diagnostics.length > 0 && <DiagnosticList diagnostics={analysis.diagnostics} />}
        <View style={{ height: insets.bottom, backgroundColor: palette.surface }} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The code pane's findings: code chip, message, line. */
export function DiagnosticList({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const { palette } = useTheme();
  return (
    <ScrollView
      style={{ maxHeight: 160, flexGrow: 0, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface }}
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      {diagnostics.map((d, i) => (
        <Pressable key={i} style={{ height: 26, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
          <Chip label={d.code} mono tone={d.severity === "error" ? "danger" : "warn"} />
          <Txt size="sm" tone="ink2" numberOfLines={1} style={{ flex: 1 }}>
            {d.message}
          </Txt>
          {d.span && (
            <Txt size="xs" tone="ink3" mono>
              L{d.span.start.line}
            </Txt>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
