import { admin, checked, env, HttpError } from "./http.ts";
import { copyPublic, r2 } from "./r2.ts";

export type Asset = {
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
export async function asset(id: string, owner: string): Promise<Asset> {
  return checked(
    await admin().rpc("backend_asset", { p_id: id, p_owner: owner }),
  ) as Asset;
}
export async function promote(a: Asset) {
  if (a.status === "ready") return a;
  if (a.status !== "uploaded" || !a.etag) {
    throw new HttpError(409, "Complete and verify media before publishing");
  }
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
