import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeChatMessages,
  chatCursorAfter,
  chatFileType,
  chatPreview,
  isVoiceNote,
  newestChatAlert,
  voiceNoteTime,
} from "../src/chat-state.ts";
const base = {
  id: "temp",
  sender_id: "a",
  client_id: "retry",
  created_at: "2026-11-03T00:00:00Z",
  delivery: "sending" as string | undefined,
};
test("confirmation and realtime echo replace one optimistic send", () => {
  const confirmed = { ...base, id: "server", delivery: undefined };
  assert.deepEqual(mergeChatMessages([base], [confirmed, confirmed]), [
    confirmed,
  ]);
});
test("different senders can reuse a client id and equal timestamps have a stable order", () => {
  const other = { ...base, id: "b", sender_id: "b" };
  assert.deepEqual(
    mergeChatMessages([base], [other]).map((x) => x.id),
    ["b", "temp"],
  );
  assert.match(chatCursorAfter(base), /and\(created_at.eq.*id.gt.temp\)/);
});
test("voice notes use audio MIME type when provider metadata is missing", () => {
  assert.equal(chatFileType("Voice note.m4a"), "audio/mp4");
  assert.equal(
    chatFileType("frame.PNG", "application/octet-stream"),
    "image/png",
  );
  assert.equal(chatFileType("project.bin"), "application/octet-stream");
});

test("voice notes keep recording time readable and hide legacy generated names", () => {
  const legacy = "Voice note 2026-11-21T14-30-26-292Z.m4a";
  assert.equal(isVoiceNote(legacy), true);
  assert.equal(isVoiceNote("Voice note.m4a"), true);
  assert.equal(isVoiceNote("Voice note from set.m4a"), false);
  assert.equal(chatPreview(legacy, "asset"), "Voice note");
  assert.equal(chatPreview(legacy, null), legacy);
  assert.equal(chatPreview("Voice note", "asset"), "Voice note");
  assert.equal(voiceNoteTime(125.9), "2:05");
  assert.equal(voiceNoteTime(NaN), "0:00");
});

test("new unread messages exclude the open thread, older messages and own sends", () => {
  const peer = { ...base, conversation_id: "thread" };
  const earlier = { ...peer, id: "old", created_at: "2026-11-02T00:00:00Z" };
  const receipts = new Map([["thread", earlier.created_at]]);
  assert.equal(newestChatAlert([peer], [earlier], receipts, "me", null), peer);
  assert.equal(
    newestChatAlert([peer], [earlier], receipts, "me", "thread"),
    undefined,
  );
  assert.equal(
    newestChatAlert([peer], [earlier], receipts, "a", null),
    undefined,
  );
  assert.equal(
    newestChatAlert([peer], [peer], receipts, "me", null),
    undefined,
  );
  assert.equal(
    newestChatAlert([earlier], [peer], receipts, "me", null),
    undefined,
  );
});
