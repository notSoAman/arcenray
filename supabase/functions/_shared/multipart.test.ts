import { strict as assert } from "node:assert";
import { multipartSchema, multipartDescriptor } from "./multipart.ts";

const id = "50000000-0000-4000-8000-000000000001";
Deno.test(
  "multipart request contracts reject caller-controlled storage and ownership",
  () => {
    const valid = {
      action: "multipart_create",
      draft_id: id,
      request_id: id,
      bytes: 20,
      content_type: "video/mp4",
      fingerprint: "a".repeat(64),
    };
    assert.ok(multipartSchema.safeParse(valid).success);
    for (const extra of [
      { owner_id: id },
      { upload_id: "secret" },
      { object_key: "foreign" },
    ])
      assert.equal(
        multipartSchema.safeParse({ ...valid, ...extra }).success,
        false,
      );
    for (const part_numbers of [[], [1, 1], [0], [10001], [1, 2, 3]])
      assert.equal(
        multipartSchema.safeParse({
          action: "multipart_sign",
          asset_id: id,
          part_numbers,
        }).success,
        false,
      );
  },
);

Deno.test(
  "multipart browser descriptors never expose private keys, provider IDs or leases",
  () => {
    const row = {
      asset_id: id,
      owner_id: id,
      draft_id: id,
      object_key: "private/key",
      bytes: 20,
      fingerprint: "a".repeat(64),
      upload_id: "provider-secret",
      status: "uploading" as const,
      resume_expires_at: "2099-01-01T00:00:00Z",
      op_token: id,
      op_until: "2099-01-01T00:00:00Z",
      part_size: 16777216 as const,
      part_count: 1,
      asset_status: "pending",
      public_key: null,
    };
    const descriptor = multipartDescriptor(row);
    for (const key of [
      "owner_id",
      "object_key",
      "upload_id",
      "op_token",
      "op_until",
    ])
      assert.equal(key in descriptor, false);
    assert.equal(
      multipartDescriptor({ ...row, asset_status: "ready" }).status,
      "ready",
    );
    assert.equal(
      multipartDescriptor({ ...row, asset_status: "deleting" }).status,
      "aborting",
    );
    assert.equal(
      multipartDescriptor({ ...row, resume_expires_at: "2000-01-01T00:00:00Z" })
        .status,
      "expired",
    );
    assert.throws(() => multipartDescriptor({ ...row, draft_id: null }));
  },
);
