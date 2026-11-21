import { admin, env, HttpError, serve } from "../_shared/http.ts";
import { validOperationsSecret } from "../_shared/index-queue.ts";
import { dispatchChatPush, type PushJob } from "../_shared/chat-push.ts";

serve(async (request) => {
  if (
    !validOperationsSecret(
      request.headers.get("x-cleanup-secret") ?? "",
      env("CLEANUP_SECRET"),
    )
  )
    throw new HttpError(401, "Operations authentication required");
  const accessToken = env("EXPO_PUSH_ACCESS_TOKEN");
  const database = admin();
  const claims = await database
    .rpc("backend_claim_chat_push_jobs")
    .abortSignal(AbortSignal.timeout(5000));
  if (claims.error || !Array.isArray(claims.data))
    throw new HttpError(503, "Chat push queue unavailable");
  const outcomes = await dispatchChatPush(
    claims.data as PushJob[],
    async (path, body) => {
      const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Expo push request failed");
      return response.json();
    },
  );
  // Bound concurrent DB writes. A failed write is retried after the lease expires.
  for (let start = 0; start < outcomes.length; start += 10) {
    const writes = await Promise.all(
      outcomes.slice(start, start + 10).map(({ job, result, ticket }) =>
        database
          .rpc("backend_finish_chat_push_job", {
            p_id: job.id,
            p_lease: job.lease,
            p_result: result,
            p_ticket: ticket ?? null,
          })
          .abortSignal(AbortSignal.timeout(5000)),
      ),
    );
    if (writes.some((write) => write.error))
      throw new HttpError(503, "Chat push queue update unavailable");
  }
  return {
    claimed: claims.data.length,
    rejected: outcomes.filter((item) => item.result === "rejected").length,
  };
});
