import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_NOTIFICATION_ACTIONS,
  CHAT_NOTIFICATION_CATEGORY,
  chatNotificationActions,
  chatNotificationIntent,
  executeChatNotificationIntent,
  handleChatNotificationResponse,
} from "../src/chat-notification.ts";

const recipient = "8eb77408-c53d-47b8-adaf-63f0e93e33fb";
const conversation = "e1df589c-84ab-448c-bc68-8aee95a55b52";
const data = {
  kind: "chat_message",
  recipient_id: recipient,
  conversation_id: conversation,
};

test("chat notifications expose inline reply and mark-read actions", () => {
  assert.equal(CHAT_NOTIFICATION_CATEGORY, "arcenray_chat_message");
  assert.deepEqual(chatNotificationActions(), [
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
  ]);
});

test("reply actions trim validated text without opening the app", () => {
  assert.deepEqual(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.reply,
      data,
      "  Sounds good.  ",
      recipient,
    ),
    {
      kind: "reply",
      conversation,
      body: "Sounds good.",
    },
  );
  assert.equal(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.reply,
      data,
      "   ",
      recipient,
    ),
    null,
  );
  assert.equal(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.reply,
      data,
      "x".repeat(5001),
      recipient,
    ),
    null,
  );
});

test("mark-read and open intents require the signed-in recipient", () => {
  assert.deepEqual(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.markRead,
      data,
      undefined,
      recipient,
    ),
    { kind: "mark-read", conversation },
  );
  assert.equal(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.markRead,
      data,
      undefined,
      null,
    ),
    null,
  );
  assert.equal(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.markRead,
      { ...data, recipient_id: conversation },
      undefined,
      recipient,
    ),
    null,
  );
});

test("unknown action identifiers and malformed conversations are ignored", () => {
  assert.equal(
    chatNotificationIntent("other", data, undefined, recipient),
    null,
  );
  assert.equal(
    chatNotificationIntent(
      CHAT_NOTIFICATION_ACTIONS.markRead,
      { ...data, conversation_id: "/chats" },
      undefined,
      recipient,
    ),
    null,
  );
});

test("reply execution uses one stable client id and reports API failure", async () => {
  const calls: unknown[] = [];
  const clientId = "64a9423f-d6c9-4bb2-b70b-e3fa98285e7c";
  const sent = await executeChatNotificationIntent(
    { kind: "reply", conversation, body: "On my way" },
    {
      reply: async (input) => {
        calls.push(input);
        return { error: null };
      },
      markRead: async () => {
        throw new Error("unexpected mark-read");
      },
    },
    () => clientId,
  );
  assert.equal(sent, true);
  assert.deepEqual(calls, [{ conversation, body: "On my way", clientId }]);
  assert.equal(
    await executeChatNotificationIntent(
      { kind: "reply", conversation, body: "Retry" },
      {
        reply: async () => ({ error: new Error("offline") }),
        markRead: async () => ({ error: null }),
      },
      () => clientId,
    ),
    false,
  );
});

test("mark-read execution reports the persisted receipt result", async () => {
  const seen: string[] = [];
  const actions = {
    reply: async () => ({ error: null }),
    markRead: async (id: string) => {
      seen.push(id);
      return { error: null };
    },
  };
  assert.equal(
    await executeChatNotificationIntent(
      { kind: "mark-read", conversation },
      actions,
    ),
    true,
  );
  assert.deepEqual(seen, [conversation]);
  assert.equal(
    await executeChatNotificationIntent(
      { kind: "mark-read", conversation },
      {
        ...actions,
        markRead: async () => ({ error: new Error("offline") }),
      },
    ),
    false,
  );
});

test("notification responses validate the recipient before acting and dismiss only after success", async () => {
  const dismissed: string[] = [];
  const actions = {
    reply: async () => ({ error: null }),
    markRead: async () => ({ error: null }),
  };
  const response = {
    actionIdentifier: CHAT_NOTIFICATION_ACTIONS.reply,
    userText: "Sounds good",
    notification: {
      request: {
        identifier: "notification-1",
        content: { data },
      },
    },
  };
  const createClientId = () => "64a9423f-d6c9-4bb2-b70b-e3fa98285e7c";
  assert.equal(
    await handleChatNotificationResponse(response, {
      currentProfileId: conversation,
      actions,
      createClientId,
      dismiss: async (id: string) => {
        dismissed.push(id);
      },
    }),
    false,
  );
  assert.equal(dismissed.length, 0);
  assert.equal(
    await handleChatNotificationResponse(response, {
      currentProfileId: recipient,
      actions,
      createClientId,
      dismiss: async (id: string) => {
        dismissed.push(id);
      },
    }),
    true,
  );
  assert.deepEqual(dismissed, ["notification-1"]);
  assert.equal(
    await handleChatNotificationResponse(response, {
      currentProfileId: recipient,
      actions: {
        ...actions,
        reply: async () => ({ error: new Error("offline") }),
      },
      createClientId,
      dismiss: async (id: string) => {
        dismissed.push(id);
      },
    }),
    false,
  );
  assert.deepEqual(dismissed, ["notification-1"]);
});
