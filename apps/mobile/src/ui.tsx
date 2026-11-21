import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useKeyboardFormFocus } from "./keyboard-form";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import {
  invalidVideoTracksMessage,
  multipleAudioTracksMessage,
} from "@repo/shared/media-preflight";
import {
  colors,
  displayTitle,
  fonts,
  gradients,
  radius,
  sectionTitleStyle,
  shadow,
  typography,
} from "./theme";

/* ------------------------------------------------------------------ haptics */

export function haptic(
  kind: "light" | "medium" | "success" | "warning" = "light",
) {
  const map = {
    light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    success: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    warning: () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  } as const;
  void map[kind]().catch(() => {});
}

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  scroll = true,
  contentStyle,
  refreshControl,
  padded = true,
  topInset = false,
}: PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  padded?: boolean;
  topInset?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingHorizontal: padded ? 20 : 0,
    paddingTop: topInset ? insets.top + 12 : 16,
    paddingBottom: 124 + insets.bottom,
    gap: 26,
  };
  if (!scroll)
    return (
      <View
        style={[{ flex: 1, backgroundColor: colors.void }, pad, contentStyle]}
      >
        {children}
      </View>
    );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.void }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={[pad, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Full-screen scaffold for pushed screens. The web has a quiet header with a
 * single back affordance; native stack headers cannot carry the brand type, so
 * screens render this instead (`headerShown: false` in the root layout).
 */
export function DetailScreen({
  title,
  kicker,
  right,
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{
  title?: string;
  kicker?: string;
  right?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  const insets = useSafeAreaInsets();
  const body = <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.void }}>
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingHorizontal: 12,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: colors.void,
        }}
      >
        <IconButton
          label="Back"
          icon={
            <Text
              style={{
                color: colors.bone,
                fontSize: 28,
                lineHeight: 30,
                marginTop: -2,
              }}
            >
              ‹
            </Text>
          }
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/home")
          }
          size={44}
          glass={false}
        />
        <View style={{ flex: 1, gap: 1 }}>
          {kicker ? <Kicker color={colors.orange}>{kicker}</Kicker> : null}
          {title ? (
            <Text
              numberOfLines={1}
              style={[sectionTitleStyle(18), { color: colors.text }]}
            >
              {title}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              paddingHorizontal: 20,
              paddingTop: 6,
              paddingBottom: 56 + insets.bottom,
              gap: 26,
            },
            contentStyle,
          ]}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 0 }}>{body}</View>
      )}
    </View>
  );
}

/* -------------------------------------------------------------- typography */

export function Kicker({
  children,
  color = colors.faint,
  style,
}: PropsWithChildren<{ color?: string; style?: StyleProp<TextStyle> }>) {
  return <Text style={[typography.kicker, { color }, style]}>{children}</Text>;
}

export function PageTitle({
  children,
  style,
  size = 38,
}: PropsWithChildren<{ style?: StyleProp<TextStyle>; size?: number }>) {
  return (
    <Text accessibilityRole="header" style={[displayTitle(size), style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({
  children,
  style,
  size = 26,
}: PropsWithChildren<{ style?: StyleProp<TextStyle>; size?: number }>) {
  return (
    <Text accessibilityRole="header" style={[sectionTitleStyle(size), style]}>
      {children}
    </Text>
  );
}

export function Copy({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[typography.body, { color: colors.textSoft }, style]}>
      {children}
    </Text>
  );
}

export function Muted({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[typography.muted, { color: colors.muted }, style]}>
      {children}
    </Text>
  );
}

export function Faint({ children }: PropsWithChildren) {
  return (
    <Text style={[typography.muted, { color: colors.faint }]}>{children}</Text>
  );
}

/* ----------------------------------------------------------------- panels */

export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        {
          gap: 12,
          padding: 20,
          borderRadius: radius.card,
          backgroundColor: colors.graphite,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Empty / error panel (state-panel in globals.css). */
export function StatePanel({
  title,
  body,
  children,
  error = false,
  art,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  error?: boolean;
  art?: ReactNode;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        borderRadius: radius.card,
        backgroundColor: colors.plum,
        padding: 26,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {art ? (
        <View style={{ width: "100%", borderRadius: 18, overflow: "hidden" }}>
          {art}
        </View>
      ) : null}
      <Text style={sectionTitleStyle(24)}>{title}</Text>
      {body ? (
        <Text style={[typography.bodySoft, { color: colors.textSoft }]}>
          {body}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonVariant =
  "primary" | "accent" | "ghost" | "filmPlay" | "filmDetails" | "quiet";
type ButtonSize = "lg" | "md" | "sm";

const heights: Record<ButtonSize, number> = { lg: 52, md: 46, sm: 38 };

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  block = false,
  icon,
  iconRight,
  size = "lg",
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  block?: boolean;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  accessibilityLabel?: string;
}) {
  const off = disabled || busy;
  const fill =
    variant === "primary"
      ? colors.bone
      : variant === "accent"
        ? colors.ember
        : variant === "filmDetails"
          ? colors.white
          : "transparent";
  const textColor =
    variant === "primary" || variant === "filmDetails" || variant === "quiet"
      ? colors.void
      : colors.white;
  const label = busy ? "Please wait…" : title;
  const height = heights[size];
  const iconColor = textColor;

  async function press() {
    if (off) return;
    haptic(variant === "accent" ? "medium" : "light");
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => void press()}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: block ? 20 : size === "sm" ? 16 : 24,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: block ? "stretch" : "flex-start",
          flexDirection: "row",
          gap: 9,
          overflow: "hidden",
        },
        variant === "ghost" && {
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: "rgba(243,239,233,0.02)",
        },
        variant === "quiet" && {
          backgroundColor: "transparent",
          paddingHorizontal: 4,
        },
        variant !== "filmPlay" &&
          variant !== "ghost" &&
          variant !== "quiet" && {
            backgroundColor: fill,
          },
        pressed && !off && { opacity: 0.82, transform: [{ scale: 0.985 }] },
        off && { opacity: 0.45 },
      ]}
    >
      {variant === "filmPlay" ? (
        <LinearGradient
          colors={gradients.filmPlay}
          locations={gradients.filmPlayLocations}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: radius.pill,
          }}
        />
      ) : null}
      {busy ? (
        <ActivityIndicator color={iconColor} accessibilityLabel="Loading" />
      ) : (
        icon
      )}
      <Text
        style={{
          color: textColor,
          fontFamily: fonts.bold,
          fontSize: size === "sm" ? 14 : 16,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      {!busy ? iconRight : null}
    </Pressable>
  );
}

/** Circular glass button for player chrome and headers. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  glass = true,
  disabled = false,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  size?: number;
  glass?: boolean;
  disabled?: boolean;
  tone?: "default" | "filled" | "bare";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          minWidth: 44,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            tone === "filled"
              ? colors.bone
              : tone === "bare" || !glass
                ? "transparent"
                : "rgba(26,26,27,0.62)",
          borderWidth: tone === "bare" || !glass || tone === "filled" ? 0 : 1,
          borderColor: "rgba(243,239,233,0.14)",
          overflow: "hidden",
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
        disabled && { opacity: 0.4 },
      ]}
    >
      {tone === "default" && glass ? (
        <BlurView
          tint="dark"
          intensity={26}
          blurMethod="none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      ) : null}
      {icon}
    </Pressable>
  );
}

/** Pill toggle (filters, tabs, sort). */
export function Pill({
  label,
  on,
  onPress,
  disabled = false,
  icon,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: on ? colors.bone : "rgba(243,239,233,0.18)",
        backgroundColor: on ? colors.bone : "rgba(243,239,233,0.02)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        opacity: pressed ? 0.8 : disabled ? 0.4 : 1,
      })}
    >
      {icon}
      <Text
        style={{
          color: on ? colors.void : colors.bone,
          fontFamily: fonts.semibold,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Quiet metadata tag (facts, moods, skills). */
export function Tag({
  label,
  tone = "default",
  icon,
}: {
  label: string;
  tone?: "default" | "place" | "mood";
  icon?: ReactNode;
}) {
  return (
    <View
      style={{
        minHeight: 31,
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: radius.tag,
        borderWidth: 1,
        borderColor:
          tone === "place"
            ? "rgba(232,82,122,0.4)"
            : tone === "mood"
              ? "rgba(198,215,155,0.3)"
              : "rgba(243,239,233,0.14)",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
      }}
    >
      {icon}
      <Text
        style={{
          color:
            tone === "place"
              ? colors.pink
              : tone === "mood"
                ? colors.lime
                : colors.chead,
          fontFamily: fonts.regular,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Underline scope tabs (web search + profile sections). */
export function ScopeTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(243,239,233,0.08)",
      }}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const on = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic();
              onChange(item.key);
            }}
            style={{
              minHeight: 46,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderBottomWidth: 2,
              borderBottomColor: on ? colors.ember : "transparent",
              marginBottom: -1,
            }}
          >
            <Text
              style={{
                color: on ? colors.bone : colors.muted,
                fontFamily: fonts.bold,
                fontSize: 15,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({
  label,
  hint,
  error,
  style,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const revealInput = useKeyboardFormFocus();
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={[
          typography.bodySoft,
          { color: colors.textSoft, fontFamily: fonts.semibold },
        ]}
      >
        {label}
      </Text>
      <TextInput
        {...props}
        ref={input}
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
          revealInput(input.current);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            color: colors.text,
            backgroundColor: colors.graphite,
            borderRadius: radius.input,
            paddingHorizontal: 18,
            paddingVertical: 14,
            minHeight: 52,
            borderWidth: 1,
            borderColor: error
              ? colors.pink
              : focused
                ? colors.pink
                : colors.line,
            fontSize: 16,
            fontFamily: fonts.regular,
          },
          props.multiline && {
            minHeight: 112,
            textAlignVertical: "top",
            lineHeight: 22,
          },
          style,
        ]}
      />
      {hint ? (
        <Text style={[typography.muted, { color: colors.faint }]}>{hint}</Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.muted, { color: colors.pink }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Multi-select chips (roles, genres, languages). */
export function Chips({
  label,
  options,
  selected,
  onToggle,
  disabled = false,
  kicker = false,
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (option: string) => void;
  disabled?: boolean;
  kicker?: boolean;
}) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel={label}>
      {kicker ? (
        <Kicker>{label}</Kicker>
      ) : (
        <Text
          style={[
            typography.bodySoft,
            { color: colors.textSoft, fontFamily: fonts.semibold },
          ]}
        >
          {label}
        </Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <Pill
              key={option}
              label={option}
              on={on}
              disabled={disabled}
              onPress={() => onToggle(option)}
            />
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ status */

export function Notice({
  message,
  retry,
  tone = "error",
}: {
  message: string | null;
  retry?: () => void;
  tone?: "error" | "success";
}) {
  if (!message) return null;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
          padding: 14,
          borderRadius: radius.input,
          backgroundColor: colors.graphite,
          borderWidth: 1,
          borderColor: colors.line,
        },
        tone === "error" && {
          borderColor: "rgba(232, 82, 122, 0.5)",
          backgroundColor: "rgba(194, 35, 75, 0.12)",
        },
        tone === "success" && {
          borderColor: "rgba(198, 215, 155, 0.45)",
          backgroundColor: "rgba(198, 215, 155, 0.08)",
        },
      ]}
    >
      <Text
        accessibilityRole="alert"
        style={{
          flex: 1,
          color: colors.textSoft,
          fontSize: 14,
          lineHeight: 21,
          fontFamily: fonts.regular,
        }}
      >
        {message}
      </Text>
      {retry ? (
        <Pressable accessibilityRole="button" onPress={retry} hitSlop={8}>
          <Text
            style={{
              color: colors.bone,
              fontFamily: fonts.bold,
              fontSize: 14,
              textDecorationLine: "underline",
            }}
          >
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Busy({ label }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 42, gap: 12 }}>
      <ActivityIndicator
        color={colors.bone}
        accessibilityLabel={label ?? "Loading"}
      />
      {label ? (
        <Text style={[typography.muted, { color: colors.faint }]}>{label}</Text>
      ) : null}
    </View>
  );
}

/** Frosted-glass surface (tab bar, player chrome) using the real blur on Android. */
export function Glass({
  children,
  style,
  intensity = 34,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; intensity?: number }>) {
  return (
    <View style={[{ overflow: "hidden" }, style]}>
      <BlurView
        tint="dark"
        intensity={intensity}
        blurMethod="none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: "rgba(26,26,27,0.55)",
        }}
      />
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

/** Shimmering placeholder block. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { backgroundColor: colors.graphite, borderRadius: 14, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Bottom sheet used for report / quiet secondary actions. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
        />
        <BlurView
          tint="dark"
          intensity={50}
          blurMethod="none"
          style={{
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: "hidden",
            backgroundColor: "rgba(20,20,21,0.92)",
            borderTopWidth: 1,
            borderColor: "rgba(243,239,233,0.12)",
          }}
        >
          <View
            style={{ padding: 22, paddingBottom: 22 + insets.bottom, gap: 16 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <SectionTitle size={22} style={{ flex: 1 }}>
                {title}
              </SectionTitle>
              <IconButton
                label="Close"
                onPress={onClose}
                icon={
                  <Text style={{ color: colors.bone, fontSize: 20 }}>✕</Text>
                }
              />
            </View>
            {children}
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------ navigation */

export function Nav({ title, href }: { title: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 26,
        borderRadius: radius.pill,
        backgroundColor: colors.bone,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{ color: colors.void, fontFamily: fonts.bold, fontSize: 16 }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------- data hooks */

/** Async results are ignored after unmount/account changes. Callers memoize loaders. */
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active)
          setState((current) => ({ ...current, error: null, loading: true }));
        return load();
      })
      .then(
        (data) => {
          if (active) setState({ data, error: null, loading: false });
        },
        () => {
          if (active)
            setState({
              data: null,
              error: "Could not load this. Check your connection and retry.",
              loading: false,
            });
        },
      );
    return () => {
      active = false;
    };
  }, [load, version]);
  return {
    ...state,
    reload: () => {
      setState((current) => ({ ...current, error: null, loading: true }));
      setVersion((n) => n + 1);
    },
  };
}

export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      const localMessage =
        failure instanceof Error &&
        (/^(Choose |Select |Selected file |Image is |Not enough |Discard the |Use a public |Paste a supported)/.test(
          failure.message,
        ) ||
          failure.message === multipleAudioTracksMessage ||
          failure.message === invalidVideoTracksMessage)
          ? failure.message
          : null;
      setError(
        localMessage ??
          "That could not finish. Your changes are still here; check your fields and connection, then retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
