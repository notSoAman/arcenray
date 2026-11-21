import assert from "node:assert/strict";
import { test } from "node:test";
import { chatPushConversation } from "../src/chat-push-state.ts";

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
