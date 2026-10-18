import { z } from "zod";
import {
  multipartSchema,
  isMultipartAction,
  handleMultipart,
} from "../_shared/multipart.ts";
import {
  serve,
  auth,
  admin,
  checked,
  env,
  HttpError,
  jsonBody,
  rateLimit,
} from "../_shared/http.ts";
import {
  signUpload,
  r2,
  readRange,
  readMoov,
  copyPublic,
} from "../_shared/r2.ts";
import {
  inspectWebP,
  inspectMp4Moov,
  validateMp4Samples,
} from "../_shared/media-inspection.ts";
const basicBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      kind: z.enum(["film", "hook", "poster", "profile_picture"]),
      bytes: z.number().int().positive().max(2147483648),
      content_type: z.enum(["video/mp4", "image/webp"]),
    })
    .strict(),
  z.object({ action: z.literal("complete"), asset_id: z.uuid() }).strict(),
  z.object({ action: z.literal("publish"), film_id: z.uuid() }).strict(),
]);
const bodySchema = z.union([basicBodySchema, multipartSchema]);
type Asset = {
  id: string;
  owner_id: string;
  kind: string;
  object_key: string;
  expected_bytes: number;
  actual_bytes: number | null;
  content_type: string;
  status: string;
  etag: string | null;
  expires_at: string;
  public_key: string | null;
};
async function asset(id: string, owner: string): Promise<Asset> {
  return checked(
    await admin().rpc("backend_asset", { p_id: id, p_owner: owner }),
  ) as Asset;
}
async function promote(a: Asset) {
  if (a.status === "ready") return a;
  if (a.status !== "uploaded" || !a.etag)
    throw new HttpError(409, "Complete and verify media before publishing");
  const token = checked(
    await admin().rpc("backend_begin_promotion", {
      p_id: a.id,
      p_owner: a.owner_id,
    }),
  );
  const destination = await copyPublic(
    a.object_key,
    a.id,
    a.etag,
    a.content_type,
    a.actual_bytes ?? a.expected_bytes,
  );
  const result = checked(
    await admin().rpc("backend_finish_promotion", {
      p_id: a.id,
      p_owner: a.owner_id,
      p_token: token,
      p_public_etag: destination.etag,
      p_bytes: destination.bytes,
      p_content_type: destination.contentType,
    }),
  ) as Asset;
  // Delete the current duplicate opportunistically. Ordinary PUT URLs may still
  // recreate it; SQL keeps source_deleted=false until their full safety hold passes.
  try {
    await r2("DELETE", env("R2_UPLOAD_BUCKET_NAME"), a.object_key);
    await admin().rpc("backend_source_deleted", { p_id: a.id });
  } catch {
    /* Scheduled cleanup retries source deletion. */
  }
  return result;
}
async function verifyCompletedAsset(id: string, owner: string) {
  let a = await asset(id, owner);
  if (a.status === "ready" || a.status === "uploaded") {
    if (a.kind === "profile_picture") a = await promote(a);
    return { asset_id: a.id, status: a.status, public_key: a.public_key };
  }
  if (a.status !== "pending" || Date.parse(a.expires_at) < Date.now())
    throw new HttpError(409, "Upload expired");
  const head = await r2("HEAD", env("R2_UPLOAD_BUCKET_NAME"), a.object_key);
  const bytes = Number(head.headers.get("content-length"));
  const etag = head.headers.get("etag");
  if (
    bytes !== Number(a.expected_bytes) ||
    !etag ||
    head.headers.get("content-type")?.split(";")[0] !== a.content_type
  )
    throw new HttpError(
      422,
      "Uploaded size or MIME type differs from reservation",
    );
  let metadata: { width: number; height: number; duration_seconds?: number };
  try {
    if (a.content_type === "image/webp")
      metadata = inspectWebP(await readRange(a.object_key, 0, bytes - 1, etag));
    else {
      const file = await readMoov(a.object_key, bytes, etag);
      validateMp4Samples(file.moov, file.fileSize, file.mdatRanges);
      metadata = inspectMp4Moov(file.moov);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      422,
      "Unsupported or malformed media. Export WebP or H.264/AAC MP4.",
    );
  }
  a = checked(
    await admin().rpc("backend_verify_asset", {
      p_id: a.id,
      p_owner: owner,
      p_bytes: bytes,
      p_etag: etag,
      p_width: metadata.width,
      p_height: metadata.height,
      p_duration: metadata.duration_seconds ?? null,
    }),
  ) as Asset;
  // Profile images are deliberately public; film media remains private until explicit publication.
  if (a.kind === "profile_picture") a = await promote(a);
  return { asset_id: a.id, status: a.status, public_key: a.public_key };
}
serve(async (req) => {
  const { client, user } = await auth(req);
  const b = bodySchema.parse(await jsonBody(req));
  await rateLimit(user.id, "media", 120);
  // Fail before reserving quota if credentials have not been configured.
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_UPLOAD_BUCKET_NAME",
    "R2_BUCKET_NAME",
  ])
    env(key);
  if (isMultipartAction(b))
    return handleMultipart(b, user.id, verifyCompletedAsset);
  if (b.action === "create") {
    const a = checked(
      await client.rpc("reserve_upload", {
        p_kind: b.kind,
        p_bytes: b.bytes,
        p_content_type: b.content_type,
      }),
    ) as Asset;
    return {
      asset_id: a.id,
      ...(await signUpload(a.object_key, b.bytes, b.content_type)),
    };
  }
  if (b.action === "complete") return verifyCompletedAsset(b.asset_id, user.id);
  const f = checked(
    await client
      .from("films")
      .select("*")
      .eq("id", b.film_id)
      .eq("owner_id", user.id)
      .single(),
  );
  if (
    !f.hook_asset_id ||
    !f.poster_asset_id ||
    (f.source === "r2_native" && !f.film_asset_id)
  )
    throw new HttpError(409, "Film, hook and poster assets are required");
  const profile = checked(
    await client
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single(),
  );
  if (!profile.onboarding_completed)
    throw new HttpError(409, "Complete onboarding first");
  const ids = [
    f.hook_asset_id,
    f.poster_asset_id,
    ...(f.source === "r2_native" ? [f.film_asset_id] : []),
  ] as string[];
  const assets = await Promise.all(ids.map((id) => asset(id, user.id)));
  if (assets.some((a) => !["uploaded", "ready"].includes(a.status)))
    throw new HttpError(409, "Verify all assets before publication");
  for (const a of assets) await promote(a);
  return checked(await client.rpc("publish_film", { p_film_id: f.id }));
});
