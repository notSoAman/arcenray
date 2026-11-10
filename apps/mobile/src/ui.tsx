import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, type Href } from "expo-router";
import {
  invalidVideoTracksMessage,
  multipleAudioTracksMessage,
} from "@repo/shared/media-preflight";
import { colors, fonts, radius, typography } from "./theme";

/* ---------------------------------------------------------------- layout */

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  const pad = { padding: 20, paddingBottom: 120 + insets.bottom, gap: 20 };
  if (!scroll)
    return (
      <View style={[{ flex: 1, backgroundColor: colors.void }, pad, contentStyle]}>
        {children}
      </View>
    );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.void }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[pad, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/* -------------------------------------------------------------- typography */

export function Kicker({
  children,
  color = colors.faint,
  style,
}: PropsWithChildren<{ color?: string; style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[typography.kicker, { color }, style]}>{children}</Text>
  );
}

export function PageTitle({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text
      accessibilityRole="header"
      style={[typography.display, { fontSize: 34, color: colors.text }, style]}
    >
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={[typography.sectionTitle, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Copy({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[typography.body, { color: colors.textSoft }, style]}>{children}</Text>
  );
}

export function Muted({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[typography.muted, { color: colors.muted }, style]}>{children}</Text>
  );
}

export function Faint({ children }: PropsWithChildren) {
  return (
    <Text style={[typography.muted, { color: colors.faint }]}>{children}</Text>
  );
}

/* ----------------------------------------------------------------- panels */

export function Panel({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        gap: 12,
        padding: 20,
        borderRadius: radius.card,
        backgroundColor: colors.graphite,
      }}
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
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        borderRadius: radius.card,
        backgroundColor: colors.plum,
        padding: 24,
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.extraBold,
          fontSize: 24,
          letterSpacing: -0.48,
          color: colors.text,
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text style={[typography.bodySoft, { color: colors.textSoft }]}>{body}</Text>
      ) : null}
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonVariant =
  | "primary"
  | "accent"
  | "ghost"
  | "filmPlay"
  | "filmDetails";

const filmGradient: readonly [string, string, string] = [
  colors.filmPlayStart,
  colors.filmPlayMid,
  colors.filmPlayEnd,
];

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  block = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  block?: boolean;
  icon?: ReactNode;
}) {
  const off = disabled || busy;
  const fill =
    variant === "primary"
      ? colors.bone
      : variant === "accent"
        ? colors.ember
        : variant === "filmDetails"
          ? "#FFFFFF"
          : "transparent";
  const textColor =
    variant === "primary" || variant === "filmDetails" ? colors.void : "#FFFFFF";
  const label = busy ? "Please wait…" : title;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === "primary" || variant === "filmDetails" ? colors.void : colors.bone}
          accessibilityLabel="Loading"
        />
      ) : (
        icon
      )}
      <Text
        style={{
          color: textColor,
          fontFamily: fonts.semibold,
          fontSize: 16,
        }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: 26,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: block ? "stretch" : "flex-start",
        },
        variant === "ghost" && {
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: "transparent",
        },
        variant !== "filmPlay" && variant !== "ghost" && { backgroundColor: fill },
        off && { opacity: 0.5 },
        pressed && !off && { opacity: 0.85 },
      ]}
    >
      {variant === "filmPlay" ? (
        <LinearGradient
          colors={filmGradient}
          locations={[0, 0.48, 1]}
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
      {content}
    </Pressable>
  );
}

/** Pill toggle (filters, tabs, sort). */
export function Pill({
  label,
  on,
  onPress,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: on ? colors.bone : colors.lineStrong,
        backgroundColor: on ? colors.bone : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
  return (
    <View style={{ gap: 8 }}>
      <Text style={[typography.bodySoft, { color: colors.textSoft, fontFamily: fonts.semibold }]}>
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        style={[
          {
            color: colors.text,
            backgroundColor: colors.graphite,
            borderRadius: radius.input,
            paddingHorizontal: 18,
            paddingVertical: 14,
            minHeight: 52,
            borderWidth: 1,
            borderColor: error ? colors.pink : colors.line,
            fontSize: 16,
            fontFamily: fonts.regular,
          },
          props.multiline && { minHeight: 112, textAlignVertical: "top" },
          style,
        ]}
      />
      {hint ? <Text style={[typography.muted, { color: colors.faint }]}>{hint}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={[typography.muted, { color: colors.pink }]}>
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
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (option: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }} accessibilityLabel={label}>
      <Text style={[typography.bodySoft, { color: colors.textSoft, fontFamily: fonts.semibold }]}>
        {label}
      </Text>
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
        style={{ flex: 1, color: colors.textSoft, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular }}
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

export function Busy() {
  return (
    <View style={{ alignItems: "center", padding: 24 }}>
      <ActivityIndicator color={colors.bone} accessibilityLabel="Loading" />
    </View>
  );
}

/** Frosted-glass surface (tab bar, player chrome) — approximated without blur. */
export function Glass({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        {
          backgroundColor: "rgba(26, 26, 27, 0.86)",
          borderWidth: 1,
          borderColor: "rgba(243, 239, 233, 0.12)",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------ navigation */

export function Nav({ title, href }: { title: string; href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        style={{
          minHeight: 52,
          paddingHorizontal: 26,
          borderRadius: radius.pill,
          backgroundColor: colors.bone,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: colors.void, fontFamily: fonts.semibold, fontSize: 16 }}>
          {title}
        </Text>
      </Pressable>
    </Link>
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
