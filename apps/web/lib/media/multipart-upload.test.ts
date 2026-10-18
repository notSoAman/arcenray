import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMultipartUploadTask,
  fingerprintFilm,
  MULTIPART_PART_SIZE as chunk,
  type MultipartApi,
  type MultipartCheckpoint,
  type MultipartDescriptor,
} from "./multipart-upload.ts";
const asset = "10000000-0000-0000-0000-000000000001",
  draft = "20000000-0000-0000-0000-000000000002";
const verified = {
  asset_id: asset,
  status: "uploaded" as const,
  public_key: null,
};
function film(bytes = 17) {
  return new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
}
function harness(blob: Blob) {
  let checkpoint: MultipartCheckpoint | null = null;
  let created: MultipartDescriptor | undefined;
  let creates = 0,
    signs = 0,
    finishes = 0,
    aborts = 0,
    committed = false;
  let time = 1800000000000;
  const present = new Map<number, number>();
  const transfers: {
    bytes: number;
    headers: Record<string, string>;
    url: string;
  }[] = [];
  const port = {
    async read() {
      return checkpoint;
    },
    async write(value: MultipartCheckpoint) {
      checkpoint = { ...value };
    },
    async clear() {
      checkpoint = null;
    },
  };
  const api: MultipartApi = {
    async create(value) {
      creates++;
      created ??= {
        asset_id: asset,
        draft_id: draft,
        bytes: value.bytes,
        fingerprint: value.fingerprint,
        part_size: chunk,
        part_count: Math.ceil(blob.size / chunk),
        resume_expires_at: new Date(time + 86400000).toISOString(),
        status: "uploading",
      };
      return { data: created, error: null };
    },
    async list() {
      return { data: created ? [created] : [], error: null };
    },
    async status() {
      if (!created) throw new Error("Not created");
      return {
        data: {
          ...created,
          status: committed ? "uploaded" : created.status,
          parts: [...present].map(([part_number, bytes]) => ({
            part_number,
            bytes,
          })),
          receipt: committed ? verified : null,
        },
        error: null,
      };
    },
    async sign(value) {
      signs++;
      return {
        data: {
          parts: value.part_numbers.map((number) => ({
            part_number: number,
            bytes: Math.min(chunk, blob.size - (number - 1) * chunk),
            upload_url: `https://test.r2.cloudflarestorage.com/bucket/key?partNumber=${number}`,
            headers: {
              "Content-Type": "video/mp4",
              Authorization: "must-not-forward",
              "Content-Length": "must-not-forward",
            },
            expires_at: new Date(time + 600000).toISOString(),
          })),
        },
        error: null,
      };
    },
    async finish() {
      finishes++;
      committed = true;
      return { data: verified, error: null };
    },
    async abort() {
      aborts++;
      return { data: { status: "aborted" }, error: null };
    },
  };
  const transport = async (
    url: string,
    headers: Record<string, string>,
    slice: Blob,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ) => {
    signal.throwIfAborted();
    transfers.push({ bytes: slice.size, headers, url });
    present.set(
      Number(new URL(url).searchParams.get("partNumber")),
      slice.size,
    );
    progress(slice.size);
  };
  return {
    api,
    port,
    transport,
    present,
    transfers,
    get descriptor() {
      return created;
    },
    get checkpoint() {
      return checkpoint;
    },
    counts: () => ({ creates, signs, finishes, aborts }),
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
    commit: () => {
      committed = true;
    },
  };
}

test("an unfinished completion can reach finish after reload without retransmitting parts", async () => {
  const blob = film(), h = harness(blob);
  const original = h.api.status;
  h.api.status = async (assetId) => {
    const reply = await original(assetId);
    return { ...reply, data: { ...(reply.data as object), status: "completing", parts: [] } };
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft, checkpoint: h.port, transport: h.transport, now: h.now,
  });
  assert.deepEqual(await task.start(), verified);
  assert.equal(h.counts().finishes, 1);
  assert.equal(h.counts().signs, 0);
  assert.equal(h.transfers.length, 0);
});

test("multipart hashes/sends bounded slices and never forwards auth or Content-Length", async () => {
  const blob = film(chunk + 7),
    h = harness(blob);
  let largest = 0;
  const original = blob.slice.bind(blob);
  blob.arrayBuffer = async () => {
    throw new Error("Whole film buffering forbidden");
  };
  blob.slice = (start, end, type) => {
    const result = original(start, end, type);
    largest = Math.max(largest, result.size);
    return result;
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport: h.transport,
    now: h.now,
  });
  assert.deepEqual(await task.start(), verified);
  assert.equal(largest, chunk);
  assert.deepEqual(
    h.transfers.map((t) => t.bytes),
    [chunk, 7],
  );
  for (const transfer of h.transfers)
    assert.deepEqual(transfer.headers, { "Content-Type": "video/mp4" });
  assert.deepEqual(h.counts(), {
    creates: 1,
    signs: 1,
    finishes: 1,
    aborts: 0,
  });
  assert.equal(h.checkpoint, null);
});

test("reselect rejects same-sized different file fingerprints before uploading", async () => {
  const blob = film(),
    h = harness(blob);
  const descriptor: MultipartDescriptor = {
    asset_id: asset,
    draft_id: draft,
    bytes: blob.size,
    fingerprint: "a".repeat(64),
    part_size: chunk,
    part_count: 1,
    resume_expires_at: new Date(h.now() + 86400000).toISOString(),
    status: "uploading",
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    existing: descriptor,
    checkpoint: h.port,
    transport: h.transport,
    now: h.now,
  });
  await assert.rejects(task.start(), /does not match/);
  assert.equal(h.transfers.length, 0);
  assert.equal(h.counts().creates, 0);
});

test("failed transfer retries canonical missing parts with one reservation across reload", async () => {
  const blob = film(chunk + 5),
    h = harness(blob);
  let fail = true;
  const transport: typeof h.transport = async (...args) => {
    if (Number(new URL(args[0]).searchParams.get("partNumber")) === 2 && fail) {
      fail = false;
      throw new Error("offline");
    }
    await h.transport(...args);
  };
  const first = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport,
    now: h.now,
  });
  await assert.rejects(first.start(), /offline/);
  assert.equal(h.checkpoint?.asset_id, asset);
  const reloaded = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport,
    now: h.now,
  });
  await reloaded.start();
  assert.deepEqual(
    h.transfers.map((t) => new URL(t.url).searchParams.get("partNumber")),
    ["1", "2"],
  );
  assert.equal(h.counts().creates, 1);
});

test("slow second part refreshes expired URL on the same asset", async () => {
  const blob = film(chunk + 3),
    h = harness(blob);
  const transport: typeof h.transport = async (...args) => {
    await h.transport(...args);
    h.advance(601000);
  };
  await createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport,
    now: h.now,
  }).start();
  assert.equal(h.counts().creates, 1);
  assert.equal(h.counts().signs, 2);
});

test("pause aborts transport, retains reservation, and explicit discard calls server abort", async () => {
  const blob = film(),
    h = harness(blob);
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    now: h.now,
    transport: async (_url, _headers, _blob, signal) => {
      began();
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Paused", "AbortError")),
          { once: true },
        ),
      );
    },
  });
  const pending = task.start();
  await started;
  task.pause();
  await assert.rejects(pending);
  assert.equal(task.state.stage, "paused");
  assert.equal(h.counts().aborts, 0);
  assert.equal(h.checkpoint?.asset_id, asset);
  assert.equal(await task.discard(), "aborted");
  assert.equal(h.counts().aborts, 1);
  assert.equal(h.checkpoint, null);
});

test("lost finish response recovers verified canonical receipt without another upload", async () => {
  const blob = film(),
    h = harness(blob);
  h.api.finish = async () => {
    h.commit();
    return { data: null, error: new Error("Response lost") };
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport: h.transport,
    now: h.now,
  });
  assert.deepEqual(await task.start(), verified);
  assert.equal(task.state.stage, "complete");
  assert.equal(h.transfers.length, 1);
  assert.equal(h.counts().creates, 1);
});

test("server duplicate/out-of-range part lists fail closed", async () => {
  for (const parts of [
    [
      { part_number: 1, bytes: 17 },
      { part_number: 1, bytes: 17 },
    ],
    [{ part_number: 2, bytes: 17 }],
    [{ part_number: 1, bytes: 18 }],
  ]) {
    const blob = film(),
      h = harness(blob);
    const original = h.api.status;
    h.api.status = async (id) => {
      const result = await original(id);
      return {
        data: { ...(result.data as Record<string, unknown>), parts },
        error: null,
      };
    };
    await assert.rejects(
      createMultipartUploadTask(blob, h.api, {
        draftId: draft,
        transport: h.transport,
        now: h.now,
      }).start(),
      /Invalid multipart part list/,
    );
    assert.equal(h.transfers.length, 0);
  }
});

test("lost create reply retries the same persisted idempotency UUID", async () => {
  const blob = film(),
    h = harness(blob),
    original = h.api.create;
  const requests: string[] = [];
  h.api.create = async (input) => {
    requests.push(input.request_id);
    const result = await original(input);
    if (requests.length === 1) return { data: null, error: new Error("lost") };
    return result;
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport: h.transport,
    now: h.now,
  });
  await assert.rejects(task.start(), /same reservation/);
  await task.start();
  assert.equal(new Set(requests).size, 1);
});

test("fingerprinting is abortable before hashing and checks content beyond file metadata", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fingerprintFilm(film(), controller.signal));
  assert.notEqual(
    await fingerprintFilm(new Blob(["same-size-a"], { type: "video/mp4" })),
    await fingerprintFilm(new Blob(["same-size-b"], { type: "video/mp4" })),
  );
});

test("canonical resume retransfers a formerly successful part when storage no longer has it", async () => {
  const blob = film(chunk + 3),
    h = harness(blob);
  let fails = true;
  const transport: typeof h.transport = async (...args) => {
    if (new URL(args[0]).searchParams.get("partNumber") === "2" && fails) {
      fails = false;
      throw new Error("connection lost");
    }
    await h.transport(...args);
  };
  const task = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport,
    now: h.now,
  });
  await assert.rejects(task.start());
  h.present.delete(1);
  await task.start();
  assert.deepEqual(
    h.transfers.map((t) => new URL(t.url).searchParams.get("partNumber")),
    ["1", "1", "2"],
  );
  assert.equal(h.counts().creates, 1);
});

test("invalid signed destinations fail before transmitting media", async () => {
  const blob = film(),
    h = harness(blob),
    sign = h.api.sign;
  h.api.sign = async (input) => {
    const reply = await sign(input);
    const value = reply.data as { parts: { upload_url: string }[] };
    value.parts[0]!.upload_url = "https://attacker.test/upload";
    return reply;
  };
  await assert.rejects(
    createMultipartUploadTask(blob, h.api, {
      draftId: draft,
      transport: h.transport,
      now: h.now,
    }).start(),
    /Invalid signed part/,
  );
  assert.equal(h.transfers.length, 0);
});

test("discard after reload recovers the existing checkpoint without creating another reservation", async () => {
  const blob = film(),
    h = harness(blob);
  const first = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    now: h.now,
    transport: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(first.start());
  const reloaded = createMultipartUploadTask(blob, h.api, {
    draftId: draft,
    checkpoint: h.port,
    transport: h.transport,
    now: h.now,
  });
  assert.equal(await reloaded.discard(), "aborted");
  assert.equal(h.counts().creates, 1);
  assert.equal(h.counts().aborts, 1);
  assert.equal(h.checkpoint, null);
  await assert.rejects(reloaded.start(), /discarded/);
});

test("browser checkpoints are scoped per profile/draft and persist no URLs or credentials", async () => {
  const { multipartCheckpoint } = await import("./multipart-checkpoint.ts");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    const owner = "30000000-0000-0000-0000-000000000003",
      another = "40000000-0000-0000-0000-000000000004";
    const checkpoint = {
      request_id: asset,
      asset_id: asset,
      draft_id: draft,
      fingerprint: "a".repeat(64),
      bytes: 17,
      Authorization: "must-not-persist",
      upload_url: "must-not-persist",
    };
    await multipartCheckpoint(owner, draft).write(checkpoint);
    assert.equal(await multipartCheckpoint(another, draft).read(), null);
    assert.equal(await multipartCheckpoint(owner, another).read(), null);
    assert.deepEqual(Object.keys(JSON.parse([...values.values()][0]!)).sort(), [
      "asset_id",
      "bytes",
      "draft_id",
      "fingerprint",
      "request_id",
    ]);
    assert.equal(
      (await multipartCheckpoint(owner, draft).read())?.asset_id,
      asset,
    );
    values.set(
      [...values.keys()][0]!,
      JSON.stringify({ ...checkpoint, draft_id: another }),
    );
    await assert.rejects(
      multipartCheckpoint(owner, draft).read(),
      /unreadable/,
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
