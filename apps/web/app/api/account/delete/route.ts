import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "../../../../lib/supabase/server";
import {
  accountConfig,
  accountReply,
  accountService,
} from "../../../../lib/account/server";
import {
  hasSameOrigin,
  isRecentSession,
  readBoundedBody,
  validDeletionBody,
} from "../../../../lib/account/policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return accountReply(
      { error: "This request must come from this website." },
      403,
    );
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return accountReply({ error: "Send a JSON confirmation." }, 415);
  try {
    if (!validDeletionBody(JSON.parse(await readBoundedBody(request, 4096))))
      return accountReply({ error: "Type DELETE MY ACCOUNT to confirm." }, 400);
  } catch {
    return accountReply(
      { error: "Invalid confirmation or request too large." },
      400,
    );
  }
  const config = accountConfig();
  if (!config)
    return accountReply(
      {
        error:
          "Self-service deletion is not configured. Contact support before continuing.",
      },
      503,
    );
  let job: string | null = null;
  try {
    const identity = await auth();
    if (!identity.userId || !identity.sessionId)
      return accountReply({ error: "Sign in to continue." }, 401);
    const clerk = await clerkClient();
    const session = await clerk.sessions.getSession(identity.sessionId);
    if (
      session.userId !== identity.userId ||
      session.status !== "active" ||
      session.actor ||
      !isRecentSession(session.createdAt)
    )
      return accountReply(
        {
          error:
            "Sign out, sign in again, and request deletion within 10 minutes.",
          code: "recent_sign_in_required",
        },
        403,
      );
    const userClient = await createClient();
    const resolved = await userClient.rpc("current_profile_id");
    if (resolved.error || !resolved.data)
      return accountReply(
        { error: "Could not verify your Arcenray account." },
        403,
      );
    const service = accountService(config);
    const begun = await service.rpc("backend_begin_account_deletion", {
      p_profile: resolved.data,
      p_issuer: config.issuer,
      p_subject: identity.userId,
      p_clerk_deleted: false,
    });
    if (begun.error || !begun.data) {
      // A dropped response can follow a committed begin. Never assert rollback from transport failure.
      const status = await userClient.rpc("get_account_status");
      if (
        status.data &&
        typeof status.data === "object" &&
        !Array.isArray(status.data) &&
        ["deleting", "deleted"].includes(String(status.data.status))
      )
        return accountReply(
          {
            status: "queued",
            message: "Your account is unavailable. Cleanup is queued.",
          },
          202,
        );
      return accountReply(
        {
          error:
            "Deletion could not be confirmed. Your account may already be unavailable; check again or contact support before retrying.",
        },
        409,
      );
    }
    job = begun.data;
    // The database has already disabled access. Retriable cleanup is now durable.
    await clerk.users.deleteUser(identity.userId);
    const marked = await service.rpc("backend_mark_clerk_deleted", {
      p_job: job,
    });
    if (marked.error)
      return accountReply(
        {
          status: "queued",
          message: "Your account is unavailable. Cleanup is queued.",
        },
        202,
      );
    return accountReply(
      {
        status: "queued",
        message:
          "Deletion requested. Your account is unavailable while cleanup completes.",
      },
      202,
    );
  } catch {
    if (job)
      return accountReply(
        {
          status: "queued",
          message:
            "Your account is unavailable. Cleanup is queued and will retry.",
        },
        202,
      );
    return accountReply(
      { error: "Deletion could not start. Please retry or contact support." },
      503,
    );
  }
}
