/**
 * Edit a document's `.arch` source as text. Diagnostics update as you type;
 * Save is offered once the source parses and validates without errors (as
 * agents' writes are), and leaving with unsaved changes asks first.
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { Stack, usePreventRemove, useRouter } from "expo-router";
import { analyzeSource, typeTags } from "@archer/mcp/analysis";
import { DocGate } from "@/components/DocGate";
import { Diagnostics } from "@/components/Diagnostics";
import { Button, Empty, Txt } from "@/components/ui";
import { useDoc } from "@/lib/doc";
import { useTheme } from "@/lib/theme";

export function EditSourceScreen() {
  return (
    <DocGate>
      <Editor />
    </DocGate>
  );
}

/** Wait until `value` has been stable for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Editor() {
  const d = useDoc();
  const router = useRouter();
  const { palette, mono } = useTheme();
  const [text, setText] = useState(d.source);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const checked = useDebounced(text, 300);
  const analysis = useMemo(() => analyzeSource(checked, typeTags()), [checked]);
  const dirty = text !== d.source;
  const errors = analysis.errors.length;

  // Leaving with unsaved changes asks first.
  usePreventRemove(dirty && !saved, ({ repeat }) =>
    Alert.alert("Discard your changes?", "They haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: repeat },
    ]),
  );
  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

  if (!d.editable || !d.save)
    return <Empty icon="lock" title="Read only" body="You can view this document, but not change it." />;

  const save = async () => {
    setSaving(true);
    try {
      await d.save!(text);
      setSaved(true);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.code.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen
        options={{
          title: "Edit code",
          headerRight: () => (
            <Button
              title="Save"
              variant="primary"
              disabled={!dirty || errors > 0 || text !== checked}
              loading={saving}
              onPress={() => void save()}
              style={{ minHeight: 34, paddingHorizontal: 14 }}
            />
          ),
        }}
      />
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textAlignVertical="top"
        selectionColor={palette.accent}
        style={{ flex: 1, padding: 14, fontFamily: mono, fontSize: 13, lineHeight: 19, color: palette.code.fg }}
        accessibilityLabel="Document source"
      />
      <View style={{ maxHeight: 220, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.bg }}>
        {analysis.diagnostics.length === 0 ? (
          <Txt size="sm" tone="ink3" style={{ padding: 12 }}>
            {dirty ? "No problems." : "No changes yet."}
          </Txt>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <Diagnostics diagnostics={analysis.diagnostics} />
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
