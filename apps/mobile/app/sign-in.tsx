import { useAuth, useClerk } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { config } from "../src/config";
import { colors, styles } from "../src/theme";

function SignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { startHostedAuth } = useHostedAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(mode: "sign-in" | "sign-up" = "sign-in") {
    setError(null);
    setBusy(true);
    try {
      if (isSignedIn) await signOut();
      else await startHostedAuth({ mode });
    } catch {
      setError(
        "Sign-in could not finish. Please retry. Native sign-in must be configured for this Android app in Clerk.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <Text accessibilityRole="header" style={styles.title}>
        {isSignedIn ? "You’re signed in" : "Find your people"}
      </Text>
      <Text style={styles.body}>
        {isSignedIn
          ? "Your session is active. Return to your profile to continue."
          : "Continue with the sign-in options enabled for Arcenray. Authentication opens securely in your browser and returns to this app."}
      </Text>
      {!isLoaded ? (
        <ActivityIndicator
          color={colors.bone}
          accessibilityLabel="Loading account"
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          accessibilityState={{ disabled: busy, busy }}
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={() => act()}
        >
          <Text style={styles.buttonLabel}>
            {busy ? "Please wait…" : isSignedIn ? "Sign out" : "Sign in"}
          </Text>
        </Pressable>
      )}
      {isLoaded && !isSignedIn ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => act("sign-up")}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Create an account</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function AccountScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {config.clerkKey ? (
        <SignIn />
      ) : (
        <View style={{ gap: 20 }}>
          <Text accessibilityRole="header" style={styles.title}>
            Sign in
          </Text>
          <Text style={styles.body}>
            Sign-in needs an Arcenray publishable Clerk key and native callback
            setup. See apps/mobile/README.md. You can browse public films
            without signing in.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
