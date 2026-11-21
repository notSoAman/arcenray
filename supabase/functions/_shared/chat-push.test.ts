import { deepStrictEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { chatPushMessage, dispatchChatPush, type PushJob } from "./chat-push.ts";

const base: PushJob = {
  id: "job",
  lease: "lease",
  token: "ExpoPushToken[placeholder]",
  recipient_id: "recipient",
  conversation_id: "conversation",
  ticket: null,
  send_before: new Date(Date.now() + 60_000).toISOString(),
  sender_name: "Ava Rao",
  preview: "Loved the grading on Katha",
  message_id: "message",
};

test("sends a private alert and keeps the Expo ticket for receipt checks", async () => {
  const outcomes = await dispatchChatPush([base], async (path, request) => {
    equal(path, "send");
    deepStrictEqual(request, [
      {
        to: base.token,
        title: "Ava Rao",
        body: "Loved the grading on Katha",
        priority: "high",
        sound: "default",
        channelId: "chat-messages",
        expiration: Math.floor(Date.parse(base.send_before) / 1000),
        data: {
          kind: "chat_message",
          recipient_id: "recipient",
          conversation_id: "conversation",
          message_id: "message",
        },
      },
    ]);
    return { data: [{ status: "ok", id: "ticket" }] };
  });
  deepStrictEqual(outcomes, [
    { job: base, result: "accepted", ticket: "ticket" },
  ]);
});

test("alerts degrade to a generic title and preview when enrichment is absent", () => {
  const legacy: PushJob = {
    ...base,
    sender_name: null,
    preview: null,
    message_id: "",
  };
  const message = chatPushMessage(legacy);
  equal(message.title, "New message");
  equal(message.body, "Sent you a message");
  equal(message.data.message_id, "");
});

test("handles unregistered devices, transient failures and delayed receipts", async () => {
  const receipt = { ...base, id: "receipt", ticket: "pending" };
  const jobs = [base, { ...base, id: "rate" }, receipt];
  const outcomes = await dispatchChatPush(jobs, async (path) =>
    path === "send"
      ? {
          data: [
            { status: "error", details: { error: "DeviceNotRegistered" } },
            { status: "error", details: { error: "MessageRateExceeded" } },
          ],
        }
      : { data: {} },
  );
  deepStrictEqual(
    outcomes.map(({ result }) => result),
    ["unregistered", "retry", "retry"],
  );
  deepStrictEqual(
    (
      await dispatchChatPush([base], async () => {
        throw Error("network");
      })
    )[0]?.result,
    "retry",
  );
  deepStrictEqual(
    (
      await dispatchChatPush([receipt], async () => ({
        data: { pending: { status: "ok" } },
      }))
    )[0]?.result,
    "delivered",
  );
});
