import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
  nextPromptPreference,
  type PromptEvent,
  type PromptPreference,
} from "./chat-push-state";
import { useChatActivity } from "./chat-activity";
import { chatPushSupported, useChatPush } from "./chat-push";
import { IconMessage } from "./icons";
import { useSession } from "./session";
import { Button, Copy, Muted, Sheet, haptic } from "./ui";
import { colors, fonts, radius } from "./theme";

function promptKey(userId: string) {
  return `arcenray.chat-push-prompt.${userId}`;
}

function isPromptPreference(value: string | null): value is PromptPreference {
  return (
    value === "unset" ||
    value === "dismissed" ||
    value === "enabled" ||
    value === "blocked"
  );
}

/**
 * Contextual one-time ask to turn on chat push. Two triggers, both gated on
 * the same conditions: four seconds after the account first becomes eligible
 * (post-onboarding launch), or the session's first unread message. It never
 * nags — a dismissal is remembered, an OS "don't ask again" is respected, and
 * the sheet appears at most once per session.
 */
export function ChatPushPrompt() {
  const { me } = useSession();
  const userId = me?.onboarding_completed ? me.id : null;
  // Remount per account: every latch below lasts one prompt session.
  return <PromptSession key={userId ?? "guest"} userId={userId} />;
}

function PromptSession({ userId }: { userId: string | null }) {
  const { unreadCount } = useChatActivity();
  const { mode, busy, enable } = useChatPush();
  const [preference, setPreference] = useState<PromptPreference | null>(null);
  const [opened, setOpened] = useState(false);
  const [closed, setClosed] = useState(false);
  const [delayed, setDelayed] = useState(false);

  const preferenceRef = useRef<PromptPreference | null>(null);
  const modeRef = useRef(mode);
  const openedRef = useRef(false);
  const unreadArrived = useRef(false);
  const accepting = useRef(false);

  // Async continuations re-check the live state through these mirrors.
  useEffect(() => {
    modeRef.current = mode;
    preferenceRef.current = preference;
    openedRef.current = opened;
  }, [mode, opened, preference]);

  // The saved prompt preference loads once per account.
  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    void SecureStore.getItemAsync(promptKey(userId)).then(
      (saved) => {
        if (!active) return;
        const value = isPromptPreference(saved) ? saved : "unset";
        preferenceRef.current = value;
        setPreference(value);
      },
      () => {
        if (!active) return;
        preferenceRef.current = "unset";
        setPreference("unset");
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  // Trigger A: four seconds after the account first becomes eligible.
  useEffect(() => {
    if (!userId) return undefined;
    const timer = setTimeout(() => setDelayed(true), 4000);
    return () => clearTimeout(timer);
  }, [userId]);

  // Trigger B: the session's first unread message stays armed once seen.
  useEffect(() => {
    if (unreadCount > 0) unreadArrived.current = true;
  }, [unreadCount]);

  // Consider showing exactly once per session, behind an OS permission probe.
  useEffect(() => {
    const ready =
      chatPushSupported() &&
      userId !== null &&
      mode === "off" &&
      preference === "unset" &&
      !opened &&
      (delayed || unreadArrived.current);
    if (!ready) return undefined;
    let active = true;
    void Notifications.getPermissionsAsync().then(
      (permissions) => {
        if (
          !active ||
          openedRef.current ||
          modeRef.current !== "off" ||
          preferenceRef.current !== "unset" ||
          permissions.canAskAgain !== true
        )
          return;
        setOpened(true);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [delayed, mode, opened, preference, unreadCount, userId]);

  const persist = useCallback(
    (event: PromptEvent) => {
      if (!userId) return;
      const next = nextPromptPreference(
        preferenceRef.current ?? "unset",
        event,
      );
      preferenceRef.current = next;
      setPreference(next);
      void SecureStore.setItemAsync(promptKey(userId), next).catch(() => {});
    },
    [userId],
  );

  const dismiss = useCallback(() => {
    setClosed(true);
    persist("dismiss");
  }, [persist]);

  const turnOn = useCallback(() => {
    if (accepting.current) return;
    accepting.current = true;
    haptic("light");
    void enable().catch(() => {
      accepting.current = false;
    });
  }, [enable]);

  const openSystemSettings = useCallback(() => {
    setClosed(true);
    void Linking.openSettings().catch(() => {});
  }, []);

  // The push context reports the accept outcome through `mode`.
  useEffect(() => {
    if (!opened || closed) return;
    const pressed = accepting.current;
    accepting.current = false;
    if (mode === "on") {
      if (pressed) haptic("success");
      persist("accept-success");
    } else if (mode === "blocked") {
      persist("accept-blocked");
    }
  }, [closed, mode, opened, persist]);

  const blocked = opened && !closed && mode === "blocked";
  const failed = opened && !closed && (mode === "retry" || mode === "checking");
  const visible =
    opened && !closed && mode !== "on" && (preference === "unset" || blocked);

  if (!visible) return null;

  return (
    <Sheet visible={visible} onClose={dismiss} title="Message alerts">
      <View style={{ alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.pill,
            backgroundColor: colors.plum,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconMessage color={colors.orange} size={26} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.bone,
            fontFamily: fonts.extraBold,
            fontSize: 20,
            lineHeight: 24,
            textAlign: "center",
          }}
        >
          Never miss a message
        </Text>
      </View>
      <Copy style={{ textAlign: "center" }}>
        {blocked
          ? "Arcenray can’t show notifications right now. Enable them in Android settings to get message alerts."
          : "Get a private alert when collaborators message you — even when Arcenray is closed. You can change this anytime in Settings."}
      </Copy>
      {failed ? (
        <Muted style={{ textAlign: "center" }}>
          Couldn’t turn on alerts. Check your connection and try again.
        </Muted>
      ) : null}
      {blocked ? (
        <Button
          title="Open Android settings"
          block
          onPress={openSystemSettings}
          accessibilityLabel="Open Android settings"
        />
      ) : (
        <Button
          title="Turn on alerts"
          block
          busy={busy}
          onPress={turnOn}
          accessibilityLabel="Turn on message alerts"
        />
      )}
      <Button
        title="Not now"
        variant="ghost"
        block
        onPress={dismiss}
        accessibilityLabel="Skip message alerts for now"
      />
    </Sheet>
  );
}
