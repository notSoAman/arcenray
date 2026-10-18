import { z } from "zod";
import { admin, checked, HttpError } from "./http.ts";
import {
  createMultipartStorage,
  FILM_PART_BYTES,
  signFilmParts,
  validateStoredParts,
} from "./multipart-storage.ts";

export const multipartSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("multipart_create"),
      draft_id: z.uuid(),
      request_id: z.uuid(),
      bytes: z.number().int().positive().max(2147483648),
      content_type: z.literal("video/mp4"),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({ action: z.literal("multipart_list"), draft_id: z.uuid() })
    .strict(),
  z
    .object({ action: z.literal("multipart_status"), asset_id: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal("multipart_sign"),
      asset_id: z.uuid(),
      part_numbers: z
        .array(z.number().int().min(1).max(128))
        .min(1)
        .max(2)
        .refine((x) => new Set(x).size === x.length),
    })
    .strict(),
  z
    .object({ action: z.literal("multipart_finish"), asset_id: z.uuid() })
    .strict(),
  z
    .object({ action: z.literal("multipart_abort"), asset_id: z.uuid() })
    .strict(),
]);
export type MultipartAction = z.infer<typeof multipartSchema>;
export function isMultipartAction(value: {
  action: string;
}): value is MultipartAction {
  return [
    "multipart_create",
    "multipart_list",
    "multipart_status",
    "multipart_sign",
    "multipart_finish",
    "multipart_abort",
  ].includes(value.action);
}
const snapshotSchema = z.object({
  asset_id: z.uuid(),
  owner_id: z.uuid(),
  draft_id: z.uuid().nullable(),
  object_key: z.string(),
  bytes: z.number().int().positive().max(2147483648),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  upload_id: z.string().nullable(),
  status: z.enum([
    "initializing",
    "uploading",
    "completing",
    "completed",
    "aborting",
    "aborted",
  ]),
  resume_expires_at: z.iso.datetime({ offset: true }),
  op_token: z.uuid().nullable(),
  op_until: z.iso.datetime({ offset: true }).nullable(),
  part_size: z.literal(FILM_PART_BYTES),
  part_count: z.number().int().min(1).max(128),
  asset_status: z.string(),
  public_key: z.string().nullable(),
});
type Snapshot = z.infer<typeof snapshotSchema>;
type Receipt = { asset_id: string; status: string; public_key: string | null };
type Verify = (id: string, owner: string) => Promise<Receipt>;
function snapshot(value: unknown, owner: string) {
  const record = snapshotSchema.parse(value);
  if (record.owner_id !== owner)
    throw new HttpError(403, "Upload not permitted");
  if (record.part_count !== Math.ceil(record.bytes / FILM_PART_BYTES))
    throw new HttpError(500, "Invalid multipart reservation");
  return record;
}
function receipt(row: Snapshot): Receipt | null {
  return ["uploaded", "ready"].includes(row.asset_status)
    ? {
        asset_id: row.asset_id,
        status: row.asset_status,
        public_key: row.public_key,
      }
    : null;
}
export function multipartDescriptor(row: Snapshot) {
  if (!row.draft_id)
    throw new HttpError(410, "The draft was removed; upload cleanup is queued");
  let status: string = row.status === "completed" ? "completing" : row.status;
  if (receipt(row)) status = row.asset_status;
  else if (row.asset_status === "rejected") status = "aborted";
  else if (row.asset_status === "deleting") status = "aborting";
  else if (
    Date.parse(row.resume_expires_at) <= Date.now() &&
    ["initializing", "uploading"].includes(row.status)
  )
    status = "expired";
  return {
    asset_id: row.asset_id,
    draft_id: row.draft_id,
    bytes: row.bytes,
    fingerprint: row.fingerprint,
    part_size: FILM_PART_BYTES,
    part_count: row.part_count,
    resume_expires_at: row.resume_expires_at,
    status,
  };
}
async function load(owner: string, id: string) {
  return snapshot(
    checked(
      await admin().rpc("backend_multipart", { p_owner: owner, p_asset: id }),
    ),
    owner,
  );
}
const storage = createMultipartStorage();
async function initialize(row: Snapshot, owner: string) {
  if (row.upload_id || row.status !== "initializing") return row;
  row = snapshot(
    checked(
      await admin().rpc("backend_claim_multipart_operation", {
        p_owner: owner,
        p_asset: row.asset_id,
        p_operation: "initialize",
      }),
    ),
    owner,
  );
  if (row.upload_id) return row;
  if (!row.op_token)
    throw new HttpError(
      409,
      "Upload initialization is still running; retry shortly",
    );
  const id = await storage.initialize(row.object_key);
  // A lost callback response is ambiguous: do not abort an ID another retry may
  // already have recovered. Durable exact-key cleanup covers a rejected callback.
  return snapshot(
    checked(
      await admin().rpc("backend_initialize_multipart", {
        p_owner: owner,
        p_asset: row.asset_id,
        p_token: row.op_token,
        p_upload_id: id,
      }),
    ),
    owner,
  );
}
async function assembled(row: Snapshot, owner: string, verify: Verify) {
  if (receipt(row)) return receipt(row)!;
  if (row.status === "completed") return verify(row.asset_id, owner);
  if (row.status !== "completing" || !row.op_token) return null;
  const head = await storage.head(row.object_key);
  if (!head) return null;
  if (head.bytes !== row.bytes)
    throw new HttpError(
      409,
      "Assembled film size differs from its reservation",
    );
  const completed = await admin().rpc("backend_complete_multipart", {
    p_owner: owner,
    p_asset: row.asset_id,
    p_token: row.op_token,
  });
  if (completed.error) return null; // Live/expired worker will reconcile on finish.
  return verify(row.asset_id, owner);
}

export async function handleMultipart(
  b: MultipartAction,
  owner: string,
  verify: Verify,
) {
  if (b.action === "multipart_list") {
    const values = checked(
      await admin().rpc("backend_list_multipart", {
        p_owner: owner,
        p_draft: b.draft_id,
      }),
    );
    if (!Array.isArray(values)) throw new HttpError(500, "Invalid upload list");
    return {
      uploads: values.map((value) =>
        multipartDescriptor(snapshot(value, owner)),
      ),
    };
  }
  if (b.action === "multipart_create") {
    const row = snapshot(
      checked(
        await admin().rpc("backend_create_multipart", {
          p_owner: owner,
          p_draft: b.draft_id,
          p_request: b.request_id,
          p_bytes: b.bytes,
          p_fingerprint: b.fingerprint,
        }),
      ),
      owner,
    );
    return multipartDescriptor(await initialize(row, owner));
  }
  if (b.action === "multipart_abort") {
    const row = snapshot(
      checked(
        await admin().rpc("backend_abort_multipart", {
          p_owner: owner,
          p_asset: b.asset_id,
        }),
      ),
      owner,
    );
    return { status: row.asset_status === "rejected" ? "aborted" : "aborting" };
  }
  let row = await load(owner, b.asset_id);
  if (b.action === "multipart_sign") {
    row = snapshot(
      checked(
        await admin().rpc("backend_sign_multipart", {
          p_owner: owner,
          p_asset: b.asset_id,
        }),
      ),
      owner,
    );
    if (!row.upload_id) throw new HttpError(409, "Upload is not initialized");
    return {
      parts: await signFilmParts(
        row.object_key,
        row.upload_id,
        row.bytes,
        b.part_numbers,
      ),
    };
  }
  if (b.action === "multipart_status") {
    const saved = await assembled(row, owner, verify);
    if (saved) {
      row = await load(owner, row.asset_id);
      return { ...multipartDescriptor(row), parts: [], receipt: saved };
    }
    if (row.status === "initializing") row = await initialize(row, owner);
    // Return the state even while a completion lease exists. The browser must
    // reach finish to recover an expired lease after a failed provider request.
    if (row.status !== "uploading" || !row.upload_id)
      return { ...multipartDescriptor(row), parts: [], receipt: receipt(row) };
    const parts = await storage.parts(row.object_key, row.upload_id);
    if (parts === null)
      throw new HttpError(
        409,
        "This upload session is unavailable. Discard it before starting again",
      );
    const valid = parts.filter(
      (p) =>
        p.part_number <= row.part_count &&
        p.bytes ===
          Math.min(
            FILM_PART_BYTES,
            row.bytes - (p.part_number - 1) * FILM_PART_BYTES,
          ),
    );
    return {
      ...multipartDescriptor(row),
      parts: valid.map(({ part_number, bytes }) => ({ part_number, bytes })),
      receipt: null,
    };
  }
  const saved = await assembled(row, owner, verify);
  if (saved) return saved;
  row = snapshot(
    checked(
      await admin().rpc("backend_claim_multipart_operation", {
        p_owner: owner,
        p_asset: row.asset_id,
        p_operation: "complete",
      }),
    ),
    owner,
  );
  if (row.status === "completed") return verify(row.asset_id, owner);
  if (!row.upload_id || !row.op_token)
    throw new HttpError(409, "Upload is not ready for completion");
  const recovered = await assembled(row, owner, verify);
  if (recovered) return recovered;
  const parts = await storage.parts(row.object_key, row.upload_id);
  if (parts === null)
    throw new HttpError(
      409,
      "Film assembly could not be confirmed; retry status before discarding",
    );
  try {
    validateStoredParts(row.bytes, parts);
  } catch (error) {
    // ListParts is present and no CompleteMultipart request has started: release
    // only this exact lease so missing/overwritten parts can be retried immediately.
    await admin().rpc("backend_release_multipart_operation", {
      p_owner: owner,
      p_asset: row.asset_id,
      p_token: row.op_token,
    });
    throw error;
  }
  await storage.complete(row.object_key, row.upload_id, row.bytes, parts);
  checked(
    await admin().rpc("backend_complete_multipart", {
      p_owner: owner,
      p_asset: row.asset_id,
      p_token: row.op_token,
    }),
  );
  return verify(row.asset_id, owner);
}
