import { chatPushConversation } from "./chat-push-state.ts";

export const CHAT_NOTIFICATION_CATEGORY = "arcenray_chat_message";
export const CHAT_NOTIFICATION_ACTIONS = {
  reply: "arcenray-chat-reply",
  markRead: "arcenray-chat-mark-read",
} as const;

export type ChatNotificationActionDefinition = {
  identifier: string;
  buttonTitle: string;
  textInput?: {
    submitButtonTitle: string;
    placeholder: string;
  };
  options?: {
    opensAppToForeground?: boolean;
  };
};

export type ChatNotificationIntent =
  | {
      kind: "reply";
      conversation: string;
      body: string;
    }
  | {
      kind: "mark-read";
      conversation: string;
    };

export type ChatNotificationIntentActions = {
  reply(input: {
    conversation: string;
    body: string;
    clientId: string;
  }): Promise<{ error: unknown | null }>;
  markRead(conversation: string): Promise<{ error: unknown | null }>;
};

type ChatNotificationResponse = {
  actionIdentifier: string;
  userText?: string;
  notification: {
    request: {
      identifier: string;
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
};

export function chatNotificationActions(): ChatNotificationActionDefinition[] {
  return [
    {
      identifier: CHAT_NOTIFICATION_ACTIONS.reply,
      buttonTitle: "Reply",
      textInput: {
        submitButtonTitle: "Send",
        placeholder: "Reply to message",
      },
      options: { opensAppToForeground: false },
    },
    {
      identifier: CHAT_NOTIFICATION_ACTIONS.markRead,
      buttonTitle: "Mark as read",
      options: { opensAppToForeground: false },
    },
  ];
}

export function chatNotificationIntent(
  actionIdentifier: string,
  data: Record<string, unknown>,
  userText: string | undefined,
  userId: string | null,
): ChatNotificationIntent | null {
  const conversation = chatPushConversation(data, userId);
  if (!conversation) return null;
  if (actionIdentifier === CHAT_NOTIFICATION_ACTIONS.markRead)
    return { kind: "mark-read", conversation };
  if (actionIdentifier !== CHAT_NOTIFICATION_ACTIONS.reply) return null;
  const body = userText?.trim();
  if (!body || body.length > 5000) return null;
  return { kind: "reply", conversation, body };
}

export async function executeChatNotificationIntent(
  intent: ChatNotificationIntent,
  actions: ChatNotificationIntentActions,
  createClientId?: () => string,
) {
  try {
    if (intent.kind === "mark-read")
      return !(await actions.markRead(intent.conversation)).error;
    if (!createClientId) return false;
    const result = await actions.reply({
      conversation: intent.conversation,
      body: intent.body,
      clientId: createClientId(),
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function handleChatNotificationResponse(
  response: ChatNotificationResponse,
  dependencies: {
    currentProfileId: string | null;
    actions: ChatNotificationIntentActions;
    dismiss: (notificationIdentifier: string) => Promise<unknown>;
    createClientId?: () => string;
  },
) {
  const intent = chatNotificationIntent(
    response.actionIdentifier,
    response.notification.request.content.data ?? {},
    response.userText,
    dependencies.currentProfileId,
  );
  if (!intent) return false;
  const completed = await executeChatNotificationIntent(
    intent,
    dependencies.actions,
    dependencies.createClientId,
  );
  if (!completed) return false;
  await dependencies
    .dismiss(response.notification.request.identifier)
    .catch(() => {});
  return true;
}
