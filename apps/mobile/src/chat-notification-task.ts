import * as TaskManager from "expo-task-manager";
import {
  BackgroundNotificationTaskResult,
  type NotificationTaskPayload,
} from "expo-notifications";
import { getClerkInstance } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { createMobileApi } from "./api";
import { config } from "./config";
import {
  CHAT_NOTIFICATION_TASK,
  handleChatNotificationWithApi,
  isChatNotificationAction,
} from "./chat-notification-runtime";

async function notificationApi() {
  if (!config.backend || !config.clerkKey) return null;
  const clerk = getClerkInstance({
    publishableKey: config.clerkKey,
    tokenCache,
  });
  await clerk.load();
  const token = await clerk.session?.getToken();
  if (!token) return null;
  const api = createMobileApi(config.backend, async () => token);
  const profileId = await api.viewer.id();
  if (!profileId) return null;
  return { api, profileId };
}

TaskManager.defineTask<NotificationTaskPayload>(
  CHAT_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error || !data || !("actionIdentifier" in data))
      return BackgroundNotificationTaskResult.NoData;
    if (!isChatNotificationAction(data.actionIdentifier))
      return BackgroundNotificationTaskResult.NoData;
    try {
      const context = await notificationApi();
      if (!context) return BackgroundNotificationTaskResult.NoData;
      const completed = await handleChatNotificationWithApi(
        context.api,
        context.profileId,
        data,
      );
      return completed
        ? BackgroundNotificationTaskResult.NewData
        : BackgroundNotificationTaskResult.Failed;
    } catch {
      return BackgroundNotificationTaskResult.Failed;
    }
  },
);
