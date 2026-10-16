import { z } from "zod";
import {
  serve,
  admin,
  checked,
  env,
  HttpError,
  jsonBody,
} from "../_shared/http.ts";
import { r2 } from "../_shared/r2.ts";
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
  const assets = checked(await admin().rpc("backend_claim_expired_assets")) as {
    id: string;
    object_key: string;
  }[];
  let released = 0;
  for (const asset of assets) {
    await r2("DELETE", env("R2_UPLOAD_BUCKET_NAME"), asset.object_key);
    const { error } = await admin().rpc("backend_release_asset", {
      p_id: asset.id,
    });
    if (error) throw new HttpError(500, "Cleanup accounting failed");
    released++;
  }
  const duplicates = checked(
    await admin().rpc("backend_duplicate_sources"),
  ) as { id: string; object_key: string }[];
  for (const a of duplicates) {
    await r2("DELETE", env("R2_UPLOAD_BUCKET_NAME"), a.object_key);
    const { error } = await admin().rpc("backend_source_deleted", {
      p_id: a.id,
    });
    if (error) throw new HttpError(500, "Source cleanup accounting failed");
  }
  return { released, duplicates_removed: duplicates.length };
});
