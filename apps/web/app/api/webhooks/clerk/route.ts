import { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import {
  accountConfig,
  accountReply,
  accountService,
} from "../../../../lib/account/server";
import { readBoundedBody } from "../../../../lib/account/policy";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = accountConfig();
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!config || !secret)
    return accountReply({ error: "Webhook is not configured." }, 503);
  let event;
  try {
    const body = await readBoundedBody(request, 256 * 1024);
    // Rebuild exactly the original UTF-8 body with original Svix headers for the official verifier.
    event = await verifyWebhook(
      new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      }),
      { signingSecret: secret },
    );
  } catch {
    return accountReply({ error: "Invalid webhook." }, 400);
  }
  if (event.type !== "user.deleted") return accountReply({ received: true });
  const subject = event.data.id;
  if (!subject || !/^user_[A-Za-z0-9]+$/.test(subject))
    return accountReply({ error: "Invalid deletion event." }, 400);
  try {
    const result = await accountService(config).rpc(
      "backend_begin_account_deletion",
      {
        p_issuer: config.issuer,
        p_subject: subject,
        p_clerk_deleted: true,
      },
    );
    if (result.error)
      return accountReply(
        { error: "Cleanup could not be queued. Retry delivery." },
        503,
      );
    // Unknown or already-cleaned identities acknowledge safely; never bootstrap a profile here.
    return accountReply({ received: true });
  } catch {
    return accountReply(
      { error: "Cleanup could not be queued. Retry delivery." },
      503,
    );
  }
}
