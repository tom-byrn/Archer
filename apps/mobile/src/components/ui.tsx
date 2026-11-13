/**
 * The app's controls, on the theme's tokens (`lib/tokens.ts`): the mobile
 * counterpart of the web's `components/ui.tsx`. Screens build from these
 * rather than styling raw views, so every surface, line and text color comes
 * from the palette and follows the theme.
 */

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { DISPLAY_FONT, RADIUS, TEXT, type TextSize } from "@/lib/tokens";
import { Icon, type IconName } from "./Icon";

type Tone = "ink" | "ink2" | "ink3" | "accent" | "danger" | "warn" | "accentInk";

export function Txt({
  size = "base",
  tone = "ink",
  weight,
  mono,
  display,
  style,
  ...rest
}: TextProps & {
  size?: TextSize;
  tone?: Tone;
  weight?: "400" | "500" | "600" | "700";
  mono?: boolean;
  /** The display serif (headings), as the web's `font-display`. */
  display?: boolean;
}) {
  const { palette, mono: monoFont } = useTheme();
  const color = palette[tone];
  return (
    <Text
      {...rest}
      style={[
        TEXT[size],
        { color },
        weight ? { fontWeight: weight } : null,
        mono ? { fontFamily: monoFont, fontSize: TEXT[size].fontSize - 1 } : null,
        display ? { fontFamily: DISPLAY_FONT, fontWeight: undefined } : null,
        style,
      ]}
    />
  );
}

/** A scrolling page on the app's background, clear of the home indicator. */
export function Screen({
  children,
  style,
  contentStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      {...rest}
      style={[{ flex: 1, backgroundColor: palette.bg }, style]}
      contentContainerStyle={[{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 20 }, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: RADIUS.xl,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A titled group of rows or content. */
export function Section({
  title,
  action,
  children,
  plain,
}: {
  title?: string;
  /** Shown at the right of the title (a small button). */
  action?: ReactNode;
  children: ReactNode;
  /** Content goes straight on the page rather than in a card. */
  plain?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {(title || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, minHeight: 20 }}>
          {title && (
            <Txt size="xs" tone="ink3" weight="600" style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {title}
            </Txt>
          )}
          {action}
        </View>
      )}
      {plain ? children : <Card>{children}</Card>}
    </View>
  );
}

/** One row of a list: an optional leading icon or element, a title and subtitle, an accessory. */
export function Row({
  icon,
  leading,
  title,
  subtitle,
  detail,
  right,
  onPress,
  onLongPress,
  chevron = onPress !== undefined,
  first,
  tone,
  numberOfLines = 1,
  indent = 0,
}: {
  icon?: IconName;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Short text at the right (a count, a time). */
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  /** No rule above it (the first row of a group). */
  first?: boolean;
  tone?: "danger" | "accent";
  numberOfLines?: number;
  indent?: number;
}) {
  const { palette } = useTheme();
  const color = tone ? palette[tone] : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? palette.surface2 : "transparent" })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingRight: 14,
          paddingLeft: 14 + indent * 14,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: palette.line,
          minHeight: 48,
        }}
      >
        {leading ?? (icon ? <Icon name={icon} size={18} color={tone ? color : palette.ink2} /> : null)}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === "string" ? (
            <Txt weight="500" numberOfLines={numberOfLines} style={{ color }}>
              {title}
            </Txt>
          ) : (
            title
          )}
          {typeof subtitle === "string" ? (
            <Txt size="sm" tone="ink3" numberOfLines={2}>
              {subtitle}
            </Txt>
          ) : (
            subtitle
          )}
        </View>
        {detail !== undefined && (
          <Txt size="sm" tone="ink3">
            {detail}
          </Txt>
        )}
        {right}
        {chevron && <Icon name="caret-right" size={14} color={palette.ink3} />}
      </View>
    </Pressable>
  );
}

export function Button({
  title,
  icon,
  leading,
  onPress,
  variant = "secondary",
  disabled,
  loading,
  style,
}: {
  title: string;
  icon?: IconName;
  leading?: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const fg =
    variant === "primary" ? palette.accentInk : variant === "danger" ? palette.danger : palette.ink;
  const bg =
    variant === "primary"
      ? palette.accent
      : variant === "danger"
        ? palette.dangerSoft
        : variant === "ghost"
          ? "transparent"
          : palette.surface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: RADIUS.lg,
          backgroundColor: bg,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.line2,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        (leading ?? (icon ? <Icon name={icon} size={17} color={fg} /> : null))
      )}
      <Txt weight="600" style={{ color: fg }}>
        {title}
      </Txt>
    </Pressable>
  );
}

/** A bare icon button, for headers. */
export function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: IconName;
  /** Accessibility label. */
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({ padding: 6, borderRadius: RADIUS.md, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} size={20} color={color ?? palette.ink} />
    </Pressable>
  );
}

/** A small tag: a type (`@postgres`), a format, a role. */
export function Chip({
  label,
  mono,
  tone = "neutral",
  icon,
}: {
  label: string;
  mono?: boolean;
  tone?: "neutral" | "accent" | "warn" | "danger";
  icon?: IconName;
}) {
  const { palette } = useTheme();
  const bg =
    tone === "accent"
      ? palette.accentSoft
      : tone === "warn"
        ? palette.warnSoft
        : tone === "danger"
          ? palette.dangerSoft
          : palette.surface2;
  const fg = tone === "accent" ? palette.accent : tone === "warn" ? palette.warn : tone === "danger" ? palette.danger : palette.ink2;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      {icon && <Icon name={icon} size={12} color={fg} />}
      <Txt size="xs" mono={mono} weight="500" style={{ color: fg }}>
        {label}
      </Txt>
    </View>
  );
}

/** Tabs as a segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: palette.surface2,
        borderRadius: RADIUS.lg,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 7,
              borderRadius: RADIUS.md,
              backgroundColor: on ? palette.surface : "transparent",
              borderWidth: on ? StyleSheet.hairlineWidth : 0,
              borderColor: palette.line2,
            }}
          >
            <Txt size="sm" weight={on ? "600" : "500"} tone={on ? "ink" : "ink2"}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Input({ style, mono, ...rest }: TextInputProps & { mono?: boolean }) {
  const { palette, mono: monoFont } = useTheme();
  return (
    <TextInput
      placeholderTextColor={palette.ink3}
      selectionColor={palette.accent}
      {...rest}
      style={[
        TEXT.base,
        {
          color: palette.ink,
          backgroundColor: palette.surface,
          borderColor: palette.line2,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: RADIUS.lg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 44,
        },
        mono ? { fontFamily: monoFont, fontSize: 13 } : null,
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

/** A centered message: loading, nothing here yet, or something went wrong. */
export function Empty({
  icon,
  title,
  body,
  action,
  loading,
}: {
  icon?: IconName;
  title?: string;
  body?: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10, backgroundColor: palette.bg }}>
      {loading ? (
        <ActivityIndicator color={palette.ink3} />
      ) : icon ? (
        <View style={{ padding: 12, borderRadius: RADIUS.xl, backgroundColor: palette.surface2 }}>
          <Icon name={icon} size={24} color={palette.ink2} />
        </View>
      ) : null}
      {title && (
        <Txt size="xl" display style={{ textAlign: "center" }}>
          {title}
        </Txt>
      )}
      {body && (
        <Txt tone="ink2" style={{ textAlign: "center", maxWidth: 320 }}>
          {body}
        </Txt>
      )}
      {action && <View style={{ paddingTop: 8 }}>{action}</View>}
    </View>
  );
}

/** A colored square behind an icon, like a component's tile on the canvas. */
export function Tile({ color, children, size = 32 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(color, 0.14),
      }}
    >
      {children}
    </View>
  );
}

/** `#rrggbb` at an opacity, as rgba(). */
export function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
