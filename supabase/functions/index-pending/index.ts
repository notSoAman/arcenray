import { z } from "zod";
import { admin, env, HttpError, jsonBody, serve } from "../_shared/http.ts";
import { embed } from "../_shared/embeddings.ts";
import {
  processIndexQueue,
  validOperationsSecret,
  type IndexJob,
} from "../_shared/index-queue.ts";

serve(async (request) => {
  if (
    !validOperationsSecret(
      request.headers.get("x-cleanup-secret") ?? "",
      env("CLEANUP_SECRET"),
    )
  )
    throw new HttpError(401, "Operations authentication required");
  const body = z
    .object({ dry_run: z.boolean().optional() })
    .strict()
    .parse(await jsonBody(request));
  if (body.dry_run) return { authenticated: true, dry_run: true };
  const db = admin();
  return await processIndexQueue({
    async claim() {
      const result = await db
        .rpc("backend_claim_index_jobs", { p_limit: 3 })
        .abortSignal(AbortSignal.timeout(5000));
      if (result.error || !Array.isArray(result.data))
        throw new HttpError(503, "Index queue unavailable");
      return result.data as IndexJob[];
    },
    embed,
    async save(job, vector, hash) {
      const result = await db
        .rpc("backend_set_embedding", {
          p_kind: job.kind,
          p_id: job.entity_id,
          p_owner: job.owner_id,
          p_embedding: JSON.stringify(vector),
          p_hash: hash,
          p_updated_at: job.source_updated_at,
        })
        .abortSignal(AbortSignal.timeout(5000));
      if (result.error || typeof result.data !== "boolean")
        throw new HttpError(503, "Index save unavailable");
      return result.data;
    },
    async finish(job, success) {
      const result = await db
        .rpc("backend_finish_index_job", {
          p_kind: job.kind,
          p_id: job.entity_id,
          p_version: job.version,
          p_success: success,
        })
        .abortSignal(AbortSignal.timeout(5000));
      if (result.error || typeof result.data !== "boolean")
        throw new HttpError(503, "Index completion unavailable");
      return result.data;
    },
  });
});
