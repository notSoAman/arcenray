/** A retry or realtime echo must replace its optimistic message, not duplicate it. */
export function mergeChatMessages<
  T extends {
    id: string;
    sender_id: string;
    client_id: string;
    created_at: string;
  },
>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  // Messages arrive newest-last and nearly sorted. Each incoming row either
  // replaces an optimistic echo in place or is inserted at its sorted position,
  // so a live thread never pays a full re-sort per message.
  const merged = [...current];
  for (const message of incoming) {
    const at = merged.findIndex(
      (existing) =>
        existing.id === message.id ||
        (existing.sender_id === message.sender_id &&
          existing.client_id === message.client_id),
    );
    if (at < 0) {
      merged.splice(insertionIndex(merged, message), 0, message);
      continue;
    }
    merged[at] = message;
    // A server confirmation can shift the sort position of an optimistic row
    // (client clock skew); re-place it when the neighbours disagree.
    const before = merged[at - 1];
    const after = merged[at + 1];
    if (
      (before && order(before, message) > 0) ||
      (after && order(message, after) > 0)
    ) {
      merged.splice(at, 1);
      merged.splice(insertionIndex(merged, message), 0, message);
    }
  }
  return merged;
}

function order(a: { created_at: string; id: string }, b: typeof a) {
  return a.created_at < b.created_at
    ? -1
    : a.created_at > b.created_at
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;
}

function insertionIndex<
  T extends { created_at: string; id: string },
>(sorted: T[], message: T): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (order(sorted[mid]!, message) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function chatCursorAfter(cursor: { created_at: string; id: string }) {
  // Both values originate from a validated server response, never composer input.
  return `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`;
}

export const chatFileLimit = 20 * 1024 * 1024;
export function chatFileType(name: string, reported?: string | null) {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-m4a",
    "application/pdf",
    "application/zip",
    "text/plain",
  ]);
  const type = reported?.split(";")[0];
  if (type && allowed.has(type)) return type;
  const ext = name.toLowerCase().split(".").at(-1);
  return (
    (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        wav: "audio/wav",
        ogg: "audio/ogg",
        webm: "audio/webm",
        pdf: "application/pdf",
        txt: "text/plain",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}

export const voiceNoteName = "Voice note.m4a";
export const voiceNoteLimitMs = 30 * 60 * 1000;

export function isVoiceNote(name: string) {
  return (
    name === voiceNoteName ||
    /^Voice note \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.m4a$/.test(name)
  );
}

export function chatPreview(body: string, attachmentId: string | null) {
  return attachmentId && isVoiceNote(body)
    ? "Voice note"
    : body || "Attachment";
}

export function voiceNoteTime(seconds: number) {
  const elapsed = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;
  return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
}

/**
 * Typing protocol — ephemeral Realtime broadcast, never persisted.
 * A composer re-announces while text keeps changing; receivers expire the
 * hint instead of trusting a "stopped" event that may never arrive.
 */
export const typingRefreshMs = 1500;
export const typingExpiryMs = 5000;

export function shouldSendTyping(lastSentAt: number, now: number) {
  return now - lastSentAt >= typingRefreshMs;
}

export function typingChannel(conversation: string) {
  return `chat-presence:${conversation}`;
}

type ChatActivity = {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string;
};

export function isUnreadChat(
  message: ChatActivity,
  lastRead: string,
  userId: string,
) {
  return message.sender_id !== userId && message.created_at > lastRead;
}

/**
 * One overview row = one conversation with its receipt and newest message,
 * read from the same database snapshot. Unread state can no longer disagree
 * with the preview line because both fields arrive together.
 */
export type ChatOverviewRow = {
  conversation_id: string;
  last_read_at: string;
  last_message_id: string | null;
  last_message_client_id: string | null;
  last_message_sender_id: string | null;
  last_message_body: string | null;
  last_message_attachment_id: string | null;
  last_message_created_at: string | null;
  peer_last_read_at: string | null;
};

export type ChatSnapshotMessage = {
  id: string;
  client_id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_id: string | null;
  created_at: string;
};

export function overviewSnapshot(rows: ChatOverviewRow[]) {
  const receipts = rows.map((row) => ({
    conversation_id: row.conversation_id,
    last_read_at: row.last_read_at,
  }));
  const peerReceipts = rows.map((row) => ({
    conversation_id: row.conversation_id,
    last_read_at: row.peer_last_read_at ?? "",
  }));
  const messages = rows
    .filter(
      (row): row is ChatOverviewRow & { last_message_id: string } =>
        row.last_message_id !== null,
    )
    .map<ChatSnapshotMessage>((row) => ({
      id: row.last_message_id,
      client_id: row.last_message_client_id!,
      conversation_id: row.conversation_id,
      sender_id: row.last_message_sender_id!,
      body: row.last_message_body!,
      attachment_id: row.last_message_attachment_id,
      created_at: row.last_message_created_at!,
    }));
  return { receipts, peerReceipts, messages };
}

export function newestChatAlert<T extends ChatActivity>(
  messages: T[],
  previous: T[],
  receipts: ReadonlyMap<string, string>,
  userId: string,
  openThread: string | null,
) {
  const known = new Map(
    previous.map((message) => [message.conversation_id, message]),
  );
  return messages.find((message) => {
    const id = message.conversation_id;
    const before = known.get(id);
    const lastRead = receipts.get(id);
    return (
      id !== openThread &&
      lastRead !== undefined &&
      isUnreadChat(message, lastRead, userId) &&
      (!before ||
        message.created_at > before.created_at ||
        (message.created_at === before.created_at && message.id > before.id))
    );
  });
}

/**
 * Keeps the per-conversation "latest message" list ordered newest-first.
 * A realtime echo replaces its row in place; a newer message takes the
 * conversation slot; anything older than the known latest is ignored.
 */
export function upsertLatestMessage<
  T extends {
    id: string;
    conversation_id: string;
    created_at: string;
  },
>(messages: T[], row: T): T[] {
  const at = messages.findIndex(
    (message) => message.conversation_id === row.conversation_id,
  );
  if (at < 0) return insertSortedDesc(messages, row);
  const known = messages[at]!;
  if (known.id === row.id) {
    const next = [...messages];
    next[at] = row;
    return next;
  }
  if (order(known, row) < 0) {
    const next = messages.filter((_, index) => index !== at);
    return insertSortedDesc(next, row);
  }
  return messages;
}

function insertSortedDesc<
  T extends { created_at: string; id: string },
>(messages: T[], row: T): T[] {
  let at = messages.length;
  while (
    at > 0 &&
    order(row, messages[at - 1]!) < 0
  )
    at -= 1;
  const next = [...messages];
  next.splice(at, 0, row);
  return next;
}

/** Read receipts only ever move forward; a stale echo cannot unread a chat. */
export function bumpReceipts<
  T extends { conversation_id: string; last_read_at: string },
>(receipts: T[], conversationId: string, lastReadAt: string): T[] {
  const at = receipts.findIndex(
    (receipt) => receipt.conversation_id === conversationId,
  );
  if (at < 0)
    return [
      ...receipts,
      { conversation_id: conversationId, last_read_at: lastReadAt } as T,
    ];
  if (receipts[at]!.last_read_at >= lastReadAt) return receipts;
  const next = [...receipts];
  next[at] = { ...receipts[at]!, last_read_at: lastReadAt } as T;
  return next;
}
