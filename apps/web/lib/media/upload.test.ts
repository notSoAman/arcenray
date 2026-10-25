import assert from "node:assert/strict";
import { test } from "node:test";
import { createUploadTask, type MediaApi } from "./upload.ts";
import { validateUpload, validateVideo } from "./validation.ts";

const id = "10000000-0000-0000-0000-000000000001";
const blob = new Blob(["test"], { type: "video/mp4" });
const receipt = { asset_id: id, status: "uploaded", public_key: null };
class FakeXHR {
  static sent: FakeXHR[] = [];
  static modes: ("ok" | "error" | "pending")[] = [];
  upload: { onprogress?: (event: { loaded: number }) => void } = {};
  headers: Record<string, string> = {};
  status = 200;
  timeout = 0;
  withCredentials = true;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open(method: string) {
    assert.equal(method, "PUT");
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    assert.equal(body, blob);
    FakeXHR.sent.push(this);
    const mode = FakeXHR.modes.shift() ?? "ok";
    queueMicrotask(() => {
      this.upload.onprogress?.({ loaded: body.size });
      if (mode === "ok") this.onload?.();
      if (mode === "error") this.onerror?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}
function setup() {
  FakeXHR.sent = [];
  FakeXHR.modes = [];
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  let creates = 0,
    completes = 0;
  const api: MediaApi = {
    async create() {
      creates++;
      return {
        data: {
          asset_id: id,
          upload_url:
            "https://test.r2.cloudflarestorage.com/private/key?signature=secret",
          expires_at: new Date(Date.now() + 600000).toISOString(),
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "4",
            Authorization: "never-forward",
          },
        },
        error: null,
      };
    },
    async complete() {
      completes++;
      return { data: receipt, error: null };
    },
  };
  return { api, counts: () => ({ creates, completes }) };
}

test("preflight rejects MIME, empty and oversized files; accepts portrait and exact hook boundary", () => {
  assert.throws(() => validateUpload("poster", blob));
  assert.throws(() =>
    validateUpload("film", new Blob([], { type: "video/mp4" })),
  );
  assert.throws(() =>
    validateUpload("hook", { type: "video/mp4", size: 51 * 1024 ** 2 } as Blob),
  );
  validateVideo("hook", { width: 720, height: 1280, duration: 30 });
  assert.throws(() =>
    validateVideo("hook", { width: 720, height: 1280, duration: 30.01 }),
  );
  validateUpload("film", { type: "video/mp4", size: 3 * 1024 ** 3 } as Blob);
  assert.doesNotThrow(() =>
    validateVideo("film", { width: 3840, height: 2160, duration: 10 }),
  );
  assert.throws(() =>
    validateVideo("film", { width: 1920, height: 1080, duration: Infinity }),
  );
});

test("verification retry preserves successful PUT and reservation; never forwards auth or Content-Length", async () => {
  const { api, counts } = setup();
  let completeCalls = 0;
  const complete = api.complete;
  api.complete = async (id) =>
    ++completeCalls === 1
      ? { data: null, error: new Error("offline") }
      : complete(id);
  const task = createUploadTask("film", blob, api);
  await assert.rejects(task.start(), /verification failed/);
  assert.equal(task.state.stage, "error");
  assert.equal(task.state.assetId, id);
  assert.deepEqual(await task.start(), receipt);
  assert.equal(task.state.stage, "complete");
  assert.equal(task.state.bytesSent, blob.size);
  assert.equal(FakeXHR.sent.length, 1);
  assert.equal(counts().creates, 1);
  assert.deepEqual(FakeXHR.sent[0]?.headers, { "Content-Type": "video/mp4" });
  assert.equal(FakeXHR.sent[0]?.withCredentials, false);
  await task.start();
  assert.equal(completeCalls, 2);
});

test("network retry reuses signed reservation instead of allocating quota again", async () => {
  const { api, counts } = setup();
  FakeXHR.modes = ["error", "ok"];
  const task = createUploadTask("film", blob, api);
  await assert.rejects(task.start(), /connection failed/);
  await task.start();
  assert.equal(counts().creates, 1);
  assert.equal(counts().completes, 1);
  assert.equal(FakeXHR.sent.length, 2);
});

test("cancel during PUT stops verification and permits explicit retry", async () => {
  const { api, counts } = setup();
  FakeXHR.modes = ["pending", "ok"];
  const task = createUploadTask("film", blob, api);
  const pending = task.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(task.start(), /already running/);
  task.cancel();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(task.state.stage, "cancelled");
  assert.equal(counts().completes, 0);
  await task.start();
  assert.equal(counts().creates, 1);
});

test("cancel during reservation retains returned asset without sending bytes", async () => {
  const { api } = setup();
  const create = api.create;
  let release!: () => void;
  api.create = async (input) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return create(input);
  };
  const task = createUploadTask("film", blob, api);
  const pending = task.start();
  task.cancel();
  release();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(task.state.assetId, id);
  assert.equal(FakeXHR.sent.length, 0);
});

test("expired reservations are replaced and old transferred state is not reused", async (t) => {
  const { api, counts } = setup();
  const realNow = Date.now();
  let now = realNow;
  t.mock.method(Date, "now", () => now);
  const complete = api.complete;
  let calls = 0;
  api.complete = async (id) =>
    ++calls === 1 ? { data: null, error: "offline" } : complete(id);
  const task = createUploadTask("film", blob, api);
  await assert.rejects(task.start());
  now += 600001;
  await task.start();
  assert.equal(counts().creates, 2);
  assert.equal(FakeXHR.sent.length, 2);
});

test("rejects upload destinations outside R2 before sending media", async () => {
  const { api } = setup();
  const create = api.create;
  api.create = async (input) => {
    const reply = await create(input);
    return {
      ...reply,
      data: {
        ...(reply.data as object),
        upload_url: "https://example.com/steal",
      },
    };
  };
  await assert.rejects(
    createUploadTask("film", blob, api).start(),
    /Invalid upload reservation/,
  );
  assert.equal(FakeXHR.sent.length, 0);
});
