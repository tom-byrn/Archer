/**
 * A bottom sheet of actions (share, delete…), the same on iOS and Android:
 * tap outside or Cancel to close.
 */

import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { Icon, type IconName } from "./Icon";
import { Txt } from "./ui";

export interface SheetAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

export function Sheet({
  visible,
  title,
  message,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: RADIUS.xl * 1.5,
          borderTopRightRadius: RADIUS.xl * 1.5,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          paddingHorizontal: 8,
        }}
      >
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line2, marginBottom: 8 }} />
        {(title || message) && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 2 }}>
            {title && (
              <Txt weight="600" numberOfLines={1}>
                {title}
              </Txt>
            )}
            {message && (
              <Txt size="sm" tone="ink3">
                {message}
              </Txt>
            )}
          </View>
        )}
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 12,
              paddingVertical: 14,
              borderRadius: RADIUS.lg,
              backgroundColor: pressed ? palette.surface2 : "transparent",
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: palette.line,
            })}
          >
            <Icon name={a.icon} color={a.destructive ? palette.danger : palette.ink2} />
            <Txt weight="500" tone={a.destructive ? "danger" : "ink"}>
              {a.label}
            </Txt>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: 6,
            alignItems: "center",
            paddingVertical: 14,
            borderRadius: RADIUS.lg,
            backgroundColor: pressed ? palette.surface3 : palette.surface2,
          })}
        >
          <Txt weight="600">Cancel</Txt>
        </Pressable>
      </View>
    </Modal>
  );
}
