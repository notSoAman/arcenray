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
