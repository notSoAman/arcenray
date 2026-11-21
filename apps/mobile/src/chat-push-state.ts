const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function chatPushConversation(
  data: Record<string, unknown>,
  userId: string | null,
) {
  if (!userId || data.kind !== "chat_message" || data.recipient_id !== userId)
    return null;
  const id = data.conversation_id;
  return typeof id === "string" && uuid.test(id) ? id : null;
}

export type PromptEvent =
  | "accept-success"
  | "accept-blocked"
  | "accept-failed"
  | "dismiss";
export type PromptPreference = "unset" | "dismissed" | "enabled" | "blocked";

/**
 * One-way prompt lifecycle: "unset" may be asked (a failed accept stays
 * eligible), "dismissed" never auto-prompts again but a later accept can
 * still enable, and "enabled"/"blocked" are terminal.
 */
export function nextPromptPreference(
  current: PromptPreference,
  event: PromptEvent,
): PromptPreference {
  if (current === "enabled" || current === "blocked") return current;
  if (event === "accept-success") return "enabled";
  if (event === "accept-blocked") return "blocked";
  if (current === "unset" && event === "dismiss") return "dismissed";
  return current;
}
