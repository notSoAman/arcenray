import { z } from "zod";
import { admin, env, HttpError, jsonBody, serve, checked } from "../_shared/http.ts";
import { readMoov, r2 } from "../_shared/r2.ts";
import { inspectMp4Moov, validateMp4Samples } from "../_shared/media-inspection.ts";

const uuid = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capacity"), available_bytes: z.number().int().nonnegative().max(1024 ** 4) }).strict(),
  z.object({ action: z.literal("claim") }).strict(),
  z.object({ action: z.literal("heartbeat"), job_id: uuid, lease_token: uuid }).strict(),
  z.object({ action: z.literal("fail"), job_id: uuid, lease_token: uuid, code: z.enum(["processing_failed", "capacity", "storage", "source_changed", "output_invalid", "cancelled"]) }).strict(),
  z.object({ action: z.literal("finish"), job_id: uuid, lease_token: uuid, attempt_id: uuid, output_key: z.string().min(1).max(1024), output_etag: z.string().min(1).max(128), output_bytes: z.number().int().positive().max(5_497_558_138_880), sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(), duration: z.number().positive().max(86400) }).strict(),
]);

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

serve(async (req) => {
  if (!constantTimeEqual(req.headers.get("x-media-processor-token") ?? "", env("MEDIA_PROCESSOR_TOKEN")))
    throw new HttpError(401, "Processor authentication required");
  const input = schema.parse(await jsonBody(req));
  const db = admin();
  if (input.action === "capacity")
    return { max_source_bytes: checked(await db.rpc("set_media_processor_capacity", { p_available: input.available_bytes })) };
  if (input.action === "claim") {
    const { data, error } = await db.rpc("claim_media_processing_job", { p_lease_seconds: 300 });
    if (error) throw new HttpError(503, "Could not claim processing work");
    return { job: data };
  }
  if (input.action === "heartbeat")
    return { ok: checked(await db.rpc("heartbeat_media_processing_job", { p_job: input.job_id, p_token: input.lease_token, p_lease_seconds: 300 })) };
  if (input.action === "fail")
    return { ok: checked(await db.rpc("fail_media_processing_job", { p_job: input.job_id, p_token: input.lease_token, p_error: input.code })) };

  const job = checked(await db.rpc("backend_processing_output", { p_job: input.job_id, p_token: input.lease_token })) as { output_key: string; source_bytes: number };
  const expectedKey = `processing/${input.job_id}/${input.attempt_id}/film.mp4`;
  if (job.output_key !== expectedKey || input.output_key !== expectedKey) throw new HttpError(409, "Processing attempt is no longer current");
  const head = await r2("HEAD", env("R2_UPLOAD_BUCKET_NAME"), expectedKey, { "If-Match": input.output_etag });
  const bytes = Number(head.headers.get("content-length"));
  const etag = head.headers.get("etag") ?? "";
  const sha = head.headers.get("x-amz-meta-sha256") ?? "";
  if (!head.ok || !Number.isSafeInteger(bytes) || bytes !== input.output_bytes || etag.replace(/^"|"$/g, "") !== input.output_etag.replace(/^"|"$/g, "") || sha !== input.sha256 || head.headers.get("content-type")?.split(";")[0] !== "video/mp4")
    throw new HttpError(422, "Processed object verification failed");
  const file = await readMoov(expectedKey, bytes, etag);
  validateMp4Samples(file.moov, file.fileSize, file.mdatRanges);
  const media = inspectMp4Moov(file.moov);
  if (media.width !== input.width || media.height !== input.height || Math.abs((media.duration_seconds ?? 0) - input.duration) > 0.25)
    throw new HttpError(422, "Processed media metadata mismatch");
  return { ok: checked(await db.rpc("finish_media_processing_job", { p_job: input.job_id, p_token: input.lease_token, p_output_etag: etag, p_output_bytes: bytes, p_sha256: sha, p_width: media.width, p_height: media.height, p_duration: media.duration_seconds })) };
});
