import assert from "node:assert/strict";
import { test } from "node:test";
import { chatPushConversation } from "../src/chat-push-state.ts";
import { chatPushMessage, dispatchChatPush, type PushJob } from "../../../supabase/functions/_shared/chat-push.ts";

test("a chat alert opens only a validated conversation for its signed-in recipient", () => {
  const recipient = "8eb77408-c53d-47b8-adaf-63f0e93e33fb";
  const conversation = "e1df589c-84ab-448c-bc68-8aee95a55b52";
  const data = {
    kind: "chat_message",
    conversation_id: conversation,
    recipient_id: recipient,
  };
  assert.equal(chatPushConversation(data, recipient), conversation);
  assert.equal(chatPushConversation(data, null), null);
  assert.equal(chatPushConversation(data, conversation), null);
  assert.equal(
    chatPushConversation({ ...data, conversation_id: "/settings" }, recipient),
    null,
  );
  assert.equal(
    chatPushConversation({ ...data, kind: "other" }, recipient),
    null,
  );
});

function job(overrides: Partial<PushJob> = {}): PushJob {
  return {
    id: "0f28d3f2-6db3-4a1f-9b13-c48ce7908e0d",
    lease: "a1519218-6a58-4c47-a71d-8ee0e12e0155",
    token: "ExpoPushToken[fixture]",
    recipient_id: "8eb77408-c53d-47b8-adaf-63f0e93e33fb",
    conversation_id: "e1df589c-84ab-448c-bc68-8aee95a55b52",
    ticket: null,
    send_before: "2026-11-21T19:30:00.000Z",
    sender_name: "Ava Rao",
    preview: "Loved the grading on Katha",
    message_id: "8ef3f4b5-9924-4a1e-9b66-1f6a8ff4a551",
    ...overrides,
  };
}

test("rich alerts carry the sender name, preview and thread reference", () => {
  const message = chatPushMessage(job());
  assert.equal(message.title, "Ava Rao");
  assert.equal(message.body, "Loved the grading on Katha");
  assert.equal(message.priority, "high");
  assert.equal(message.channelId, "chat-messages");
  assert.deepEqual(message.data, {
    kind: "chat_message",
    recipient_id: "8eb77408-c53d-47b8-adaf-63f0e93e33fb",
    conversation_id: "e1df589c-84ab-448c-bc68-8aee95a55b52",
    message_id: "8ef3f4b5-9924-4a1e-9b66-1f6a8ff4a551",
  });
  assert.ok(message.expiration > 0);
});

test("alerts degrade gracefully when enrichment fields are missing", () => {
  const legacy = chatPushMessage(
    job({ sender_name: null, preview: null, message_id: "" }),
  );
  assert.equal(legacy.title, "New message");
  assert.equal(legacy.body, "Sent you a message");
});

test("the dispatcher sends fresh jobs and checks accepted receipts together", async () => {
  const seen: { path: string; body: unknown }[] = [];
  const outcomes = await dispatchChatPush(
    [job(), job({ id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", ticket: "ticket-1" })],
    async (path, body) => {
      seen.push({ path, body });
      if (path === "send")
        return { data: [{ status: "ok", id: "expo-ticket-1" }] };
      return { data: { "ticket-1": { status: "ok" } } };
    },
  );
  assert.deepEqual(
    seen.map((call) => call.path).sort(),
    ["getReceipts", "send"],
  );
  assert.equal(outcomes[0]?.result, "accepted");
  assert.equal(outcomes[0]?.ticket, "expo-ticket-1");
  assert.equal(outcomes[1]?.result, "delivered");
});
