import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { fingerprintFilm, type UploadSource } from "@repo/shared/media";
import {
  multipartCreateSchema,
  multipartSignSchema,
  parseFilmLink,
  onboardingChoices,
  validOnboardingChoices,
} from "@repo/shared";
import { externalFilmUrl } from "../src/data.ts";
const digest = async (b: ArrayBuffer) =>
  new Uint8Array(createHash("sha256").update(new Uint8Array(b)).digest())
    .buffer;
test("native range fingerprints match the web manifest and only read bounded slices", async () => {
  const bytes = new Uint8Array(17 * 1024 ** 2);
  bytes[0] = 9;
  bytes[16 * 1024 ** 2] = 7;
  const reads: number[] = [];
  const source: UploadSource = {
    size: bytes.length,
    type: "video/mp4",
    arrayBuffer: async () => {
      throw new Error("whole-file reads forbidden");
    },
    slice(start, end, type = "video/mp4") {
      return {
        size: end - start,
        type,
        arrayBuffer: async () => {
          reads.push(end - start);
          assert.ok(end - start <= 16 * 1024 ** 2);
          return bytes.slice(start, end).buffer;
        },
      };
    },
  };
  const fingerprint = await fingerprintFilm(
    source,
    undefined,
    undefined,
    digest,
  );
  const hashes = [
    bytes.slice(0, 16 * 1024 ** 2),
    bytes.slice(16 * 1024 ** 2),
  ].map((b) => createHash("sha256").update(b).digest("hex"));
  const expected = createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        size: bytes.length,
        type: "video/mp4",
        parts: hashes,
      }),
    )
    .digest("hex");
  assert.equal(fingerprint, expected);
  assert.deepEqual(reads, [16 * 1024 ** 2, 1024 ** 2]);
});
test("shared multipart validators match deployed protocol ceilings without widening signing batches", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const input = {
    draft_id: id,
    request_id: id,
    bytes: 3 * 1024 ** 3,
    content_type: "video/mp4",
    fingerprint: "a".repeat(64),
  };
  assert.ok(multipartCreateSchema.safeParse(input).success);
  assert.equal(
    multipartCreateSchema.safeParse({ ...input, bytes: 5 * 1024 ** 4 + 1 })
      .success,
    false,
  );
  assert.ok(
    multipartSignSchema.safeParse({ asset_id: id, part_numbers: [9999, 10000] })
      .success,
  );
  for (const part_numbers of [[1, 1], [1, 2, 3], [10001], [0]])
    assert.equal(
      multipartSignSchema.safeParse({ asset_id: id, part_numbers }).success,
      false,
    );
});
test("provider playback only builds compliant URLs from approved IDs", () => {
  const film = parseFilmLink("https://youtu.be/abcdefghijk");
  assert.equal(
    externalFilmUrl(film, true),
    "https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1&rel=0",
  );
  assert.equal(
    externalFilmUrl({
      source: "youtube_embed",
      provider_id: "https://evil.test",
    }),
    null,
  );
  assert.equal(
    externalFilmUrl({ source: "vimeo_embed", provider_id: "1?redirect=evil" }),
    null,
  );
  assert.throws(() => parseFilmLink("https://user:pass@vimeo.com/123"));
});
test("web and native onboarding share the twelve allowed choices and exactly-three rule", () => {
  assert.equal(onboardingChoices.length, 12);
  assert.ok(
    validOnboardingChoices(onboardingChoices.slice(0, 3).map((c) => c.id)),
  );
  assert.equal(
    validOnboardingChoices(["musical", "musical", "intimate"]),
    false,
  );
  assert.equal(
    validOnboardingChoices(["unknown", "musical", "intimate"]),
    false,
  );
});

test("native resume rejects a content URI whose bytes changed while paused", async () => {
  const { createMultipartUploadTask } = await import("@repo/shared/media");
  const bytes = new Uint8Array([1, 2, 3]);
  const source: UploadSource = {
    size: bytes.length,
    type: "video/mp4",
    async arrayBuffer() {
      throw new Error("whole-file reads forbidden");
    },
    slice(start, end, type = "video/mp4") {
      return {
        size: end - start,
        type,
        async arrayBuffer() {
          return bytes.slice(start, end).buffer;
        },
      };
    },
  };
  const fingerprint = await fingerprintFilm(
    source,
    undefined,
    undefined,
    digest,
  );
  let statusCalls = 0;
  const unexpected = async () => {
    throw new Error("unexpected mutation");
  };
  const task = createMultipartUploadTask(
    source,
    {
      create: unexpected,
      list: unexpected,
      sign: unexpected,
      finish: unexpected,
      abort: unexpected,
      async status() {
        statusCalls++;
        throw new Error("offline");
      },
    },
    {
      draftId: "20000000-0000-4000-8000-000000000002",
      existing: {
        asset_id: "10000000-0000-4000-8000-000000000001",
        draft_id: "20000000-0000-4000-8000-000000000002",
        bytes: bytes.length,
        fingerprint,
        part_size: 64 * 1024 ** 2,
        part_count: 1,
        resume_expires_at: "2040-01-01T00:00:00.000Z",
        status: "uploading",
      },
      transport: unexpected,
      digest,
      rehashOnStart: true,
      randomId: () => "30000000-0000-4000-8000-000000000003",
    },
  );
  await assert.rejects(task.start(), /offline/);
  bytes[1] = 9;
  await assert.rejects(task.start(), /does not match/);
  assert.equal(
    statusCalls,
    1,
    "changed bytes must be rejected before signing or status reconciliation",
  );
});
