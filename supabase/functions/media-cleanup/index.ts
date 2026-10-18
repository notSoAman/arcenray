import { z } from "zod";
import {
  serve,
  admin,
  checked,
  env,
  HttpError,
  jsonBody,
} from "../_shared/http.ts";
import { r2Lifecycle } from "../_shared/r2.ts";
import { processMediaJobs } from "../_shared/media-lifecycle.ts";
import { processAccountDeletions } from "../_shared/account-cleanup.ts";
serve(async (req) => {
  // The platform verifies JWTs; this dedicated secret additionally restricts operations.
  const supplied = req.headers.get("x-cleanup-secret") ?? "";
  const expected = env("CLEANUP_SECRET");
  const a = new TextEncoder().encode(supplied),
    b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0)
    throw new HttpError(401, "Operations authentication required");
  const body = z
    .object({ dry_run: z.boolean().optional() })
    .strict()
    .parse(await jsonBody(req));
  if (body.dry_run === true) return { authenticated: true, dry_run: true };
  // The scheduler waits 60s. Storage gets at most35s plus bounded SQL recovery;
  // every started operation is awaited, and later phases can wait for next cron.
  const started = Date.now(),
    deadline = started + 50000;
  const enqueued = checked(
    await admin()
      .rpc("backend_enqueue_expired_media")
      .abortSignal(AbortSignal.timeout(2000)),
  );
  const jobs = await processMediaJobs(Math.min(deadline, started + 40000));
  const accountSkipped = Date.now() - started > 35000;
  const accounts = accountSkipped
    ? {
        accounts_finished: 0,
        accounts_waiting_for_media: 0,
        accounts_failed: 0,
      }
    : await processAccountDeletions(deadline);
  const duplicateSkipped = Date.now() - started > 40000;
  let duplicatesRemoved = 0;
  if (!duplicateSkipped) {
    const duplicates = checked(
      await admin()
        .rpc("backend_duplicate_sources")
        .abortSignal(AbortSignal.timeout(2000)),
    ) as { id: string; owner_id: string; object_key: string }[];
    const outcomes = await Promise.allSettled(
      duplicates.slice(0, 3).map(async (a) => {
        const uuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
        if (
          !uuid.test(a.owner_id) ||
          !uuid.test(a.id) ||
          !a.object_key.startsWith(a.owner_id + "/") ||
          !uuid.test(a.object_key.slice(a.owner_id.length + 1))
        )
          throw new HttpError(500, "Invalid cleanup object");
        const remaining = deadline - Date.now() - 2000;
        if (remaining <= 0) throw new HttpError(503, "Cleanup will retry");
        await r2Lifecycle(
          "DELETE",
          env("R2_UPLOAD_BUCKET_NAME"),
          a.object_key,
          Math.min(5000, remaining),
        );
        const { error } = await admin()
          .rpc("backend_source_deleted", {
            p_id: a.id,
          })
          .abortSignal(AbortSignal.timeout(2000));
        if (error) throw new HttpError(500, "Source cleanup accounting failed");
        duplicatesRemoved++;
      }),
    );
    if (outcomes.some((result) => result.status === "rejected"))
      throw new HttpError(503, "Source cleanup will retry");
  }
  return {
    enqueued,
    ...jobs,
    ...accounts,
    account_cleanup_deferred: accountSkipped,
    source_cleanup_deferred: duplicateSkipped,
    duplicates_removed: duplicatesRemoved,
  };
});
