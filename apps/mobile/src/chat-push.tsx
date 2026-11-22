import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Linking, Platform, Switch, Text, View } from "react-native";
import { useClerk } from "@clerk/expo";
import { router, usePathname, useRootNavigationState } from "expo-router";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
  handleChatNotificationWithApi,
  isChatNotificationAction,
  prepareChatNotifications,
} from "./chat-notification-runtime";
import { chatPushConversation } from "./chat-push-state";
import { useSession, type Api } from "./session";
import { Button, Copy, Muted, SectionTitle } from "./ui";
import { colors, fonts, radius } from "./theme";

const installationKey = "arcenray.chat-push-installation";
const channelId = "chat-messages";
const supported =
  Platform.OS === "android" &&
  Constants.expoConfig?.extra?.chatPushEnabled === true;
let installationWork = Promise.resolve();
const projectId =
  Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

if (supported) {
  // Foreground alerts already come from the authenticated chat inbox.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

type Mode =
  "checking" | "off" | "on" | "blocked" | "unavailable" | "retry" | "revoking";
type ChatPush = {
  mode: Mode;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};
const noop = async () => {};
const Context = createContext<ChatPush>({
  mode: "unavailable",
  busy: false,
  enable: noop,
  disable: noop,
});

function preferenceKey(profile: string) {
  return `arcenray.chat-push.${profile}`;
}

async function setRegistration(
  api: Api,
  installation: string,
  token: string | null,
) {
  const { data, error } = await api.supabase.functions.invoke<{ ok: boolean }>(
    "chat-push-device",
    {
      body: { installation, token },
      signal: AbortSignal.timeout(7000),
    },
  );
  if (error || !data?.ok) throw new Error("Chat notifications unavailable.");
}

async function chatToken() {
  if (typeof projectId !== "string")
    throw new Error("Push project unavailable");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data } = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Push registration timed out")),
          8000,
        );
      }),
    ]);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function dismissChatNotifications() {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter(
        (notification) =>
          notification.request.content.data?.kind === "chat_message",
      )
      .map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
  );
  await Notifications.clearLastNotificationResponseAsync();
}

function NotificationNavigation() {
  const { api, me, pending } = useSession();
  const root = useRootNavigationState()?.key;
  const pathname = usePathname();
  const response = Notifications.useLastNotificationResponse();
  const seen = useRef("");
  useEffect(() => {
    if (pending || !response) return;
    const request = response.notification.request;
    const seenKey = `${request.identifier}:${response.actionIdentifier}:${
      response.userText ?? ""
    }`;
    if (seen.current === seenKey) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      if (
        !api ||
        !me ||
        !isChatNotificationAction(response.actionIdentifier) ||
        AppState.currentState !== "active"
      )
        return;
      seen.current = seenKey;
      const conversation = chatPushConversation(
        request.content.data ?? {},
        me.id,
      );
      void handleChatNotificationWithApi(api, me.id, response)
        .then((completed) => {
          if (
            !completed &&
            conversation &&
            pathname !== `/chat/${conversation}`
          )
            router.push({
              pathname: "/chat/[id]",
              params: { id: conversation },
            });
        })
        .finally(() =>
          Notifications.clearLastNotificationResponseAsync().catch(() => {}),
        );
      return;
    }
    if (!root) return;
    if (
      request.content.data?.kind !== "chat_message" ||
      seen.current === seenKey
    )
      return;
    seen.current = seenKey;
    const id = chatPushConversation(request.content.data, me?.id ?? null);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (id && pathname !== `/chat/${id}`)
      router.push({ pathname: "/chat/[id]", params: { id } });
  }, [api, me, pathname, pending, response, root]);
  return null;
}

export function ChatPushProvider({ children }: PropsWithChildren) {
  const { api, me } = useSession();
  const userId = me?.onboarding_completed ? me.id : null;
  const [mode, setMode] = useState<Mode>(
    supported ? "checking" : "unavailable",
  );
  const [busy, setBusy] = useState(false);
  const lastRegistration = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const updateMode = useCallback((value: Mode) => {
    if (mounted.current) setMode(value);
  }, []);
  const run = useCallback((action: () => Promise<void>) => {
    const task = installationWork.then(action);
    installationWork = task.catch(() => {});
    return task;
  }, []);

  const revoke = useCallback(async () => {
    if (!supported || !api || !userId) return;
    await SecureStore.setItemAsync(preferenceKey(userId), "revoking");
    void dismissChatNotifications().catch(() => {});
    const installation = await SecureStore.getItemAsync(installationKey);
    if (installation) await setRegistration(api, installation, null);
    await SecureStore.setItemAsync(preferenceKey(userId), "disabled");
    lastRegistration.current = 0;
    updateMode("off");
  }, [api, updateMode, userId]);

  const register = useCallback(
    (prompt: boolean, force = false) =>
      run(async () => {
        if (!supported || !api || !userId || !mounted.current) return;
        try {
          const saved = await SecureStore.getItemAsync(preferenceKey(userId));
          if (!prompt && saved === "revoking") {
            await revoke();
            return;
          }
          if (!prompt && saved !== "enabled") {
            updateMode("off");
            return;
          }
          await Notifications.setNotificationChannelAsync(channelId, {
            name: "Chat messages",
            importance: Notifications.AndroidImportance.HIGH,
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PRIVATE,
            vibrationPattern: [0, 180, 100, 180],
            sound: "default",
          });
          let permissions = await Notifications.getPermissionsAsync();
          if (prompt && !permissions.granted && permissions.canAskAgain)
            permissions = await Notifications.requestPermissionsAsync();
          if (!permissions.granted) {
            await revoke();
            updateMode("blocked");
            return;
          }
          if (
            !force &&
            !prompt &&
            Date.now() - lastRegistration.current < 60 * 60 * 1000
          )
            return;
          await SecureStore.setItemAsync(preferenceKey(userId), "enabled");
          let installation = await SecureStore.getItemAsync(installationKey);
          if (!installation) {
            installation = randomUUID();
            await SecureStore.setItemAsync(installationKey, installation);
          }
          const token = await chatToken();
          if (!mounted.current) return;
          await setRegistration(api, installation, token);
          lastRegistration.current = Date.now();
          updateMode("on");
        } catch {
          updateMode("retry");
        }
      }),
    [api, revoke, run, updateMode, userId],
  );

  useEffect(() => {
    if (!supported) return;
    void prepareChatNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    if (!supported || !userId) return;
    void register(false);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void register(false);
    });
    const token = Notifications.addPushTokenListener(() => {
      void register(false, true);
    });
    return () => {
      app.remove();
      token.remove();
    };
  }, [register, userId]);

  const enable = async () => {
    setBusy(true);
    try {
      await register(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await run(revoke);
    } catch {
      updateMode("revoking");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Context.Provider value={{ mode, busy, enable, disable }}>
      {children}
      {supported ? <NotificationNavigation /> : null}
    </Context.Provider>
  );
}

export function chatPushSupported() {
  return supported;
}

export function useChatPush(): ChatPush {
  return useContext(Context);
}

export function usePushSignOut() {
  const { signOut } = useClerk();
  const { disable } = useContext(Context);
  return async () => {
    await disable();
    await signOut();
  };
}

export function ChatPushSettings() {
  const { me } = useSession();
  const { mode, busy, enable, disable } = useContext(Context);
  if (!supported || !me?.onboarding_completed) return null;
  return (
    <View
      style={{
        gap: 12,
        padding: 18,
        borderRadius: radius.cardSm,
        backgroundColor: colors.graphite,
      }}
    >
      <SectionTitle>Chat notifications</SectionTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: colors.bone,
              fontFamily: fonts.semibold,
              fontSize: 15,
            }}
          >
            Message alerts
          </Text>
          <Copy>
            Show private alerts on the lock screen and while Arcenray is in the
            background.
          </Copy>
        </View>
        <Switch
          accessibilityLabel="Message alerts"
          value={mode === "on"}
          disabled={busy || mode === "checking" || mode === "revoking"}
          onValueChange={(enabled) => void (enabled ? enable() : disable())}
          trackColor={{ false: colors.lineStrong, true: colors.ember }}
          thumbColor={colors.bone}
        />
      </View>
      {mode === "blocked" ? (
        <>
          <Muted>
            Allow notifications in Android settings, then turn on message alerts
            here.
          </Muted>
          <Button
            title="Open Android settings"
            variant="ghost"
            onPress={() => void Linking.openSettings().catch(() => {})}
          />
        </>
      ) : null}
      {mode === "retry" ? (
        <>
          <Muted>Couldn’t connect. Toggle message alerts to try again.</Muted>
          <Button
            title="Turn off message alerts"
            variant="ghost"
            disabled={busy}
            onPress={() => void disable()}
          />
        </>
      ) : null}
      {mode === "revoking" ? (
        <>
          <Muted>Turning off alerts will retry when the app reconnects.</Muted>
          <Button
            title="Retry turning off"
            variant="ghost"
            disabled={busy}
            onPress={() => void disable()}
          />
        </>
      ) : null}
    </View>
  );
}
