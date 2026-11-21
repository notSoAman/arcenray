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
