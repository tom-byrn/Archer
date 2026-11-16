/**
 * The web's site shell (`components/landing/SiteFrame.tsx`) on a phone: one
 * column ruled at the screen's edges, a 56px header with the Playfair
 * wordmark, a footer, and the diamond joints where the rules meet.
 */

import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DISPLAY } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import { Txt } from "./ui";

/** The wordmark: "Archer" in Playfair Display at 19px. */
export function Wordmark({ size = 19 }: { size?: number }) {
  const { palette } = useTheme();
  return <Txt style={[DISPLAY, { fontSize: size, lineHeight: size + 2, color: palette.ink }]}>Archer</Txt>;
}

/** The small diamonds where a horizontal rule meets the side rules (`.landing-joints`). */
export function Joints({ top, bg }: { top?: boolean; bg?: string }) {
  const { palette } = useTheme();
  const diamond = (side: "left" | "right") => (
    <View
      key={side}
      pointerEvents="none"
      style={{
        position: "absolute",
        [side]: -4.5,
        ...(top ? { top: -4.5 } : { bottom: -4.5 }),
        width: 8,
        height: 8,
        borderWidth: 1,
        borderColor: palette.line2,
        backgroundColor: bg ?? palette.bg,
        transform: [{ rotate: "45deg" }],
        zIndex: 1,
      }}
    />
  );
  return (
    <>
      {diamond("left")}
      {diamond("right")}
    </>
  );
}

/** A band of the page, ruled underneath, with joints at its corners. */
export function Band({ children, style, last, bg }: { children: ReactNode; style?: StyleProp<ViewStyle>; last?: boolean; bg?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[{ borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.line }, style]}>
      {children}
      {!last && <Joints bg={bg} />}
    </View>
  );
}

/** The site header: 56px, ruled, the page color behind the status bar. */
export function SiteHeader({ children, bg }: { children: ReactNode; bg?: string }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: bg ?? palette.bg, zIndex: 2 }}>
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 20,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        {children}
        <Joints bg={bg} />
      </View>
    </View>
  );
}

/** A footer link: sm, ink-2 (the web's `siteNavLinkCls`). */
export function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      {({ pressed }) => (
        <Txt size="sm" tone={pressed ? "ink" : "ink2"}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/** The site footer: links, then © on the right. */
export function SiteFooter({ children, bg }: { children?: ReactNode; bg?: string }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
      <Joints top bg={bg} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 24, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 + insets.bottom }}>
        {children}
        <Txt size="sm" tone="ink3" style={{ marginLeft: "auto" }}>
          © 2026 Archer
        </Txt>
      </View>
    </View>
  );
}

/** The ruled column: side rules at the screen's edges. */
export function Frame({ children, bg }: { children: ReactNode; bg?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: bg ?? palette.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: palette.line }}>
      {children}
    </View>
  );
}
