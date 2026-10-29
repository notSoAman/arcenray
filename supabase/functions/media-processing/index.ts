import { publishNextFilm } from "../_shared/queued-publication.ts";
import { z } from "zod";
import {
  admin,
  checked,
  env,
  HttpError,
  jsonBody,
  serve,
} from "../_shared/http.ts";
import { readMoov, r2 } from "../_shared/r2.ts";
import {
  inspectMp4Moov,
  validateMp4Samples,
} from "../_shared/media-inspection.ts";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }).strict(),
  z
    .object({
      action: z.literal("capacity"),
      available_bytes: z.number().int().nonnegative().max(1099511627776),
    })
    .strict(),
  z
    .object({
      action: z.literal("heartbeat"),
      job_id: z.uuid(),
      lease_token: z.uuid(),
      stage: z
        .enum(["downloading", "encoding", "checking", "uploading"])
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      job_id: z.uuid(),
      lease_token: z.uuid(),
      output_etag: z.string().min(1).max(128),
      output_bytes: z.number().int().positive().max(5497558138880),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("fail"),
      job_id: z.uuid(),
      lease_token: z.uuid(),
      error: z.enum([
        "processing_failed",
        "capacity",
        "storage",
        "source_changed",
        "output_invalid",
        "cancelled",
        "multiple_tracks",
        "hdr_unsupported",
        "unsupported_media",
        "invalid_media",
        "processing_timeout",
      ]),
    })
    .strict(),
]);

function authorize(req: Request) {
  const supplied = req.headers.get("x-media-processor-secret") ?? "";
  const expected = env("MEDIA_PROCESSOR_SECRET");
  const a = new TextEncoder().encode(supplied),
    b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff) throw new HttpError(401, "Processor authentication required");
}

serve(async (req) => {
  authorize(req);
  const body = bodySchema.parse(await jsonBody(req));
  const db = admin();
  if (body.action === "capacity") {
    const max = checked(
      await db.rpc("set_media_processor_capacity", {
        p_available: body.available_bytes,
      }),
    );
    return { max_source_bytes: max, heartbeat_at: new Date().toISOString() };
  }
  if (body.action === "claim") {
    // Reuses the existing worker poll; requests survive closed browsers/restarts.
    // Publication failures have their own bounded retry and never block encoding.
    await publishNextFilm().catch(() => {});
    const { data, error } = await db.rpc("backend_claim_media_processing_job", {
      p_lease_seconds: 300,
    });
    if (error) throw new HttpError(503, "Processing queue unavailable");
    return { job: data };
  }
  if (body.action === "heartbeat") {
    return {
      active: checked(
        body.stage
          ? await db.rpc("backend_heartbeat_media_processing_progress", {
              p_job: body.job_id,
              p_token: body.lease_token,
              p_stage: body.stage,
            })
          : await db.rpc("backend_heartbeat_media_processing_job", {
              p_job: body.job_id,
              p_token: body.lease_token,
              p_lease_seconds: 300,
            }),
      ),
    };
  }
  if (body.action === "fail") {
    return {
      accepted: checked(
        await db.rpc("backend_fail_media_processing_job", {
          p_job: body.job_id,
          p_token: body.lease_token,
          p_error: body.error,
        }),
      ),
    };
  }

  const lease = checked(
    await db.rpc("backend_processing_output", {
      p_job: body.job_id,
      p_token: body.lease_token,
    }),
  ) as {
    output_key: string;
    completed?: boolean;
    output_etag?: string;
    output_bytes?: number;
    sha256?: string;
  };
  if (lease.completed) {
    if (
      lease.output_etag?.replace(/^"|"$/g, "") !==
        body.output_etag.replace(/^"|"$/g, "") ||
      lease.output_bytes !== body.output_bytes ||
      lease.sha256 !== body.sha256
    )
      throw new HttpError(
        409,
        "Processing receipt does not match the completed film",
      );
    return { completed: true, bytes: lease.output_bytes };
  }
  const head = await r2("HEAD", env("R2_UPLOAD_BUCKET_NAME"), lease.output_key);
  const bytes = Number(head.headers.get("content-length"));
  const etag = head.headers.get("etag") ?? "";
  if (
    bytes !== body.output_bytes ||
    bytes <= 0 ||
    etag.replace(/^"|"$/g, "") !== body.output_etag.replace(/^"|"$/g, "") ||
    head.headers.get("content-type")?.split(";")[0]?.trim() !== "video/mp4"
  )
    throw new HttpError(
      422,
      "Processed media does not match its storage receipt",
    );
  const file = await readMoov(lease.output_key, bytes, etag);
  validateMp4Samples(file.moov, file.fileSize, file.mdatRanges);
  const media = inspectMp4Moov(file.moov);
  if (
    Math.max(media.width, media.height) > 1920 ||
    Math.min(media.width, media.height) > 1080
  )
    throw new HttpError(422, "Processed media failed server validation");
  const saved = checked(
    await db.rpc("backend_finish_media_processing_job", {
      p_job: body.job_id,
      p_token: body.lease_token,
      p_output_etag: etag,
      p_output_bytes: bytes,
      p_sha256: body.sha256,
      p_width: media.width,
      p_height: media.height,
      p_duration: media.duration_seconds,
    }),
  );
  if (!saved)
    throw new HttpError(
      409,
      "Processing lease expired; output remains private",
    );
  return {
    completed: true,
    bytes,
    width: media.width,
    height: media.height,
    duration_seconds: media.duration_seconds,
  };
});
