export type PushJob = {
  id: string;
  lease: string;
  token: string;
  recipient_id: string;
  conversation_id: string;
  ticket: string | null;
  send_before: string;
  sender_name: string | null;
  preview: string | null;
  message_id: string;
};

type Result = "accepted" | "delivered" | "unregistered" | "rejected" | "retry";
type Outcome = { job: PushJob; result: Result; ticket?: string };
type ExpoResult = {
  status?: string;
  id?: string;
  details?: { error?: string };
};
type ExpoRequest = (
  path: "send" | "getReceipts",
  body: unknown,
) => Promise<unknown>;

function status(job: PushJob, response: ExpoResult | undefined): Outcome {
  if (response?.status === "ok") {
    if (job.ticket) return { job, result: "delivered" };
    if (
      typeof response.id === "string" &&
      response.id.length <= 128 &&
      response.id
    )
      return { job, result: "accepted", ticket: response.id };
  }
  const code = response?.details?.error;
  if (code === "DeviceNotRegistered") return { job, result: "unregistered" };
  if (
    code === "MessageTooBig" ||
    code === "InvalidCredentials" ||
    code === "MismatchSenderId"
  )
    return { job, result: "rejected" };
  return { job, result: "retry" };
}

export function chatPushMessage(job: PushJob) {
  return {
    to: job.token,
    // Sender name with a privacy-preserving preview. Android lock-screen
    // visibility stays PRIVATE, so the body is hidden until the device unlocks.
    title: job.sender_name || "New message",
    body: job.preview || "Sent you a message",
    priority: "high" as const,
    sound: "default",
    channelId: "chat-messages",
    categoryId: "arcenray_chat_message",
    icon: "notification_icon",
    expiration: Math.floor(Date.parse(job.send_before) / 1000),
    data: {
      kind: "chat_message",
      recipient_id: job.recipient_id,
      conversation_id: job.conversation_id,
      message_id: job.message_id,
    },
  };
}

export async function dispatchChatPush(
  jobs: PushJob[],
  request: ExpoRequest,
): Promise<Outcome[]> {
  const sends = jobs.filter((job) => !job.ticket);
  const receipts = jobs.filter((job) => job.ticket);
  const [sent, checked] = await Promise.all([
    sends.length
      ? request("send", sends.map(chatPushMessage)).catch(() => null)
      : null,
    receipts.length
      ? request("getReceipts", {
          ids: receipts.map((job) => job.ticket),
        }).catch(() => null)
      : null,
  ]);
  const tickets = (sent as { data?: ExpoResult[] } | null)?.data;
  const results = (checked as { data?: Record<string, ExpoResult> } | null)
    ?.data;
  return [
    ...sends.map((job, index) =>
      status(
        job,
        Array.isArray(tickets) && tickets.length === sends.length
          ? tickets[index]
          : undefined,
      ),
    ),
    ...receipts.map((job) => status(job, results?.[job.ticket!])),
  ];
}
