/**
 * The app's controls: the web's `components/ui.tsx` primitives rebuilt for
 * React Native, at the same sizes, radii, borders and colors (tokens from
 * `lib/tokens.ts`), so every surface reads as the same product. Screens build
 * from these rather than styling raw views.
 */

import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DISPLAY, sans, type Weight } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import { RADIUS, SHADOW, TEXT, type Palette, type TextSize } from "@/lib/tokens";
import { Icon, type IconName } from "./Icon";

export const HAIR = StyleSheet.hairlineWidth;

/* --------------------------------------------------------------------- Text */

type Tone = "ink" | "ink2" | "ink3" | "accent" | "danger" | "warn";

/** Text in Inter at a token size; `display` is Playfair (`font-display`), `mono` the code face. */
export function Txt({
  size = "base",
  tone = "ink",
  weight = "400",
  mono,
  display,
  style,
  ...rest
}: TextProps & { size?: TextSize; tone?: Tone; weight?: Weight; mono?: boolean; display?: boolean }) {
  const { palette, mono: monoFont } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        TEXT[size],
        { color: palette[tone], fontFamily: sans(weight) },
        mono && { fontFamily: monoFont, fontWeight: weight === "400" ? undefined : (weight as TextStyle["fontWeight"]) },
        display && DISPLAY,
        style,
      ]}
    />
  );
}

/** `.eyebrow`: the section label (xs, semibold, ink-3, uppercase, tracked). */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt size="xs" tone="ink3" weight="600" style={[{ letterSpacing: 0.44, textTransform: "uppercase" }, style]}>
      {children}
    </Txt>
  );
}

/* ------------------------------------------------------------------ Buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { height: number; px: number; gap: number; text: TextSize }> = {
  sm: { height: 28, px: 10, gap: 6, text: "sm" },
  md: { height: 32, px: 12, gap: 8, text: "sm" },
  lg: { height: 40, px: 16, gap: 8, text: "lg" },
};

/** The web's Button: primary is ink on the page color, secondary a bordered surface. */
export function Button({
  title,
  icon,
  leading,
  trailing,
  onPress,
  variant = "secondary",
  size = "md",
  disabled,
  loading,
  style,
}: {
  title: string;
  icon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const s = SIZE[size];
  const fg = variant === "primary" ? palette.bg : variant === "danger" ? palette.danger : variant === "ghost" ? palette.ink2 : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={size === "lg" ? 0 : 6}
      style={({ pressed }) => [
        {
          height: s.height,
          paddingHorizontal: s.px,
          gap: s.gap,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: variant === "secondary" ? palette.line : variant === "danger" ? palette.danger : "transparent",
          backgroundColor:
            variant === "primary"
              ? palette.ink
              : variant === "secondary"
                ? pressed
                  ? palette.surface2
                  : palette.surface
                : pressed
                  ? variant === "danger"
                    ? palette.dangerSoft
                    : palette.surface2
                  : "transparent",
          opacity: disabled ? 0.4 : variant === "primary" && pressed ? 0.9 : 1,
        },
        (variant === "primary" || variant === "secondary") && SHADOW.sm,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} style={{ transform: [{ scale: 0.7 }] }} />
      ) : (
        (leading ?? (icon ? <Icon name={icon} size={14} color={fg} /> : null))
      )}
      {title !== "" && (
        <Txt size={s.text} weight="500" style={{ color: fg }} numberOfLines={1}>
          {title}
        </Txt>
      )}
      {trailing}
    </Pressable>
  );
}

/** Square icon-only button (32px, 24px small). Always pass `label`. */
export function IconButton({
  icon,
  label,
  onPress,
  size = "md",
  active,
  disabled,
  color,
  style,
  children,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  size?: "sm" | "md";
  active?: boolean;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { palette } = useTheme();
  const box = size === "sm" ? 24 : 32;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size === "sm" ? 10 : 6}
      style={({ pressed }) => [
        {
          width: box,
          height: box,
          borderRadius: RADIUS.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? palette.surface3 : pressed ? palette.surface2 : "transparent",
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {children ??
        (icon ? <Icon name={icon} size={size === "sm" ? 14 : 18} color={color ?? (active ? palette.ink : palette.ink2)} /> : null)}
    </Pressable>
  );
}

/* -------------------------------------------------------------------- Chips */

export type ChipTone = "neutral" | "accent" | "danger" | "warn";

/** The web's Chip: 20px tall, xs semibold, tinted by tone. */
export function Chip({
  label,
  tone = "neutral",
  mono,
  icon,
  style,
}: {
  label: string;
  tone?: ChipTone;
  mono?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const bg = { neutral: palette.surface2, accent: palette.accentSoft, danger: palette.dangerSoft, warn: palette.warnSoft }[tone];
  const fg = { neutral: palette.ink2, accent: palette.accent, danger: palette.danger, warn: palette.warn }[tone];
  return (
    <View
      style={[
        {
          height: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 6,
          borderRadius: RADIUS.sm,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      {icon}
      <Txt size="xs" weight="600" mono={mono} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------- Inputs */

const inputStyle = (palette: Palette, focused: boolean, invalid?: boolean): TextStyle => ({
  ...TEXT.base,
  fontFamily: sans("400"),
  color: palette.ink,
  backgroundColor: palette.surface,
  borderColor: invalid ? palette.danger : focused ? palette.ink3 : palette.line,
  borderWidth: 1,
  borderRadius: RADIUS.md,
  paddingHorizontal: 10,
});

/** The web's Input: 28px tall, bordered, the border darkening on focus. */
export function Input({ style, mono, invalid, onFocus, onBlur, ...rest }: TextInputProps & { mono?: boolean; invalid?: boolean }) {
  const { palette, mono: monoFont } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={palette.ink3}
      selectionColor={palette.accent}
      autoCorrect={false}
      spellCheck={false}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        inputStyle(palette, focused, invalid),
        { height: 30, paddingVertical: 0 },
        mono && { fontFamily: monoFont, fontSize: 12 },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

/** The web's TextArea: the Input's border, padded, growing with its text. */
export function TextArea({ style, mono, invalid, onFocus, onBlur, ...rest }: TextInputProps & { mono?: boolean; invalid?: boolean }) {
  const { palette, mono: monoFont } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={palette.ink3}
      selectionColor={palette.accent}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        inputStyle(palette, focused, invalid),
        { paddingVertical: 6, minHeight: 80, lineHeight: 18 },
        mono && { fontFamily: monoFont, fontSize: 12 },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

/* ----------------------------------------------------------------- Sections */

/** Panel section: an eyebrow header, an optional trailing action, a rule under it. */
export function Section({
  title,
  action,
  children,
  last,
  style,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** No rule under the last section. */
  last?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.line },
        style,
      ]}
    >
      {(title || action) && (
        <View style={{ height: 24, flexDirection: "row", alignItems: "center" }}>
          {title && <Eyebrow>{title}</Eyebrow>}
          {action && <View style={{ marginLeft: "auto" }}>{action}</View>}
        </View>
      )}
      <View style={{ paddingTop: title || action ? 4 : 0 }}>{children}</View>
    </View>
  );
}

/** A read-only property: an 88px label column (sm, ink-2), the value beside it (base, ink). */
export function ReadRow({ label, children, align = "start" }: { label: string; children: ReactNode; align?: "start" | "center" }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 4, alignItems: align === "center" ? "center" : "flex-start" }}>
      <Txt size="sm" tone="ink2" numberOfLines={1} style={{ width: 88, lineHeight: 20 }}>
        {label}
      </Txt>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === "string" ? <Txt>{children}</Txt> : children}
      </View>
    </View>
  );
}

/** The web's Segmented: a 28px track, the chosen option raised on a surface. Icon options show only the icon. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        height: 28,
        flexDirection: "row",
        alignSelf: "flex-start",
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.surface2,
        padding: 2,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[
              {
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
                ...(o.icon ? { width: 24 } : { paddingHorizontal: 10 }),
                backgroundColor: on ? palette.surface : "transparent",
              },
              on && SHADOW.sm,
            ]}
          >
            {o.icon ? (
              <Icon name={o.icon} size={14} color={on ? palette.ink : palette.ink2} />
            ) : (
              <Txt size="sm" weight="500" tone={on ? "ink" : "ink2"}>
                {o.label}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The web's switch (share dialog): accent when on. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      onPress={() => onChange(!on)}
      disabled={disabled}
      hitSlop={10}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: on ? palette.accent : palette.line2,
        backgroundColor: on ? palette.accent : palette.surface3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={[
          { position: "absolute", top: 2, left: on ? 17 : 2, width: 14, height: 14, borderRadius: 7, backgroundColor: palette.surface },
          SHADOW.sm,
        ]}
      />
    </Pressable>
  );
}

/** A 16px vertical rule between header controls. */
export function VRule({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  return <View style={[{ width: 1, height: 16, backgroundColor: palette.line }, style]} />;
}

/* --------------------------------------------------------------------- Menu */

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: IconName | ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A row with a control of its own (the theme switcher), used without closing the menu. */
export interface MenuControl {
  label: string;
  icon?: IconName | ReactNode;
  control: ReactNode;
}

export type MenuEntry = MenuItem | MenuControl | "separator";

/**
 * The web's dropdown Menu: a bordered card under its trigger, rows of icon,
 * label and hint, closing on a choice or a tap outside. `trigger` gets the
 * open state and a toggle.
 */
export function Menu({
  trigger,
  items,
  header,
  align = "end",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuEntry[];
  header?: ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const { palette } = useTheme();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { width: screenW } = useWindowDimensions();
  const close = useCallback(() => setAt(null), []);
  const toggle = useCallback(() => {
    if (at) return setAt(null);
    anchor.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }));
  }, [at]);
  const left = at ? Math.max(8, Math.min(align === "end" ? at.x + at.w - width : at.x, screenW - width - 8)) : 0;
  return (
    <>
      <View ref={anchor} collapsable={false}>
        {trigger({ open: at !== null, toggle })}
      </View>
      <Modal visible={at !== null} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
        {at && (
          <View
            accessibilityRole="menu"
            style={[
              {
                position: "absolute",
                top: at.y + at.h + 4,
                left,
                width,
                padding: 4,
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor: palette.line,
                backgroundColor: palette.surface,
              },
              SHADOW.md,
            ]}
          >
            {header && (
              <>
                {header}
                <View style={{ height: 1, backgroundColor: palette.line, marginVertical: 4 }} />
              </>
            )}
            <MenuRows items={items} onClose={close} />
          </View>
        )}
      </Modal>
    </>
  );
}

function MenuIcon({ icon, color }: { icon: IconName | ReactNode; color: string }) {
  return (
    <View style={{ width: 16, alignItems: "center" }}>
      {typeof icon === "string" ? <Icon name={icon as IconName} size={14} color={color} /> : icon}
    </View>
  );
}

function MenuRows({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  const { palette } = useTheme();
  return (
    <>
      {items.map((item, i) =>
        item === "separator" ? (
          <View key={i} style={{ height: 1, backgroundColor: palette.line, marginVertical: 4 }} />
        ) : "control" in item ? (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
            {item.icon && <MenuIcon icon={item.icon} color={palette.ink2} />}
            <Txt size="sm" style={{ flex: 1 }} numberOfLines={1}>
              {item.label}
            </Txt>
            {item.control}
          </View>
        ) : (
          <Pressable
            key={i}
            accessibilityRole="menuitem"
            disabled={item.disabled}
            onPress={() => {
              onClose();
              item.onSelect();
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: RADIUS.md,
              backgroundColor: pressed ? (item.danger ? palette.dangerSoft : palette.surface2) : "transparent",
              opacity: item.disabled ? 0.4 : 1,
            })}
          >
            {item.icon && <MenuIcon icon={item.icon} color={item.danger ? palette.danger : palette.ink2} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size="sm" tone={item.danger ? "danger" : "ink"} numberOfLines={1}>
                {item.label}
              </Txt>
              {item.hint && (
                <Txt size="xs" tone="ink3" numberOfLines={1}>
                  {item.hint}
                </Txt>
              )}
            </View>
          </Pressable>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------- Dialog */

/** The web's Dialog: a centered card on a dimmed page, titled, with a close button. */
export function Dialog({
  open,
  onClose,
  title,
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: palette.scrim }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          accessibilityViewIsModal
          style={[
            {
              width,
              maxWidth: "100%",
              maxHeight: "90%",
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.surface,
              overflow: "hidden",
            },
            SHADOW.md,
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 16,
              paddingRight: 10,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
            }}
          >
            <Txt size="lg" weight="600" style={{ flex: 1 }} accessibilityRole="header">
              {title}
            </Txt>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A dialog's buttons, at its right. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 12 }}>{children}</View>;
}

/* -------------------------------------------------------------- Bottom panel */

/**
 * The web's SidePanel as a phone shows it: a sheet over the canvas, rounded
 * on top, with a grabber. 55% of the screen, or 70% when `tall`.
 */
export function BottomPanel({ tall, children }: { tall?: boolean; children: ReactNode }) {
  const { palette } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * (tall ? 0.7 : 0.55)),
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          borderTopWidth: 1,
          borderLeftWidth: HAIR,
          borderRightWidth: HAIR,
          borderColor: palette.line,
          backgroundColor: palette.surface,
          paddingBottom: insets.bottom,
          overflow: "hidden",
        },
        SHADOW.md,
      ]}
    >
      <View style={{ alignSelf: "center", width: 32, height: 4, borderRadius: 2, backgroundColor: palette.line2, marginTop: 6 }} />
      {children}
    </View>
  );
}

/* ------------------------------------------------------------- Odds and ends */

/** The account avatar: the photo, or initials on surface-2 (the web's AccountMenu trigger). */
export function Avatar({ image, name, size = 28 }: { image?: string | null; name?: string | null; size?: number }) {
  const { palette } = useTheme();
  const src = (name ?? "").trim();
  const parts = src.split(/\s+/);
  const initials = src === "" ? "?" : (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : src.slice(0, 2)).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.surface2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size }} />
      ) : (
        <Txt size="xs" weight="600" tone="ink2">
          {initials}
        </Txt>
      )}
    </View>
  );
}

/** Loading: the page color with a quiet spinner. */
export function Loading() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.bg }} accessibilityLabel="Loading">
      <ActivityIndicator color={palette.ink3} />
    </View>
  );
}

/** A page-level message ("Document not found"): the display serif, a line of ink-3, an action. */
export function Message({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: palette.bg }}>
      <Txt size="xl" display style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {body && (
        <Txt size="sm" tone="ink3" style={{ textAlign: "center", paddingTop: 4, maxWidth: 320 }}>
          {body}
        </Txt>
      )}
      {action && <View style={{ paddingTop: 16 }}>{action}</View>}
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
