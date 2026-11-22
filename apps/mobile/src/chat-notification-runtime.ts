import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import type { Api } from "./session";
import {
  CHAT_NOTIFICATION_ACTIONS,
  CHAT_NOTIFICATION_CATEGORY,
  chatNotificationActions,
  handleChatNotificationResponse,
  type ChatNotificationIntentActions,
} from "./chat-notification";

export const CHAT_NOTIFICATION_TASK = "arcenray-chat-notification-response";

let configuration: Promise<void> | null = null;

export function prepareChatNotifications() {
  configuration ??= Promise.all([
    Notifications.setNotificationCategoryAsync(
      CHAT_NOTIFICATION_CATEGORY,
      chatNotificationActions() as Notifications.NotificationAction[],
    ),
    Notifications.registerTaskAsync(CHAT_NOTIFICATION_TASK),
  ]).then(() => {});
  return configuration;
}

export function chatNotificationActionsForApi(
  api: Api,
  profileId: string,
): ChatNotificationIntentActions {
  return {
    reply: ({ conversation, body, clientId }) =>
      api.chat.send({
        conversation_id: conversation,
        body,
        client_id: clientId,
      }),
    async markRead(conversation) {
      const latest = await api.supabase
        .from("messages")
        .select("created_at")
        .eq("conversation_id", conversation)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.error) return latest;
      const readAt = latest.data?.created_at ?? new Date().toISOString();
      return api.supabase
        .from("conversation_participants")
        .update({ last_read_at: readAt })
        .eq("conversation_id", conversation)
        .eq("user_id", profileId)
        .lt("last_read_at", readAt)
        .select("last_read_at")
        .maybeSingle();
    },
  };
}

export async function handleChatNotificationWithApi(
  api: Api,
  profileId: string,
  response: Parameters<typeof handleChatNotificationResponse>[0],
) {
  return handleChatNotificationResponse(response, {
    currentProfileId: profileId,
    actions: chatNotificationActionsForApi(api, profileId),
    dismiss: (identifier) => Notifications.dismissNotificationAsync(identifier),
    createClientId: () => {
      const messageId = response.notification.request.content.data?.message_id;
      return typeof messageId === "string" &&
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(messageId)
        ? messageId
        : randomUUID();
    },
  });
}

export function isChatNotificationAction(actionIdentifier: string) {
  return (
    actionIdentifier === CHAT_NOTIFICATION_ACTIONS.reply ||
    actionIdentifier === CHAT_NOTIFICATION_ACTIONS.markRead
  );
}
