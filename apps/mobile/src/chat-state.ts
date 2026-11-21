/** A retry or realtime echo must replace its optimistic message, not duplicate it. */
export function mergeChatMessages<
  T extends {
    id: string;
    sender_id: string;
    client_id: string;
    created_at: string;
  },
>(current: T[], incoming: T[]): T[] {
  const merged = [...current];
  for (const message of incoming) {
    const at = merged.findIndex(
      (existing) =>
        existing.id === message.id ||
        (existing.sender_id === message.sender_id &&
          existing.client_id === message.client_id),
    );
    if (at < 0) merged.push(message);
    else merged[at] = message;
  }
  return merged.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
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
