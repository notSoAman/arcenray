import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exactPurgePayload,
  lifecycleTimeout,
  executeMediaJob,
  MediaJobError,
  validateMediaJob,
  type MediaJob,
  type MediaPorts,
} from "./media-lifecycle.ts";
test("storage timeout shrinks to remaining invocation budget and stops new work at deadline", () => {
  assert.equal(lifecycleTimeout(20000, 5000, 10000), 5000);
  assert.equal(lifecycleTimeout(12000, 10000, 10000), 2000);
  assert.throws(() => lifecycleTimeout(10000, 5000, 10000));
  assert.throws(() => lifecycleTimeout(9999, 5000, 10000));
});
const id = "17000000-0000-0000-0000-000000000001",
  owner = "17000000-0000-0000-0000-000000000002";
const key = `assets/${id}`,
  backup = `quarantine/${id}`;
const original = `${owner}/17000000-0000-0000-0000-000000000003`;
const snapshot = {
  bytes: 128,
  etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  contentType: "video/mp4",
};
function job(action: MediaJob["action"] = "delete"): MediaJob {
  return {
    asset_id: id,
    owner_id: owner,
    object_key: original,
    public_key: key,
    content_type: "video/mp4",
    bytes: 128,
    etag: snapshot.etag,
    action,
    version: 1,
    private_delete_after: "2026-01-01T00:00:00Z",
    state: "processing",
    attempts: 1,
  };
}
function memory() {
  const objects = new Map<string, typeof snapshot>();
  const calls: string[] = [];
  const ports: MediaPorts = {
    async head(area, key) {
      calls.push(`head:${area}:${key}`);
      return objects.get(`${area}:${key}`) ?? null;
    },
    async remove(area, key) {
      calls.push(`delete:${area}:${key}`);
      objects.delete(`${area}:${key}`);
    },
    async copy(from, source, to, destination, etag, type) {
      calls.push(`copy:${from}:${source}:${to}:${destination}`);
      const sourceObject = objects.get(`${from}:${source}`);
      assert.equal(sourceObject?.etag, etag, "copy pins exact source ETag");
      assert.equal(sourceObject?.contentType, type);
      objects.set(`${to}:${destination}`, { ...sourceObject! });
    },
    async purge(key) {
      calls.push(`purge:${key}`);
    },
  };
  return { objects, calls, ports };
}
test("lifecycle refuses cross-owner/traversal/public-key mistakes and invalid snapshots before I/O", async () => {
  for (const changes of [
    { object_key: `${id}/17000000-0000-0000-0000-000000000003` },
    { object_key: `${owner}/../secret` },
    { public_key: "assets/someone-else" },
    { etag: '"bad\r\nheader"' },
    { version: 0 },
    { bytes: 2147483649 },
  ]) {
    const { ports, calls } = memory();
    await assert.rejects(executeMediaJob({ ...job(), ...changes }, ports));
    assert.deepEqual(calls, []);
  }
  assert.throws(() => validateMediaJob({ ...job("restore"), etag: null }));
});
test("purge payload targets only the exact HTTPS asset URL", () => {
  assert.deepEqual(exactPurgePayload("https://cdn.arcenray.com", key), {
    files: [`https://cdn.arcenray.com/${key}`],
  });
  for (const base of [
    "http://cdn.arcenray.com",
    "https://user:password@cdn.arcenray.com",
    "https://cdn.arcenray.com/other",
    "https://cdn.arcenray.com?all=true",
  ])
    assert.throws(() => exactPurgePayload(base, key));
  assert.throws(() =>
    exactPurgePayload("https://cdn.arcenray.com", "assets/../other"),
  );
});
test("deletion removes public origin and purges before waiting for upload signatures", async () => {
  const { ports, calls } = memory();
  const deferred = await executeMediaJob(
    { ...job(), private_delete_after: "2027-01-01T00:00:00Z" },
    ports,
    Date.parse("2026-01-01"),
  );
  assert.equal(deferred, "2027-01-01T00:00:00Z");
  assert.deepEqual(calls, [`delete:public:${key}`, `purge:${key}`]);
  calls.length = 0;
  assert.equal(
    await executeMediaJob(job(), ports, Date.parse("2027-01-01")),
    null,
  );
  assert.deepEqual(calls, [
    `delete:public:${key}`,
    `purge:${key}`,
    `delete:private:${original}`,
    `delete:private:${backup}`,
  ]);
});
test("purge failure does not remove private copies or claim success", async () => {
  const { ports, calls } = memory();
  ports.purge = async () => {
    throw new MediaJobError("purge");
  };
  await assert.rejects(
    executeMediaJob(job(), ports, Date.parse("2027-01-01")),
    (error) => error instanceof MediaJobError && error.code === "purge",
  );
  assert.deepEqual(calls, [`delete:public:${key}`]);
});
test("quarantine verifies conditional private backup before public withdrawal, and retries without source", async () => {
  const { objects, ports, calls } = memory();
  objects.set(`public:${key}`, snapshot);
  await executeMediaJob(job("quarantine"), ports);
  assert.ok(objects.has(`private:${backup}`));
  assert.ok(!objects.has(`public:${key}`));
  assert.ok(
    calls.indexOf(`head:private:${backup}`, 1) <
      calls.indexOf(`delete:public:${key}`),
  );
  calls.length = 0;
  await executeMediaJob(job("quarantine"), ports);
  assert.ok(!calls.some((call) => call.startsWith("copy:")));
});
test("quarantine can use only the verified original snapshot if public origin is absent", async () => {
  const { objects, ports } = memory();
  objects.set(`private:${original}`, snapshot);
  await executeMediaJob(job("quarantine"), ports);
  assert.ok(objects.has(`private:${backup}`));
  const missing = memory();
  await assert.rejects(
    executeMediaJob(job("quarantine"), missing.ports),
    (error) =>
      error instanceof MediaJobError && error.code === "source_missing",
  );
  assert.ok(!missing.calls.some((call) => call.startsWith("delete:")));
});
test("mismatched quarantine backup fails closed without overwriting or exposing it", async () => {
  const { objects, ports, calls } = memory();
  objects.set(`private:${backup}`, { ...snapshot, bytes: 999 });
  await assert.rejects(executeMediaJob(job("restore"), ports));
  assert.ok(!calls.some((call) => /^(copy|delete|purge):/.test(call)));
});
test("restore verifies copied public media, purges a cached 404, then removes backup", async () => {
  const { objects, ports, calls } = memory();
  objects.set(`private:${backup}`, snapshot);
  await executeMediaJob(job("restore"), ports);
  assert.deepEqual(objects.get(`public:${key}`), snapshot);
  assert.ok(!objects.has(`private:${backup}`));
  assert.ok(
    calls.indexOf(`head:public:${key}`, 2) < calls.indexOf(`purge:${key}`),
  );
  assert.ok(
    calls.indexOf(`purge:${key}`) < calls.indexOf(`delete:private:${backup}`),
  );
});
test("restore retry accepts only the exact public snapshot after backup removal, otherwise fails closed", async () => {
  const recovery = memory();
  recovery.objects.set(`public:${key}`, snapshot);
  await executeMediaJob(job("restore"), recovery.ports);
  assert.ok(!recovery.calls.some((call) => call.startsWith("copy:")));
  assert.ok(recovery.calls.includes(`purge:${key}`));
  const missing = memory();
  await assert.rejects(
    executeMediaJob(job("restore"), missing.ports),
    (error) =>
      error instanceof MediaJobError && error.code === "source_missing",
  );
  assert.ok(!missing.calls.some((call) => /^(copy|delete|purge):/.test(call)));
});
