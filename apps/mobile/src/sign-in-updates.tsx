import { useState } from "react";
import { Text, View } from "react-native";
import * as Updates from "expo-updates";
import { Button } from "./ui";
import { colors, fonts, radius } from "./theme";

/** Signed-out users can diagnose delivery and apply a downloaded update too. */
export function SignInUpdates() {
  const { currentlyRunning, isUpdatePending, isChecking, isDownloading } =
    Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = ready || isUpdatePending;
  async function check() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (pending) {
        await Updates.reloadAsync();
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable || result.isRollBackToEmbedded) {
        await Updates.fetchUpdateAsync();
        setReady(true);
        setMessage("Your update is ready. Restart to use it.");
      } else setMessage("You're using the latest available update.");
    } catch {
      setMessage("Couldn't update. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        gap: 10,
        padding: 16,
        borderRadius: radius.cardSm,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Text
        style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.bone }}
      >
        App updates
      </Text>
      <Text
        style={{
          fontFamily: fonts.regular,
          fontSize: 13,
          lineHeight: 20,
          color: colors.muted,
        }}
      >
        {currentlyRunning.isEmbeddedLaunch
          ? "Store edition"
          : "Updated edition"}
        {currentlyRunning.createdAt
          ? ` · ${currentlyRunning.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : ""}
        {"\n"}
        {pending
          ? "A new update is ready to use."
          : isDownloading
            ? "Downloading improvements…"
            : "Email sign-in and keyboard improvements."}
      </Text>
      <Button
        title={pending ? "Restart to apply update" : "Check for updates"}
        variant="ghost"
        size="sm"
        busy={busy || isChecking || isDownloading}
        disabled={!Updates.isEnabled || busy || isChecking || isDownloading}
        onPress={() => void check()}
      />
      {message ? (
        <Text
          accessibilityRole="alert"
          style={{
            fontFamily: fonts.regular,
            fontSize: 13,
            lineHeight: 20,
            color: colors.textSoft,
          }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}
