import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeChatMessages,
  chatCursorAfter,
  chatFileType,
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
