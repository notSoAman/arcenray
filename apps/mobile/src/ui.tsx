import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, type Href } from "expo-router";
import { colors, styles } from "./theme";

export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 24 + insets.bottom },
      ]}
    >
      {children}
    </ScrollView>
  );
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Copy({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Muted({ children }: PropsWithChildren) {
  return <Text style={styles.muted}>{children}</Text>;
}
export function Panel({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        gap: 12,
        padding: 20,
        borderRadius: 24,
        backgroundColor: colors.graphite,
      }}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && {
          backgroundColor: colors.graphite,
          borderColor: colors.muted,
          borderWidth: 1,
        },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.buttonLabel, secondary && { color: colors.bone }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Nav({ title, href }: { title: string; href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" style={styles.button}>
        <Text style={styles.buttonLabel}>{title}</Text>
      </Pressable>
    </Link>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Muted>{label}</Muted>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          {
            color: colors.bone,
            backgroundColor: colors.graphite,
            borderRadius: 12,
            padding: 14,
            minHeight: 48,
            borderColor: colors.muted,
            borderWidth: 1,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({
  message,
  retry,
}: {
  message: string | null;
  retry?: () => void;
}) {
  return message ? (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="alert" style={styles.error}>
        {message}
      </Text>
      {retry ? <Button title="Retry" onPress={retry} /> : null}
    </View>
  ) : null;
}
export function Busy() {
  return <ActivityIndicator color={colors.bone} accessibilityLabel="Loading" />;
}

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
        /^(Choose |Select |Selected file |Image is |Not enough |Discard the |Use a public |Paste a supported)/.test(
          failure.message,
        )
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
